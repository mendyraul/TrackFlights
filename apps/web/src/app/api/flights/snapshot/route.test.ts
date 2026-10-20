import { describe, it, expect, vi, beforeEach } from "vitest";

const { limitMock, heartbeatMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  heartbeatMock: vi.fn(),
}));

// Replace the Supabase client so the route's DB reads are controllable and
// the real client (createClient) never runs.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) =>
      table === "ingestor_heartbeat"
        ? { select: () => ({ eq: () => ({ maybeSingle: heartbeatMock }) }) }
        : { select: () => ({ order: () => ({ limit: limitMock }) }) },
  },
}));

import { GET } from "./route";

describe("GET /api/flights/snapshot", () => {
  beforeEach(() => {
    limitMock.mockReset();
    heartbeatMock.mockReset();
    heartbeatMock.mockResolvedValue({ data: null, error: null });
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
    expect(body.receiver).toBeNull();
  });

  it("includes the receiver heartbeat when present", async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    heartbeatMock.mockResolvedValue({
      data: { last_poll_at: "2026-10-20T12:00:10Z", aircraft_received: 0, aircraft_in_range: 0 },
      error: null,
    });

    const body = await (await GET()).json();

    expect(body.receiver).toEqual({ lastPollAt: "2026-10-20T12:00:10Z", received: 0, inRange: 0 });
  });

  it("still serves flights when the heartbeat table doesn't exist yet", async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    heartbeatMock.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });

    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).receiver).toBeNull();
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
