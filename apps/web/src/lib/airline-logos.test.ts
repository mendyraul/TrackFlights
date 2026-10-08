import { describe, expect, it } from "vitest";
import { airlineInitials, airlineLogoPath, hasAirlineLogo } from "@/lib/airline-logos";

describe("airlineLogoPath", () => {
  it("resolves carriers we vendored logos for", () => {
    expect(airlineLogoPath("AA")).toBe("/airlines/american-airlines.svg");
    expect(airlineLogoPath("B6")).toBe("/airlines/jetblue-airways.svg");
    expect(airlineLogoPath("DL")).toBe("/airlines/delta-air-lines.svg");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(airlineLogoPath("b6")).toBe("/airlines/jetblue-airways.svg");
    expect(airlineLogoPath(" aa ")).toBe("/airlines/american-airlines.svg");
  });

  it("returns null for carriers with no logo in the set", () => {
    // MIA's Latin American and European carriers are absent upstream.
    for (const code of ["LA", "AV", "CM", "BA", "IB", "AF", "F9"]) {
      expect(airlineLogoPath(code), code).toBeNull();
    }
  });

  it("returns null for missing input", () => {
    expect(airlineLogoPath(null)).toBeNull();
    expect(airlineLogoPath(undefined)).toBeNull();
    expect(airlineLogoPath("")).toBeNull();
  });
});

describe("hasAirlineLogo", () => {
  it("mirrors airlineLogoPath", () => {
    expect(hasAirlineLogo("UA")).toBe(true);
    expect(hasAirlineLogo("AV")).toBe(false);
    expect(hasAirlineLogo(null)).toBe(false);
  });
});

describe("airlineInitials", () => {
  it("prefers the IATA code", () => {
    expect(airlineInitials("AV", "Avianca")).toBe("AV");
    expect(airlineInitials("av", "Avianca")).toBe("AV");
  });

  it("falls back to initials from the airline name", () => {
    expect(airlineInitials(null, "Avianca")).toBe("A");
    expect(airlineInitials(null, "British Airways")).toBe("BA");
    expect(airlineInitials("", "LATAM Airlines Group")).toBe("LA");
  });

  it("degrades to a dash when nothing identifies the airline", () => {
    expect(airlineInitials(null, null)).toBe("—");
    expect(airlineInitials("", "   ")).toBe("—");
  });
});
