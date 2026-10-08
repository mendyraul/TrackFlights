import { describe, expect, it } from "vitest";
import { AIRPORTS, SURROUNDING_AIRPORTS, airportCoords, lookupAirport } from "@/lib/airports";

describe("AIRPORTS dataset", () => {
  it("has no duplicate IATA codes", () => {
    const codes = AIRPORTS.map((a) => a.iata);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has no duplicate ICAO codes", () => {
    const codes = AIRPORTS.map((a) => a.icao);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses well-formed codes", () => {
    for (const airport of AIRPORTS) {
      expect(airport.iata, airport.iata).toMatch(/^[A-Z0-9]{3}$/);
      expect(airport.icao, airport.iata).toMatch(/^[A-Z0-9]{4}$/);
    }
  });

  it("keeps every coordinate in range and non-null", () => {
    for (const airport of AIRPORTS) {
      expect(Math.abs(airport.lat), airport.iata).toBeLessThanOrEqual(90);
      expect(Math.abs(airport.lon), airport.iata).toBeLessThanOrEqual(180);
      // A 0,0 entry means a dropped coordinate, not an airport in the Atlantic.
      expect(airport.lat === 0 && airport.lon === 0, airport.iata).toBe(false);
    }
  });

  it("gives every airport a name, city, country and timezone", () => {
    for (const airport of AIRPORTS) {
      expect(airport.name.length, airport.iata).toBeGreaterThan(0);
      expect(airport.city.length, airport.iata).toBeGreaterThan(0);
      expect(airport.country.length, airport.iata).toBeGreaterThan(0);
      // Validate against the runtime's IANA database rather than a shape
      // regex — zones legitimately have three segments (America/Indiana/...).
      expect(
        () => new Intl.DateTimeFormat("en-US", { timeZone: airport.tz }),
        airport.iata
      ).not.toThrow();
    }
  });
});

describe("SURROUNDING_AIRPORTS", () => {
  it("includes MIA", () => {
    expect(SURROUNDING_AIRPORTS.map((a) => a.iata)).toContain("MIA");
  });

  it("covers the nearby South Florida fields", () => {
    const codes = SURROUNDING_AIRPORTS.map((a) => a.iata);
    for (const code of ["FLL", "PBI", "FXE", "OPF", "TMB", "EYW"]) {
      expect(codes, code).toContain(code);
    }
  });

  it("stays local — every blob is within 800 km of MIA", () => {
    const mia = lookupAirport("MIA")!;
    for (const airport of SURROUNDING_AIRPORTS) {
      const dLat = (airport.lat - mia.lat) * 111;
      const dLon = (airport.lon - mia.lon) * 111 * Math.cos((mia.lat * Math.PI) / 180);
      expect(Math.hypot(dLat, dLon), airport.iata).toBeLessThan(800);
    }
  });

  it("excludes long-haul destinations", () => {
    const codes = SURROUNDING_AIRPORTS.map((a) => a.iata);
    for (const code of ["LHR", "GRU", "BOG", "LAX"]) {
      expect(codes, code).not.toContain(code);
    }
  });
});

describe("lookupAirport", () => {
  it("finds airports by code, case-insensitively", () => {
    expect(lookupAirport("MIA")?.name).toBe("Miami International Airport");
    expect(lookupAirport("mia")?.iata).toBe("MIA");
    expect(lookupAirport(" fll ")?.iata).toBe("FLL");
  });

  it("returns null for unknown or missing codes", () => {
    expect(lookupAirport("ZZZ")).toBeNull();
    expect(lookupAirport(null)).toBeNull();
    expect(lookupAirport(undefined)).toBeNull();
    expect(lookupAirport("")).toBeNull();
  });
});

describe("airportCoords", () => {
  it("returns MIA's reference point", () => {
    expect(airportCoords("MIA")).toEqual([25.7959, -80.287]);
  });

  it("returns null for unknown codes so callers can skip the route line", () => {
    expect(airportCoords("ZZZ")).toBeNull();
    expect(airportCoords(null)).toBeNull();
  });
});
