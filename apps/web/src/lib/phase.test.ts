import { describe, expect, it } from "vitest";
import { KMIA, bearingDeg, distanceKm, inferPhase } from "./phase";

// A point ~30 km due east of MIA, over the ocean.
const EAST: [number, number] = [25.79325, -79.99];

describe("geometry", () => {
  it("measures distance and bearing", () => {
    expect(distanceKm(KMIA[0], KMIA[1], EAST[0], EAST[1])).toBeCloseTo(30.3, 0);
    // From the east point, MIA is due west.
    expect(bearingDeg(EAST[0], EAST[1], KMIA[0], KMIA[1])).toBeCloseTo(270, 0);
  });
});

describe("inferPhase", () => {
  const base = { latitude: EAST[0], longitude: EAST[1] };

  it("calls a descending aircraft heading at MIA an arrival", () => {
    expect(
      inferPhase({ ...base, altitude_ft: 6000, vertical_speed_fpm: -1200, heading: 270 })
    ).toBe("arriving");
  });

  it("calls a climbing aircraft heading away a departure", () => {
    expect(inferPhase({ ...base, altitude_ft: 8000, vertical_speed_fpm: 2000, heading: 90 })).toBe(
      "departing"
    );
  });

  it("does not call a climbing aircraft pointed at MIA a departure (go-around / other field)", () => {
    expect(inferPhase({ ...base, altitude_ft: 3000, vertical_speed_fpm: 1500, heading: 270 })).toBe(
      "overflight"
    );
  });

  it("counts a descent on a downwind leg (flying away from MIA) as an arrival", () => {
    expect(inferPhase({ ...base, altitude_ft: 5000, vertical_speed_fpm: -1700, heading: 90 })).toBe(
      "arriving"
    );
  });

  it("treats a high cruising jet over Miami as an overflight", () => {
    expect(
      inferPhase({
        latitude: KMIA[0],
        longitude: KMIA[1] + 0.05,
        altitude_ft: 35000,
        vertical_speed_fpm: 0,
        heading: 180,
      })
    ).toBe("overflight");
  });

  it("treats level flight in the terminal area (holding) as neither", () => {
    expect(inferPhase({ ...base, altitude_ft: 7000, vertical_speed_fpm: 0, heading: 0 })).toBe(
      "overflight"
    );
  });

  it("catches a level final approach", () => {
    expect(
      inferPhase({
        latitude: KMIA[0],
        longitude: KMIA[1] + 0.1,
        altitude_ft: 1500,
        vertical_speed_fpm: -100,
        heading: 270,
      })
    ).toBe("arriving");
  });

  it("handles ground and missing data", () => {
    expect(inferPhase({ ...base, altitude_ft: 0, vertical_speed_fpm: 0, heading: 90 })).toBe(
      "on-ground"
    );
    expect(
      inferPhase({
        latitude: null,
        longitude: null,
        altitude_ft: 5000,
        vertical_speed_fpm: 0,
        heading: 0,
      })
    ).toBe("unknown");
  });
});
