import { describe, it, expect } from "vitest";
import { visibleFlights } from "./aircraft";
import type { Flight } from "@/types/database";
const now = Date.now();
const flight = (source: "adsb1090" | "flightaware", age: number, hex = "ABC123") =>
  ({
    id: source,
    data_source: source,
    icao_hex: hex,
    updated_at: new Date(now - age).toISOString(),
  }) as Flight;
describe("mixed source visibility", () => {
  it("keeps a daily provider snapshot alongside current receiver flights", () => {
    expect(
      visibleFlights(
        [flight("adsb1090", 1000), flight("flightaware", 3600000, "DEF123")],
        "live",
        now
      )
    ).toHaveLength(2);
  });
  it("prefers current receiver observation of the same airframe", () => {
    expect(
      visibleFlights([flight("adsb1090", 1000), flight("flightaware", 500)], "live", now).map(
        (f) => f.id
      )
    ).toEqual(["adsb1090"]);
  });
  it("expires provider observations at 48 hours even with the receiver offline", () => {
    expect(visibleFlights([flight("flightaware", 48 * 3600000)], "offline", now)).toEqual([]);
  });
  it("does not label future provider observations as current", () => {
    expect(visibleFlights([flight("flightaware", -60000)], "live", now)).toEqual([]);
  });
});

it("matches registration only when one source lacks hex", () => {
  const local = { ...flight("adsb1090", 1000), aircraft_registration: "N123AA" };
  const remote = { ...flight("flightaware", 500), icao_hex: null, aircraft_registration: "N123AA" };
  expect(visibleFlights([local, remote], "live", now).map((f) => f.id)).toEqual(["adsb1090"]);
  expect(visibleFlights([local, { ...remote, icao_hex: "FFFFFF" }], "live", now)).toHaveLength(2);
});
