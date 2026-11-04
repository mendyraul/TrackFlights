import fs from "node:fs";
import { test, expect, mockData, showMapFilters, expectNoOverflow } from "./helpers";
import savedSnapshot from "./fixtures/existing-snapshot.json";
import savedSummary from "./fixtures/existing-summary.json";
import type { Flight } from "../src/types/database";

// Optional complete API captures let us audit every currently stored aircraft
// without committing a large fixture or making CI depend on the live service.
const snapshot = process.env.FLIGHT_SNAPSHOT_PATH
  ? JSON.parse(fs.readFileSync(process.env.FLIGHT_SNAPSHOT_PATH, "utf8"))
  : savedSnapshot;
const summary = process.env.DASHBOARD_SUMMARY_PATH
  ? JSON.parse(fs.readFileSync(process.env.DASHBOARD_SUMMARY_PATH, "utf8"))
  : savedSummary;

// Independent oracle: newest row per airframe, callsign wins timestamp ties.
const rows = [...(snapshot.flights as Flight[])]
  .sort(
    (a, b) =>
      Date.parse(b.updated_at) - Date.parse(a.updated_at) ||
      Number(Boolean(b.flight_icao)) - Number(Boolean(a.flight_icao))
  )
  .filter(
    (f, i, all) =>
      !f.icao_hex ||
      all.findIndex((other) => other.icao_hex?.toUpperCase() === f.icao_hex?.toUpperCase()) === i
  );

const ident = (f: Flight) => f.flight_icao?.trim() || f.icao_hex?.toUpperCase() || f.flight_iata;
const altitude = (f: Flight) =>
  f.altitude_ft === 0 ? "GND" : (f.altitude_ft?.toLocaleString("en-US") ?? "—");
const verticalRate = (f: Flight) =>
  f.vertical_speed_fpm == null
    ? "—"
    : f.vertical_speed_fpm === 0
      ? "level"
      : `${f.vertical_speed_fpm > 0 ? "↑" : "↓"} ${Math.abs(f.vertical_speed_fpm).toLocaleString("en-US")} fpm`;

test("existing snapshot fills the board with the newest telemetry per airframe", async ({
  page,
}) => {
  await mockData(page, snapshot, summary);
  await page.goto("/table");
  await expect(page.locator("tbody tr")).toHaveCount(rows.length);
  const rendered = await page.locator("tbody tr").allTextContents();
  for (const f of rows) {
    const row = rendered.find((text) => text.includes(f.icao_hex?.toUpperCase() ?? ident(f)));
    expect(row, `board row for ${ident(f)}`).toBeDefined();
    for (const value of [
      f.icao_hex?.toUpperCase(),
      f.flight_icao,
      altitude(f),
      f.ground_speed_knots != null ? `${f.ground_speed_knots} kt` : "—",
      f.heading != null ? `${Math.round(f.heading)}°` : "—",
      verticalRate(f),
    ]) {
      if (value) expect(row, `${ident(f)} telemetry`).toContain(value);
    }
  }
  await expectNoOverflow(page);
});

test("every existing airplane opens its own telemetry and schedule details", async ({ page }) => {
  test.setTimeout(180_000);
  await mockData(page, snapshot, summary);
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await showMapFilters(page);
  for (const f of rows.filter((f) => f.latitude != null && f.longitude != null)) {
    await test.step(`select ${ident(f)} / ${f.icao_hex}`, async () => {
      await showMapFilters(page);
      await page.getByRole("searchbox").fill(f.icao_hex ?? ident(f));
      const toggle = page.getByRole("button", { name: /^Filters/ });
      if (await toggle.isVisible()) await toggle.click();
      const marker = page
        .locator(".leaflet-marker-icon[role=button]")
        .filter({ has: page.locator("svg") });
      await expect(marker).toHaveCount(1);
      await marker.click();
      const panel = page.getByRole("complementary", {
        name: `Details for ${ident(f)}`,
        exact: true,
      });
      await expect(panel).toBeVisible();
      const text = await panel.textContent();
      for (const value of [
        altitude(f),
        f.ground_speed_knots?.toString() ?? "—",
        f.icao_hex?.toUpperCase(),
        verticalRate(f),
        f.aircraft_icao,
        f.aircraft_registration,
      ]) {
        if (value) expect(text, `details for ${ident(f)}`).toContain(value);
      }
      await expect(panel).toContainText(
        `${Math.abs(f.latitude!).toFixed(4)}°${f.latitude! >= 0 ? "N" : "S"}, ${Math.abs(f.longitude!).toFixed(4)}°${f.longitude! >= 0 ? "E" : "W"}`
      );
      if (f.origin_iata || f.destination_iata) {
        await expect(panel).toContainText(`${f.origin_iata ?? "?"} → ${f.destination_iata ?? "?"}`);
        for (const time of [
          f.scheduled_departure,
          f.actual_departure,
          f.scheduled_arrival,
          f.actual_arrival || f.estimated_arrival,
        ].filter(Boolean)) {
          expect(text).toContain(
            new Date(time!).toLocaleTimeString("en-US", {
              timeZone: "America/New_York",
              hour: "numeric",
              minute: "2-digit",
            })
          );
        }
      } else {
        await expect(panel.getByRole("heading", { name: "Route (schedule feed)" })).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Close details" }).click();
    });
  }
  await expectNoOverflow(page);
});

test("existing data gives consistent analytics totals and honest empty history", async ({
  page,
}) => {
  await mockData(page, snapshot, summary);
  await page.goto("/analytics");
  await expect(
    page.getByText("In range", { exact: true }).locator("..").locator("p").nth(1)
  ).toHaveText(String(rows.length));
  await expect(
    page.getByRole("heading", { name: "Last known picture", exact: true })
  ).toBeVisible();
  await expect(page.getByText(/^Collecting data — hourly history/)).toBeVisible();
  await expect(page.getByText("Last reading", { exact: false })).toBeVisible();
  await expect(
    page.getByText(`${summary.weatherCurrent.temperature_c}°C`, { exact: true })
  ).toBeVisible();
  await expectNoOverflow(page);
});
