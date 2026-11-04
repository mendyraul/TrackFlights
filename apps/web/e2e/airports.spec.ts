import { test, expect, mockData, sampleFlight } from "./helpers";
test("airport click opens cached board and full page, with official and observed status separated", async ({
  page,
}) => {
  await mockData(page);
  let calls = 0;
  await page.route("**/api/airports/MIA/board", (route) => {
    calls++;
    return route.fulfill({
      json: {
        supported: true,
        baselines: [
          {
            airport: "MIA",
            service_date: "2026-11-04",
            board: "scheduled_arrivals",
            fetched_at: new Date().toISOString(),
            partial: true,
            page_limit: 2,
            flights: [
              {
                ...sampleFlight(),
                id: "morning1",
                status: "scheduled",
                departure_gate: "A12",
                details: { codeshares: ["BA123"] },
              },
            ],
          },
        ],
        progress: [
          {
            airport: "MIA",
            service_date: "2026-11-04",
            board: "scheduled_arrivals",
            flight_key: "morning1",
            state: "Approaching",
            observed_at: new Date().toISOString(),
            evidence: {},
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open MIA airport board", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "MIA airport board panel" });
  await expect(panel.getByRole("heading", { name: /MIA · Miami/ })).toBeVisible();
  await expect(panel.getByRole("cell", { name: /Inferred: Approaching/ })).toBeVisible();
  await expect(panel.getByRole("cell", { name: /scheduled.*Delay/ })).toBeVisible();
  await panel.getByText("Flight details", { exact: true }).click();
  await expect(panel.getByText("A12", { exact: true })).toBeVisible();
  await panel.getByRole("link", { name: "Open full airport page" }).click();
  await expect(page).toHaveURL(/\/airports\/MIA$/);
  await expect(page.getByRole("heading", { name: /MIA · Miami/ })).toBeVisible();
  await page.getByRole("button", { name: "Departures", exact: true }).click();
  await expect(page.getByText(/No downloaded flights match/)).toBeVisible();
  expect(calls).toBeLessThan(5);
});
test("unsupported airport offers information without paid refresh controls", async ({ page }) => {
  await page.route("**/api/airports/OPF/board", (route) =>
    route.fulfill({ json: { supported: false, baselines: [], progress: [] } })
  );
  await page.goto("/airports/OPF");
  await expect(page.getByText("Schedule coverage not enabled for this airport.")).toBeVisible();
});

test("airport dots stay geographically aligned after resize and extra airports have no labels", async ({
  page,
}) => {
  const { showMapFilters } = await import("./helpers");
  await mockData(page, {
    flights: [
      sampleFlight({
        id: "at-mia",
        flight_iata: "AA101",
        flight_icao: "AAL101",
        icao_hex: "111111",
        latitude: 25.7959,
        longitude: -80.287,
      }),
      sampleFlight({
        id: "at-fll",
        flight_iata: "DL222",
        flight_icao: "DAL222",
        icao_hex: "222222",
        latitude: 26.0742,
        longitude: -80.1506,
      }),
    ],
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^AAL101,/ })).toBeVisible();
  await expect(page.locator(".mia-airport-marker")).toHaveCount(5);
  await expect(page.locator("[data-airport-label]")).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Open OPF airport board", exact: true })
  ).toHaveCount(0);
  const checkAlignment = async (code: string, flight: string) => {
    const dot = page
      .getByRole("button", { name: `Open ${code} airport board`, exact: true })
      .locator("[data-airport-dot]");
    const aircraft = page.getByRole("button", { name: new RegExp(`^${flight},`) });
    await expect
      .poll(async () => {
        const a = await dot.boundingBox();
        const b = await aircraft.boundingBox();
        if (!a || !b) return Infinity;
        return Math.hypot(
          a.x + a.width / 2 - b.x - b.width / 2,
          a.y + a.height / 2 - b.y - b.height / 2
        );
      })
      .toBeLessThan(1.5);
  };
  await checkAlignment("MIA", "AAL101");
  await checkAlignment("FLL", "DAL222");
  await page.setViewportSize({ width: 393, height: 600 });
  await checkAlignment("MIA", "AAL101");
  await checkAlignment("FLL", "DAL222");
  await showMapFilters(page);
  await page.getByRole("combobox", { name: "Airports", exact: true }).selectOption("all");
  const opf = page.getByRole("button", { name: "Open OPF airport board", exact: true });
  await expect(opf).toBeAttached();
  await expect(opf.locator("[data-airport-label]")).toHaveCount(0);
  await expect(page.locator("[data-airport-label]")).toHaveCount(5);
});
