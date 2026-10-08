import { describe, expect, it } from "vitest";
import { formatCoords, formatVerticalSpeed } from "@/lib/geo";

describe("formatCoords", () => {
  it("derives hemispheres from the sign instead of hardcoding N/W", () => {
    // Regression: a western longitude used to render as "-80.2036°W".
    expect(formatCoords(26.0771, -80.2036)).toBe("26.0771°N, 80.2036°W");
  });

  it("handles all four quadrants", () => {
    expect(formatCoords(51.47, -0.4543)).toBe("51.4700°N, 0.4543°W");
    expect(formatCoords(50.0379, 8.5622)).toBe("50.0379°N, 8.5622°E");
    expect(formatCoords(-33.393, -70.7858)).toBe("33.3930°S, 70.7858°W");
    expect(formatCoords(-33.9249, 18.4241)).toBe("33.9249°S, 18.4241°E");
  });

  it("treats the equator and prime meridian as N/E", () => {
    expect(formatCoords(0, 0)).toBe("0.0000°N, 0.0000°E");
  });

  it("respects the digits argument", () => {
    expect(formatCoords(26.0771, -80.2036, 2)).toBe("26.08°N, 80.20°W");
  });

  it("returns a placeholder for missing or non-finite values", () => {
    expect(formatCoords(null, -80)).toBe("--");
    expect(formatCoords(26, null)).toBe("--");
    expect(formatCoords(undefined, undefined)).toBe("--");
    expect(formatCoords(Number.NaN, 0)).toBe("--");
    expect(formatCoords(0, Number.POSITIVE_INFINITY)).toBe("--");
  });
});

describe("formatVerticalSpeed", () => {
  it("marks climbs and descents", () => {
    expect(formatVerticalSpeed(832)).toBe("↑ 832 fpm");
    expect(formatVerticalSpeed(-832)).toBe("↓ 832 fpm");
  });

  it("calls a zero rate level flight rather than a descent", () => {
    expect(formatVerticalSpeed(0)).toBe("level");
  });

  it("returns null when there is no reading", () => {
    expect(formatVerticalSpeed(null)).toBeNull();
    expect(formatVerticalSpeed(undefined)).toBeNull();
    expect(formatVerticalSpeed(Number.NaN)).toBeNull();
  });
});
