import { describe, expect, it } from "vitest";
import { broadcastCallsign, describeCallsign } from "./airlines";

describe("describeCallsign", () => {
  it("maps airline callsign prefixes", () => {
    expect(describeCallsign("AAL1234").airline).toEqual({
      icao: "AAL",
      iata: "AA",
      name: "American Airlines",
    });
    expect(describeCallsign("cmp 301".replace(" ", "")).label).toBe("Copa Airlines");
  });

  it("labels US registrations as private / GA", () => {
    expect(describeCallsign("N942JS").kind).toBe("private");
  });

  it("keeps unknown operators visible without guessing", () => {
    expect(describeCallsign("CSB7515")).toMatchObject({
      kind: "unknown-operator",
      label: "Operator CSB",
    });
  });

  it("handles a missing callsign", () => {
    expect(describeCallsign(null).kind).toBe("none");
    expect(describeCallsign("  ").kind).toBe("none");
  });
});

describe("broadcastCallsign", () => {
  it("prefers the raw callsign", () => {
    expect(broadcastCallsign({ flight_icao: "DAL1056", flight_iata: "DL1056" })).toBe("DAL1056");
  });

  it("returns null when the row is keyed by hex because no callsign was heard", () => {
    expect(
      broadcastCallsign({ flight_icao: null, flight_iata: "A32C3E", icao_hex: "A32C3E" })
    ).toBeNull();
  });
});
