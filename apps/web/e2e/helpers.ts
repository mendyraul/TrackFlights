import { test as base, expect, type Page } from "@playwright/test";
import existingSnapshot from "./fixtures/existing-snapshot.json";
import existingSummary from "./fixtures/existing-summary.json";
import type { Flight } from "../src/types/database";

// Fail every new journey on uncaught browser errors, including errors during navigation.
export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(errors, "uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export function sampleFlight(overrides: Partial<Flight> = {}): Flight {
  return {
    ...existingSnapshot.flights[0],
    id: "arrival",
    flight_iata: "AA101",
    flight_icao: "AAL101",
    icao_hex: "A00001",
    latitude: 25.95,
    longitude: -80.4,
    altitude_ft: 4500,
    ground_speed_knots: 230,
    heading: 180,
    vertical_speed_fpm: -768,
    aircraft_icao: "B738",
    aircraft_registration: "N123AA",
    origin_iata: "JFK",
    destination_iata: "MIA",
    scheduled_departure: "2026-11-03T12:00:00Z",
    actual_departure: "2026-11-03T12:10:00Z",
    scheduled_arrival: "2026-11-03T15:00:00Z",
    estimated_arrival: "2026-11-03T15:15:00Z",
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Flight;
}

export function sampleFlights(): Flight[] {
  return [
    sampleFlight(),
    sampleFlight({
      id: "departure",
      flight_iata: "UA202",
      flight_icao: "UAL202",
      icao_hex: "A00002",
      latitude: 25.6,
      longitude: -80.1,
      altitude_ft: 7500,
      ground_speed_knots: 280,
      heading: 140,
      vertical_speed_fpm: 1500,
      origin_iata: "MIA",
      destination_iata: "ORD",
    }),
    sampleFlight({
      id: "overflight",
      flight_iata: "BA303",
      flight_icao: "BAW303",
      icao_hex: "A00003",
      latitude: 26.2,
      longitude: -80.6,
      altitude_ft: 35000,
      ground_speed_knots: 450,
      vertical_speed_fpm: 0,
    }),
    sampleFlight({
      id: "ground",
      flight_iata: "N123AB",
      flight_icao: "N123AB",
      icao_hex: "A00004",
      latitude: 25.7959,
      longitude: -80.287,
      altitude_ft: 0,
      ground_speed_knots: 0,
      heading: 0,
      vertical_speed_fpm: 0,
      origin_iata: null,
      destination_iata: null,
    }),
    sampleFlight({
      id: "missing",
      flight_iata: "ABCDEF",
      flight_icao: null,
      icao_hex: "ABCDEF",
      latitude: 26.1,
      longitude: -80.8,
      altitude_ft: null,
      ground_speed_knots: null,
      heading: null,
      vertical_speed_fpm: null,
      aircraft_icao: null,
      aircraft_registration: null,
      origin_iata: null,
      destination_iata: null,
    }),
    sampleFlight({
      id: "no-position",
      flight_iata: "DL404",
      flight_icao: "DAL404",
      icao_hex: "A00006",
      latitude: null,
      longitude: null,
      altitude_ft: null,
      origin_iata: null,
      destination_iata: null,
    }),
  ];
}

export async function mockData(
  page: Page,
  snapshot: object = { flights: sampleFlights() },
  summary: object = existingSummary
) {
  await page.route("**/api/flights/snapshot", (route) => route.fulfill({ json: snapshot }));
  await page.route("**/api/dashboard/summary", (route) => route.fulfill({ json: summary }));
  // Keep these checks independent of third-party tile and airline-logo services.
  await page.route(/basemaps\.cartocdn\.com|services\.arcgisonline\.com/, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZsAAAAASUVORK5CYII=",
        "base64"
      ),
    })
  );
}

export async function showMapFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") {
    await toggle.click();
  }
}

export async function expectNoOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
}
