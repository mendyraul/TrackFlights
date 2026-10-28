import { describe, expect, it } from "vitest";
import {
  LIVE_MAX_AGE_MS,
  OFFLINE_AFTER_MS,
  classifyFreshness,
  formatAge,
  newestUpdate,
  trackedNow,
} from "./freshness";

const NOW = Date.parse("2026-10-20T12:00:00Z");

describe("freshness", () => {
  it("finds the newest updated_at", () => {
    expect(newestUpdate([])).toBeNull();
    expect(
      newestUpdate([{ updated_at: "2026-10-20T11:00:00Z" }, { updated_at: "2026-10-20T11:59:00Z" }])
    ).toBe(Date.parse("2026-10-20T11:59:00Z"));
  });

  it("classifies by data age, not fetch success", () => {
    const base = { loading: false, error: null, now: NOW };
    expect(classifyFreshness({ ...base, dataUpdatedAt: NOW - 10_000 })).toBe("live");
    expect(classifyFreshness({ ...base, dataUpdatedAt: NOW - LIVE_MAX_AGE_MS - 1 })).toBe(
      "delayed"
    );
    expect(classifyFreshness({ ...base, dataUpdatedAt: NOW - OFFLINE_AFTER_MS - 1 })).toBe(
      "offline"
    );
    expect(classifyFreshness({ ...base, dataUpdatedAt: null })).toBe("offline");
    expect(classifyFreshness({ ...base, error: "503", dataUpdatedAt: null })).toBe("error");
    expect(classifyFreshness({ ...base, loading: true, dataUpdatedAt: null })).toBe("loading");
  });

  it("counts only recently updated aircraft as tracked", () => {
    const rows = [
      { id: "a", updated_at: "2026-10-20T11:59:30Z" },
      { id: "b", updated_at: "2026-07-19T11:00:00Z" },
    ];
    expect(trackedNow(rows, NOW).map((r) => r.id)).toEqual(["a"]);
  });

  it("formats ages", () => {
    expect(formatAge(2_000)).toBe("just now");
    expect(formatAge(42_000)).toBe("42s ago");
    expect(formatAge(5 * 60_000)).toBe("5m ago");
    expect(formatAge(3 * 3_600_000)).toBe("3h ago");
    expect(formatAge(92 * 86_400_000)).toBe("92d ago");
  });

  it("does not report cached data as live after an API failure", () => {
    expect(classifyFreshness({ loading: false, error: "503", dataUpdatedAt: NOW, now: NOW })).toBe(
      "error"
    );
  });

  it("rejects impossible future observation and heartbeat timestamps", () => {
    const future = NOW + 3600000;
    expect(
      classifyFreshness({
        loading: false,
        error: null,
        dataUpdatedAt: future,
        now: NOW,
        receiver: { lastPollAt: new Date(future).toISOString(), received: 0, inRange: 0 },
      })
    ).toBe("offline");
    expect(trackedNow([{ updated_at: new Date(future).toISOString() }], NOW)).toEqual([]);
  });
});
