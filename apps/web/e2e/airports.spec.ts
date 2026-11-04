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
