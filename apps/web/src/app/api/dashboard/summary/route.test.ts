import { describe, it, expect, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

// A permissive chainable stub: every builder method returns the chain, and the
// chain resolves (thenable) with the next queued result. The route runs six
// queries via Promise.all.
vi.mock("@/lib/supabase", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "eq", "gte", "lte"]) {
      c[m] = () => c;
    }
    c.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(queryMock()).then(resolve, reject);
    return c;
  };
  return { supabase: { from: () => chain() } };
});

import { GET } from "./route";

describe("GET /api/dashboard/summary", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("bundles all dashboard reads behind one edge-cached response", async () => {
    queryMock.mockReturnValue({ data: [], error: null });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=");
    const body = await res.json();
    expect(body).toMatchObject({
      analyticsHourly: [],
      analyticsDaily: [],
      weatherCurrent: null,
      weatherForecast: [],
      predictions: [],
      anomalies: [],
    });
    expect(queryMock).toHaveBeenCalledTimes(6);
  });

  it("surfaces the latest weather row as weatherCurrent", async () => {
    queryMock.mockReturnValue({ data: [{ id: "w1", temperature_c: 31 }], error: null });

    const res = await GET();
    const body = await res.json();

    expect(body.weatherCurrent).toEqual({ id: "w1", temperature_c: 31 });
  });

  it("returns 503 + no-store when any Supabase read errors", async () => {
    queryMock
      .mockReturnValueOnce({ data: [], error: null })
      .mockReturnValue({ data: null, error: { message: "boom" } });

    const res = await GET();

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toBe("boom");
  });
});
