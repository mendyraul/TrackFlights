import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit, __resetRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimit();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const opts = { limit: 3, windowMs: 1000 };

  it("allows up to the limit then blocks", () => {
    expect(checkRateLimit("a", opts).allowed).toBe(true);
    expect(checkRateLimit("a", opts).allowed).toBe(true);
    const third = checkRateLimit("a", opts);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect(checkRateLimit("a", opts).allowed).toBe(false);
  });

  it("tracks keys independently", () => {
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    expect(checkRateLimit("a", opts).allowed).toBe(false);
    expect(checkRateLimit("b", opts).allowed).toBe(true);
  });

  it("resets after the window elapses", () => {
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    checkRateLimit("a", opts);
    expect(checkRateLimit("a", opts).allowed).toBe(false);

    vi.advanceTimersByTime(1001);
    const after = checkRateLimit("a", opts);
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(2);
  });

  it("reports a positive retryAfter when blocked", () => {
    checkRateLimit("a", opts);
    const r = checkRateLimit("a", { limit: 1, windowMs: 5000 });
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });
});
