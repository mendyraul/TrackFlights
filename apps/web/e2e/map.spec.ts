import { test, expect } from "@playwright/test";

test("production map mounts its lazy module and immediately draws a selected route", async ({
  page,
}) => {
  const renderErrors: string[] = [];
  page.on("pageerror", (error) => renderErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /module factory|React render error/.test(message.text())) {
      renderErrors.push(message.text());
    }
  });
  await page.route("**/api/flights/snapshot", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        flights: [
          {
            id: "fixture-flight",
            flight_iata: "TEST101",
            flight_icao: "TST101",
            status: "en_route",
            direction: "arrival",
            latitude: 25.9,
            longitude: -80.3,
            altitude_ft: 4000,
            ground_speed_knots: 240,
            heading: 180,
            updated_at: new Date().toISOString(),
            origin_iata: "JFK",
            destination_iata: "MIA",
            airline_iata: null,
          },
        ],
      }),
    })
  );
  // Tile availability is independent of the lazy JS module and route rendering.
  await page.route("**/*basemaps.cartocdn.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZsAAAAASUVORK5CYII=",
        "base64"
      ),
    })
  );
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.locator(".leaflet-marker-icon").last().click();
  await expect(page.getByText("TEST101", { exact: true }).first()).toBeVisible();
  await expect(page.locator('path[stroke-dasharray="8 8"]')).toBeVisible();
  expect(renderErrors).toEqual([]);
});
