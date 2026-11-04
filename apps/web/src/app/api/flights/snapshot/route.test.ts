import { describe, it, expect, vi, beforeEach } from "vitest";

const { limitMock, observationsMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  observationsMock: vi.fn(),
}));

// Replace the Supabase client so the route's only DB read is controllable and
// the real client (createClient) never runs.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({ limit: () => ({ abortSignal: limitMock }) }),
      }),
    }),
  },
}));

vi.mock("@/lib/source-observations", () => ({
  readObservations: observationsMock,
  readSchedules: async () => [],
}));
import { GET } from "./route";
vi.mock("@/lib/receiver", () => ({ readReceiver: async () => null }));

describe("GET /api/flights/snapshot", () => {
  beforeEach(() => {
    limitMock.mockReset();
    observationsMock.mockResolvedValue([]);
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
    expect(body.error).toBe("Flight data unavailable");
  });
});

it("supplemental-only data cannot make receiver freshness live", async () => {
  limitMock.mockResolvedValue({ data: [], error: null });
  observationsMock.mockResolvedValue([
    { id: "remote", data_source: "flightaware", updated_at: new Date().toISOString() },
  ]);
  const response = await GET();
  const body = await response.json();
  expect(body.flights).toHaveLength(1);
  expect(body.dataUpdatedAt).toBeNull();
  expect(body.regionalSnapshot.partial).toBe(true);
});
