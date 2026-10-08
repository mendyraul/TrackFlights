import { describe, expect, it } from "vitest";
import { resolveBasemap } from "@/lib/basemap";

describe("resolveBasemap", () => {
  it("defaults to a keyless dark basemap", () => {
    const map = resolveBasemap({});
    expect(map.url).toContain("arcgisonline.com");
    expect(map.url).toContain("{z}");
    expect(map.attribution).toContain("Esri");
  });

  it("never falls back to CARTO's keyless tiles, which serve a placeholder", () => {
    expect(resolveBasemap({}).url).not.toContain("cartocdn.com");
  });

  it("uses CARTO when an API key is supplied", () => {
    const map = resolveBasemap({ NEXT_PUBLIC_CARTO_API_KEY: "abc123" });
    expect(map.url).toContain("basemaps.cartocdn.com");
    expect(map.url).toContain("api_key=abc123");
    expect(map.attribution).toContain("CARTO");
  });

  it("url-encodes the CARTO key", () => {
    expect(resolveBasemap({ NEXT_PUBLIC_CARTO_API_KEY: "a b&c" }).url).toContain(
      "api_key=a%20b%26c"
    );
  });

  it("prefers an explicit basemap URL over everything else", () => {
    const map = resolveBasemap({
      NEXT_PUBLIC_BASEMAP_URL: "https://tiles.example.com/{z}/{x}/{y}.png",
      NEXT_PUBLIC_BASEMAP_ATTRIBUTION: "Example",
      NEXT_PUBLIC_CARTO_API_KEY: "abc123",
    });
    expect(map.url).toBe("https://tiles.example.com/{z}/{x}/{y}.png");
    expect(map.attribution).toBe("Example");
  });

  it("ignores blank env values", () => {
    const map = resolveBasemap({
      NEXT_PUBLIC_BASEMAP_URL: "   ",
      NEXT_PUBLIC_CARTO_API_KEY: "  ",
    });
    expect(map.url).toContain("arcgisonline.com");
  });
});
