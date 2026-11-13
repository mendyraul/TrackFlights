import {
  test,
  expect,
  mockData,
  sampleFlight,
  sampleFlights,
  showMapFilters,
  expectNoOverflow,
} from "./helpers";
import type { DashboardSummary } from "../src/lib/dashboard-summary";

test("all pages populate through the main navigation", async ({ page }) => {
  await mockData(page);
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expectNoOverflow(page);
  const nav = page.getByRole("navigation", { name: "Main", exact: true });
  for (const [label, url, heading] of [
    ["Flights", "/table", "Regional aircraft"],
    ["Analytics", "/analytics", "Analytics"],
    ["Behind the Scenes", "/behind-the-scenes", "Behind the Scenes"],
    ["Map", "/", "Live map of aircraft around Miami International"],
  ]) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${url}$`));
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeAttached();
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expectNoOverflow(page);
    if (url === "/table") await expect(page.locator("tbody tr")).toHaveCount(6);
    if (url === "/analytics")
      await expect(page.getByRole("heading", { name: "Who's flying" })).toBeVisible();
  }
});

test("airplane details show telemetry, identity, route, schedule and coordinates", async ({
  page,
}) => {
  await mockData(page, { flights: [sampleFlight()] });
  await page.goto("/");
  await page.getByRole("button", { name: "AAL101, 4,500 ft, My receiver", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Details for AAL101" });
  await expect(panel).toBeVisible();
  for (const value of [
    "American Airlines",
    "4,500ft",
    "230kt",
    "180°",
    "Arriving",
    "↓ 768 fpm",
    "A00001",
    "B738",
    "N123AA",
    "JFK → MIA",
    "7:00 AM",
    "7:10 AM",
    "10:00 AM",
    "10:15 AM",
  ]) {
    await expect(panel.getByText(value, { exact: true })).toBeAttached();
  }
  await expect(panel).toContainText("25.9500°N, 80.4000°W");
  await expect(panel.getByText("Phase (inferred)", { exact: true })).toBeAttached();
  await expect(page.locator('path[stroke-dasharray="8 8"]')).toBeVisible();
  await expectNoOverflow(page);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.locator('path[stroke-dasharray="8 8"]')).toHaveCount(0);
});

test("ground and incomplete aircraft keep zero values and avoid invented details", async ({
  page,
}) => {
  const flights = sampleFlights().filter((f) => ["ground", "missing"].includes(f.id));
  await mockData(page, { flights });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^ABCDEF,/ })).toBeVisible();
  await showMapFilters(page);
  await page.getByRole("searchbox").fill("N123AB");
  await page.getByRole("button", { name: "N123AB, on ground, My receiver", exact: true }).click();
  let panel = page.getByRole("complementary");
  await expect(panel.getByText("GND", { exact: true })).toBeAttached();
  await expect(panel.getByText("0kt", { exact: true })).toBeAttached();
  await expect(panel.getByText("0°", { exact: true })).toBeAttached();
  await expect(panel.getByText("level", { exact: true })).toBeAttached();
  await expect(panel.getByText("On ground", { exact: true })).toBeAttached();
  await expect(panel.getByRole("heading", { name: "Route (schedule feed)" })).toHaveCount(0);
  await page.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("searchbox").fill("ABCDEF");
  await page
    .getByRole("button", { name: "ABCDEF, altitude unknown, My receiver", exact: true })
    .click();
  panel = page.getByRole("complementary", { name: "Details for ABCDEF" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Aircraft type", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("Registration", { exact: true })).toHaveCount(0);
  await expect(panel.getByText("—", { exact: true })).toHaveCount(2);
  await expect(panel.getByText("—kt", { exact: true })).toBeAttached();
  await expect(panel.getByText("—°", { exact: true })).toBeAttached();
  await expect(panel).not.toContainText(/undefined|NaN|Invalid Date/);
  await expect(page.locator('path[stroke-dasharray="8 8"]')).toHaveCount(0);
});

test("selected airplane refreshes without mixing another airplane's details", async ({ page }) => {
  let flights = [sampleFlight()];
  await mockData(page);
  await page.route("**/api/flights/snapshot", (route) => route.fulfill({ json: { flights } }));
  await page.goto("/");
  await page.getByRole("button", { name: "AAL101, 4,500 ft, My receiver", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Details for AAL101" });
  flights = [
    sampleFlight({
      altitude_ft: 3250,
      ground_speed_knots: 210,
      vertical_speed_fpm: -512,
      updated_at: new Date(Date.now() + 1000).toISOString(),
    }),
  ];
  // Same refresh path used when a viewer switches back to the browser tab.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(panel.getByText("3,250ft", { exact: true })).toBeVisible();
  await expect(panel.getByText("210kt", { exact: true })).toBeVisible();
  await expect(panel.getByText("↓ 512 fpm", { exact: true })).toBeAttached();
  await expect(panel.getByText("4,500ft", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "AAL101, 3,250 ft, My receiver", exact: true })
  ).toBeVisible();
});

test("map filters control which aircraft can be selected", async ({ page }) => {
  await mockData(page);
  await page.goto("/");
  // Let the lazy map frame the complete snapshot before narrowing the set.
  await expect(page.getByRole("button", { name: /^ABCDEF,/ })).toBeVisible();
  await showMapFilters(page);
  await page
    .getByRole("combobox", { name: "Operator", exact: true })
    .selectOption({ label: "American Airlines" });
  await expect(page.getByRole("button", { name: /^AAL101,/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^UAL202,/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Operator", exact: true }).selectOption("");
  await page.getByRole("combobox", { name: "Phase", exact: true }).selectOption("on-ground");
  await expect(page.getByRole("button", { name: /^N123AB,/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^AAL101,/ })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Phase", exact: true }).selectOption("all");
  await page.getByRole("searchbox").fill("abcdef");
  await expect(page.getByRole("button", { name: /^ABCDEF,/ })).toBeVisible();
  await page.getByRole("searchbox").fill("NO-SUCH-AIRCRAFT");
  await expect(page.locator('.leaflet-marker-icon[role=button][title*=","]')).toHaveCount(0);
});

test("flight board populates, sorts and combines search, operator and phase filters", async ({
  page,
}) => {
  await mockData(page);
  await page.goto("/table");
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(6);
  const arrival = rows.filter({ hasText: "AAL101" });
  for (const value of [
    "American Airlines",
    "A00001",
    "Arriving",
    "JFK → MIA",
    "4,500 ft",
    "230 kt",
    "180°",
    "↓ 768 fpm",
  ])
    await expect(arrival).toContainText(value);
  await expect(rows.filter({ hasText: "DAL404" })).toContainText("—");
  await page.getByRole("button", { name: "Altitude", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Altitude" })).toHaveAttribute(
    "aria-sort",
    "ascending"
  );
  await page.getByRole("button", { name: "Altitude", exact: true }).click();
  await expect(rows.first()).toContainText("BAW303");
  await page.getByLabel("Search", { exact: true }).fill("american");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("AAL101");
  await page.getByLabel("Search", { exact: true }).fill("");
  await page
    .getByRole("combobox", { name: "Operator", exact: true })
    .selectOption({ label: "United Airlines" });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("UAL202");
  await page.getByRole("button", { name: "Arriving", exact: true }).click();
  await expect(page.getByText("No aircraft match these filters.", { exact: true })).toBeVisible();
  await expectNoOverflow(page);
});

function populatedSummary(): DashboardSummary {
  const hour = Date.UTC(2026, 10, 3, 15);
  const weather = {
    id: "weather",
    airport_iata: "MIA",
    observed_at: new Date().toISOString(),
    temperature_c: 27,
    feels_like_c: 29,
    wind_speed_knots: 12,
    wind_direction_deg: 90,
    wind_gust_knots: 18,
    visibility_km: 16,
    precipitation_mm: 0,
    precipitation_probability: 0,
    humidity_pct: 65,
    cloud_coverage_pct: 20,
    weather_code: 0,
    weather_description: "Clear sky",
    is_thunderstorm: false,
    is_fog: false,
    is_freezing: false,
    pressure_hpa: 1015,
    data_source: "fixture",
  };
  return {
    weatherCurrent: weather,
    weatherForecast: [],
    lastUpdate: Date.now(),
    trafficHourly: [0, 1, 2].map((i) => ({
      hour: new Date(hour + i * 3600000).toISOString(),
      unique_aircraft: 20 + i,
      arriving: 8,
      departing: 6,
      overflights: 4 + i,
      on_ground: 2,
      peak_concurrent: 10,
      max_range_km: 80 + i,
      polls: 240,
      updated_at: new Date().toISOString(),
      temp_c: null,
      wind_kt: null,
      gust_kt: null,
      precip_mm: null,
      visibility_km: null,
      is_thunderstorm: null,
    })),
    trafficForecast: [
      {
        hour: new Date(hour + 3 * 3600000).toISOString(),
        predicted_aircraft: 25,
        model_version: "fixture-v1",
        model_mae: 2.5,
        baseline_mae: 4,
      },
    ],
    analyticsHourly: [
      {
        id: "hour",
        hour: new Date(hour).toISOString(),
        direction: "arrival",
        total_flights: 20,
        on_time: 15,
        delayed: 5,
        cancelled: 0,
        diverted: 0,
        avg_delay_minutes: 4,
        max_delay_minutes: 15,
      },
    ],
    analyticsDaily: [
      {
        id: "day",
        date: "2026-11-03",
        direction: "arrival",
        total_flights: 200,
        on_time: 150,
        delayed: 50,
        cancelled: 0,
        diverted: 0,
        avg_delay_minutes: 4,
        top_delayed_airline: "AA",
        busiest_hour: 15,
      },
    ],
    anomalies: [
      {
        id: "alert",
        anomaly_type: "traffic_high",
        severity: "medium",
        title: "Busier than usual",
        description: "Traffic is above the usual level for this hour.",
        affected_flights: [],
        affected_airlines: [],
        affected_count: 0,
        metric_name: "unique_aircraft",
        metric_value: 22,
        baseline_value: 10,
        deviation_pct: 120,
        is_active: true,
        detected_at: new Date().toISOString(),
        resolved_at: null,
      },
    ],
  };
}

test("analytics renders live counts, charts, weather, history, forecast and alerts", async ({
  page,
}) => {
  await mockData(page, { flights: sampleFlights() }, populatedSummary());
  await page.goto("/analytics");
  await expect(page.getByText("In range", { exact: true }).locator("..")).toContainText("6");
  for (const heading of [
    "Who's flying",
    "Altitude bands (ft)",
    "Aircraft per hour, with forecast",
    "Weather at MIA",
    "Active alerts",
    "Delay Trends (Hourly)",
    "Traffic Volume (Daily)",
  ]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByText("Busiest hour:", { exact: false })).toContainText("22 aircraft");
  await expect(page.getByText("Busiest hour:", { exact: false })).toContainText("82 km");
  for (const value of [
    "27°C",
    "12 kts",
    "E G18",
    "16 km",
    "0 mm",
    "20%",
    "65%",
    "Busier than usual",
  ])
    await expect(page.getByText(value, { exact: true })).toBeVisible();
  await expect(page.locator(".recharts-wrapper > .recharts-surface")).toHaveCount(5);
  // Scope to the x-axis: a Recharts tooltip can also render "Nov 3" and trip strict mode.
  await expect(
    page.locator(".recharts-xAxis .recharts-cartesian-axis-tick-value").getByText("Nov 3", {
      exact: true,
    })
  ).toBeVisible();
  await expect(page.getByText(/off by 2.5 aircraft\/hour/)).toBeVisible();
  await expectNoOverflow(page);
});

test("empty data gives useful states on map, flights and analytics", async ({ page }) => {
  await mockData(
    page,
    { flights: [] },
    {
      analyticsHourly: [],
      analyticsDaily: [],
      trafficHourly: [],
      trafficForecast: [],
      weatherCurrent: null,
      weatherForecast: [],
      anomalies: [],
      lastUpdate: Date.now(),
    }
  );
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await page.goto("/table");
  await expect(page.getByText("No aircraft in range right now.", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Route", exact: true })).toHaveCount(0);
  await page.goto("/analytics");
  await expect(page.getByText("No aircraft to break down yet.", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/^Collecting data — hourly history/)).toBeVisible();
  await expect(page.getByText("No weather data available", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schedule history (AeroAPI)" })).toHaveCount(0);
});

test("analytics history failure leaves current aircraft usable", async ({ page }) => {
  await mockData(page);
  await page.route("**/api/dashboard/summary", (route) =>
    route.fulfill({ status: 503, json: { error: "private database failure" } })
  );
  await page.goto("/analytics");
  await expect(page.getByText("In range", { exact: true }).locator("..")).toContainText("6");
  await expect(page.getByText(/^History is unavailable right now/)).toBeVisible();
  await expect(page.getByText("private database failure", { exact: false })).toHaveCount(0);
});
