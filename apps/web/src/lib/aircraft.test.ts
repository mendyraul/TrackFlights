import { describe, expect, it } from "vitest";
import type { Flight } from "@/types/database";
import { dedupeByHex, visibleFlights } from "./aircraft";

const row = (over: Partial<Flight>): Flight =>
  ({
    id: "x",
    flight_iata: "X",
    flight_icao: null,
    updated_at: "2026-10-20T12:00:00Z",
    ...over,
  }) as Flight;

describe("dedupeByHex", () => {
  it("keeps one row per aircraft, newest first, then the one with a callsign", () => {
    const rows = [
      row({ id: "hex-only", flight_iata: "738100", icao_hex: "738100" }),
      row({ id: "named", flight_iata: "LY118", flight_icao: "ELY118", icao_hex: "738100" }),
      row({ id: "other", flight_iata: "AA1", flight_icao: "AAL1", icao_hex: "A00001" }),
    ];
    expect(
      dedupeByHex(rows)
        .map((r) => r.id)
        .sort()
    ).toEqual(["named", "other"]);

    const newer = row({
      id: "hex-newer",
      flight_iata: "738100",
      icao_hex: "738100",
      updated_at: "2026-10-20T12:00:30Z",
    });
    expect(
      dedupeByHex([...rows, newer])
        .map((r) => r.id)
        .sort()
    ).toEqual(["hex-newer", "other"]);
  });

  it("keeps rows without a hex (schedule-only rows)", () => {
    expect(dedupeByHex([row({ id: "a" }), row({ id: "b" })])).toHaveLength(2);
  });
});

describe("visibleFlights", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const rows = [
    row({ id: "fresh", icao_hex: "A1", updated_at: "2026-10-20T11:59:00Z" }),
    row({ id: "old", icao_hex: "A2", updated_at: "2026-10-20T10:00:00Z" }),
  ];

  it("shows only recently heard aircraft while live", () => {
    expect(visibleFlights(rows, "live", now).map((r) => r.id)).toEqual(["fresh"]);
  });

  it("shows the last known picture while offline", () => {
    expect(visibleFlights(rows, "offline", now)).toHaveLength(2);
  });
});

describe("toAircraft phase source", () => {
  const base = {
    latitude: 25.79325,
    longitude: -79.99,
    altitude_ft: 6000,
    vertical_speed_fpm: -1200,
    heading: 270,
  };

  it("uses the ingestor's model phase when present", async () => {
    const { toAircraft } = await import("./aircraft");
    const a = toAircraft(row({ ...base, model_phase: "other-airport" }));
    expect(a.phase).toBe("other-airport");
    expect(a.phaseFromModel).toBe(true);
  });

  it("falls back to the rules without a (valid) model phase", async () => {
    const { toAircraft } = await import("./aircraft");
    expect(toAircraft(row(base)).phase).toBe("arriving");
    const junk = toAircraft(row({ ...base, model_phase: "teleporting" }));
    expect(junk.phase).toBe("arriving");
    expect(junk.phaseFromModel).toBe(false);
  });
});
