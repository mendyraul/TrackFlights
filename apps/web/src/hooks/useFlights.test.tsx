import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { resetFlightSnapshotStore, useFlights } from "./useFlights";

describe("useFlights", () => {
  beforeEach(() => {
    resetFlightSnapshotStore();
    // jsdom can report a non-"visible" state; the hook skips fetching unless visible.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads flights from the cached snapshot route", async () => {
    const updatedAt = new Date().toISOString();
    const flights = [{ id: "1", flight_iata: "AA100", updated_at: updatedAt }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flights }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useFlights());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith("/api/flights/snapshot");
    expect(result.current.flights).toEqual(flights);
    expect(result.current.connectionStatus).toBe("connected");
    expect(result.current.error).toBeNull();
    expect(result.current.freshness).toBe("live");
  });

  it("reports offline when the newest row is old, even though the fetch succeeded", async () => {
    const flights = [{ id: "1", flight_iata: "AA100", updated_at: "2026-07-19T11:00:00Z" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flights }) })
    );

    const { result } = renderHook(() => useFlights());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectionStatus).toBe("connected");
    expect(result.current.freshness).toBe("offline");
    expect(result.current.dataUpdatedAt).toBe(Date.parse("2026-07-19T11:00:00Z"));
  });

  it("surfaces an error when the snapshot request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const { result } = renderHook(() => useFlights());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectionStatus).toBe("disconnected");
    expect(result.current.error).toMatch(/503/);
    expect(result.current.freshness).toBe("error");
  });

  it("shares one request between components", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flights: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const a = renderHook(() => useFlights());
    renderHook(() => useFlights());

    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
