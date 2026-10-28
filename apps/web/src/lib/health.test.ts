import { afterEach, describe, expect, it, vi } from "vitest";
import { withinDeadline } from "./health";

afterEach(() => vi.useRealTimers());

describe("dependency deadline", () => {
  it("cancels and rejects a query that never settles", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const result = withinDeadline((value) => {
      signal = value;
      return new Promise(() => {});
    }, 50);
    const check = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(50);
    await check;
    expect(signal?.aborted).toBe(true);
  });

  it("returns a completed probe without later cancelling it", async () => {
    vi.useFakeTimers();
    expect(await withinDeadline(async () => 42)).toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });
});
