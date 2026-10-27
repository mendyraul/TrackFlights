import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({ select: () => ({ limit: () => ({ abortSignal: query }) }) }),
  },
}));
import { GET } from "./route";

beforeEach(() => {
  query.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-placeholder");
});
afterEach(() => vi.unstubAllEnvs());

describe("database readiness", () => {
  it("is ready when the database answers, including an empty table", async () => {
    query.mockResolvedValue({ data: [], error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).database).toBe("reachable");
    expect(query).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("fails closed when configuration is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect((await GET()).status).toBe(503);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["database error", "network error"])(
    "reports %s without leaking details",
    async (kind) => {
      if (kind === "database error")
        query.mockResolvedValue({ error: { message: "secret detail" } });
      else query.mockRejectedValue(new Error("secret detail"));
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret detail");
    }
  );
});
