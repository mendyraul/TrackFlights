import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFlights } from "./useFlights";

describe("useFlights", () => {
  beforeEach(() => {
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
    const flights = [{ id: "1", flight_iata: "AA100" }];
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
  });

  it("surfaces an error when the snapshot request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const { result } = renderHook(() => useFlights());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectionStatus).toBe("disconnected");
    expect(result.current.error).toMatch(/503/);
  });
});
