import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { query, receiver } = vi.hoisted(() => ({ query: vi.fn(), receiver: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => ({ limit: () => ({ abortSignal: query }) }) }) }),
  },
}));
vi.mock("@/lib/receiver", () => ({ readReceiver: receiver }));
import { GET } from "./route";

const NOW = Date.parse("2026-10-27T14:00:00Z");
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  query.mockReset();
  receiver.mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("ingestion health", () => {
  it("rejects old flights even when the database query succeeds", async () => {
    query.mockResolvedValue({ data: [{ updated_at: "2026-07-19T11:00:00Z" }], error: null });
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.freshness).toBe("offline");
    expect(body.dataUpdatedAt).toBe("2026-07-19T11:00:00Z");
    expect(body.timestamp).toBe(new Date(NOW).toISOString());
  });

  it("accepts fresh observations without requiring the optional heartbeat", async () => {
    query.mockResolvedValue({
      data: [{ updated_at: new Date(NOW - 15000).toISOString() }],
      error: null,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).freshness).toBe("live");
  });

  it("distinguishes a polling receiver with no aircraft from stopped ingestion", async () => {
    query.mockResolvedValue({ data: [], error: null });
    receiver.mockResolvedValue({
      lastPollAt: new Date(NOW - 15000).toISOString(),
      received: 0,
      inRange: 0,
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).freshness).toBe("silent");
  });

  it("does not let a heartbeat hide stale aircraft that should have been written", async () => {
    query.mockResolvedValue({ data: [{ updated_at: "2026-07-19T11:00:00Z" }], error: null });
    receiver.mockResolvedValue({
      lastPollAt: new Date(NOW).toISOString(),
      received: 10,
      inRange: 5,
    });
    expect((await GET()).status).toBe(503);
  });

  it("fails when neither observations nor heartbeat exist", async () => {
    query.mockResolvedValue({ data: [], error: null });
    expect((await GET()).status).toBe(503);
  });

  it("returns an uncached failure for database errors", async () => {
    query.mockResolvedValue({ data: null, error: { message: "private error" } });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("private error");
  });
});
