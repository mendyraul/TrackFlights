import { describe, expect, it } from "vitest";
import type { Flight } from "@/types/database";
import { toAircraft } from "@/lib/aircraft";
import { summarize } from "./LiveTraffic";

const flight = (over: Partial<Flight>): Flight =>
  ({
    id: Math.random().toString(36),
    flight_iata: "X",
    flight_icao: null,
    latitude: 25.79325,
    longitude: -79.99, // ~30 km east of MIA
    altitude_ft: 6000,
    vertical_speed_fpm: 0,
    heading: 0,
    updated_at: "2026-10-20T12:00:00Z",
    ...over,
  }) as Flight;

describe("summarize", () => {
  it("counts phases, operators, bands and extremes", () => {
    const s = summarize(
      [
        flight({ flight_icao: "AAL1", vertical_speed_fpm: -1500, heading: 270 }),
        flight({ flight_icao: "AAL2", altitude_ft: 36000 }),
        flight({ flight_icao: "N123AB", altitude_ft: 0 }),
      ].map(toAircraft)
    );

    expect(s.total).toBe(3);
    expect(s.arriving).toBe(1);
    expect(s.onGround).toBe(1);
    expect(s.highestFt).toBe(36000);
    expect(Math.round(s.farthestKm!)).toBe(30);
    expect(s.operators[0]).toEqual({ name: "American Airlines", aircraft: 2 });
    expect(s.altitudeBands.find((b) => b.band === "Ground")?.aircraft).toBe(1);
    expect(s.altitudeBands.find((b) => b.band === "30k+")?.aircraft).toBe(1);
  });

  it("groups operators past the top eight", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      flight({ flight_icao: `OP${String.fromCharCode(65 + i)}1` })
    );
    const s = summarize(many.map(toAircraft));
    expect(s.operators).toHaveLength(9);
    expect(s.operators.at(-1)).toEqual({ name: "Everyone else", aircraft: 2 });
  });
});
