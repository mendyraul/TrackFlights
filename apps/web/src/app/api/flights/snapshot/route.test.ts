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

  it("returns the snapshot with an edge-cache header", async () => {
    limitMock.mockResolvedValue({
      data: [{ id: "1", flight_iata: "AA100", updated_at: "2026-10-20T12:00:00Z" }],
      error: null,
    });

    const res = await GET();

    expect(res.status).toBe(200);
    // The s-maxage header is what lets Vercel's CDN absorb viewer traffic.
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=");
    const body = await res.json();
    expect(body.flights).toEqual([
      { id: "1", flight_iata: "AA100", updated_at: "2026-10-20T12:00:00Z" },
    ]);
    // The newest row's timestamp, so the UI can tell live data from old data.
    expect(body.dataUpdatedAt).toBe("2026-10-20T12:00:00Z");
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
