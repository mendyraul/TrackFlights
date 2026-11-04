import { test, expect, sampleFlight } from "./helpers";
test("regional source colors, filters and historical details", async ({ page }) => {
  const now = Date.now();
  await page.route("**/api/flights/snapshot", (route) =>
    route.fulfill({
      json: {
        flights: [
          sampleFlight({ data_source: "adsb1090" }),
          sampleFlight({
            id: "remote",
            data_source: "flightaware",
            flight_icao: "UAL999",
            flight_iata: "UA999",
            icao_hex: "BBB999",
            latitude: 27.2,
            longitude: -81,
            updated_at: new Date(now - 3600000).toISOString(),
          }),
        ],
        dataUpdatedAt: new Date(now).toISOString(),
        schedules: [],
      },
    })
  );
  await page.goto("/");
  const local = page.getByRole("button", { name: /^AAL101,/ });
  const remote = page.getByRole("button", { name: /^UAL999,/ });
  await expect(local).toBeVisible();
  await expect(remote).toBeVisible();
  await expect(local.locator("svg")).toHaveAttribute("fill", "#39FF14");
  await expect(remote.locator("svg")).toHaveAttribute("fill", "#FFFF00");
  await expect(remote.locator("svg")).toHaveAttribute("opacity", "0.45");
  if (test.info().project.name === "mobile")
    await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("combobox", { name: "Source", exact: true }).selectOption("flightaware");
  await expect(local).toHaveCount(0);
  await remote.click();
  await expect(page.getByText(/Historical snapshot · position/)).toBeVisible();
  await page.goto("/table");
  await page.getByRole("combobox", { name: "Source", exact: true }).selectOption("adsb1090");
  await expect(page.getByRole("cell", { name: /UAL999/ })).toHaveCount(0);
});
