import { beforeEach, describe, expect, it, vi } from "vitest";
const { query, from } = vi.hoisted(() => ({ query: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));
import { GET } from "./route";
beforeEach(() => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    abortSignal: query,
  };
  from.mockReturnValue(chain);
  from.mockClear();
  query.mockReset();
});
const get = (iata: string) =>
  GET(new Request("http://localhost"), { params: Promise.resolve({ iata }) });
describe("cached airport boards", () => {
  it("returns cached baseline and progress independently", async () => {
    query
      .mockResolvedValueOnce({ data: [{ airport: "MIA", flights: [] }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const response = await get("mia");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=30");
    const body = await response.json();
    expect(body.baselines).toHaveLength(1);
    expect(body.progress).toEqual([]);
  });
  it("does not query schedules for an unsupported airport", async () => {
    const response = await get("OPF");
    expect((await response.json()).supported).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects unknown airports", async () => {
    expect((await get("INVALID")).status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });
  it("returns a generic unavailable state without caching database errors", async () => {
    query.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    const response = await get("MIA");
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).not.toContain("private");
  });
});
