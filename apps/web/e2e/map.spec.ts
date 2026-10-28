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
  await page.getByRole("button", { name: /^TST101,/ }).click();
  await expect(page.getByText("TST101", { exact: true }).first()).toBeVisible();
  await expect(page.locator('path[stroke-dasharray="8 8"]')).toBeVisible();
  expect(renderErrors).toEqual([]);
});

test("a fresh receiver heartbeat cannot hide stale positions or reveal technical errors", async ({
  page,
}) => {
  await page.route("**/api/flights/snapshot", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        flights: [
          {
            id: "old-flight",
            flight_iata: "TEST101",
            flight_icao: "TST101",
            status: "en_route",
            latitude: 25.9,
            longitude: -80.3,
            altitude_ft: 4000,
            heading: 180,
            updated_at: "2026-07-19T11:00:00Z",
            origin_iata: "JFK",
            destination_iata: "MIA",
          },
        ],
        receiver: { lastPollAt: new Date().toISOString(), received: 1, inRange: 1 },
      }),
    })
  );
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(
    page.getByText("Flight data is temporarily unavailable", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Receiver online", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: /^TST101,/ }).click();
  await expect(page.locator('path[stroke-dasharray="8 8"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("API outages keep the map mounted with a generic public error", async ({ page }) => {
  await page.route("**/api/flights/snapshot", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "internal database connection stack" }),
    })
  );
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(
    page.getByText("Flight data is temporarily unavailable", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("internal database connection stack", { exact: false })).toHaveCount(
    0
  );
});
