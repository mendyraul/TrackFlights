import { describe, it, expect, vi, beforeEach } from "vitest";

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

// Replace the Supabase client so the route's only DB read is controllable and
// the real client (createClient) never runs.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({ limit: limitMock }),
      }),
    }),
  },
}));

import { GET } from "./route";

describe("GET /api/flights/snapshot", () => {
  beforeEach(() => {
    limitMock.mockReset();
  });

  it("returns the snapshot with an edge-cache header, adapting tracked_flights rows", async () => {
    limitMock.mockResolvedValue({
      data: [
        {
          hex: "A1B2C3",
          callsign: "AAL100",
          aircraft_type: "B738",
          latitude: 25.9,
          longitude: -80.3,
          altitude_ft: 4000,
          ground_speed_knots: 240,
          track_deg: 270,
          vertical_rate_fpm: -1200,
          on_ground: false,
          last_seen: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    // The s-maxage header is what lets Vercel's CDN absorb viewer traffic.
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=");
    const body = await res.json();
    expect(body.flights).toHaveLength(1);
    const f = body.flights[0];
    // tracked_flights row is adapted to the Flight shape the UI consumes.
    expect(f.id).toBe("A1B2C3");
    expect(f.flight_iata).toBe("AAL100");
    expect(f.heading).toBe(270);
    expect(f.ground_speed_knots).toBe(240);
    expect(f.updated_at).toBe("2026-01-01T00:00:00Z");
    expect(f.direction).toBe("arrival"); // descending vertical rate
    expect(f.status).toBe("en_route");
  });

  it("falls back to hex for the label when there is no callsign", async () => {
    limitMock.mockResolvedValue({
      data: [{ hex: "DEAD01", callsign: null, on_ground: true, last_seen: "2026-01-01T00:00:00Z" }],
      error: null,
    });

    const res = await GET();
    const body = await res.json();
    expect(body.flights[0].flight_iata).toBe("DEAD01");
    expect(body.flights[0].status).toBe("landed");
  });

  it("returns 503 + no-store when Supabase errors", async () => {
    limitMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const res = await GET();

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toBe("boom");
  });
});
