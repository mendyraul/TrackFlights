import { describe, expect, it } from "vitest";
import { chartData } from "./TrafficHistoryChart";
import type { TrafficForecast, TrafficHourly } from "@/types/database";

const hour = (iso: string, n: number) =>
  ({
    hour: iso,
    unique_aircraft: n,
    arriving: n,
    departing: 0,
    overflights: 0,
    on_ground: 0,
  }) as TrafficHourly;
const fc = (iso: string, p: number) =>
  ({
    hour: iso,
    predicted_aircraft: p,
    model_version: "v",
    model_mae: 1.8,
    baseline_mae: 2.7,
  }) as TrafficForecast;

describe("chartData", () => {
  it("puts history and forecast on one time axis, in order", () => {
    const data = chartData(
      [hour("2026-10-20T13:00:00+00:00", 30), hour("2026-10-20T14:00:00+00:00", 32)],
      [fc("2026-10-20T16:00:00Z", 35), fc("2026-10-20T15:00:00Z", 33)]
    );
    expect(data.map((d) => d.key)).toEqual([
      "2026-10-20T13:00:00.000Z",
      "2026-10-20T14:00:00.000Z",
      "2026-10-20T15:00:00.000Z",
      "2026-10-20T16:00:00.000Z",
    ]);
    expect(data[1].Arriving).toBe(32);
    expect(data[1].Forecast).toBeUndefined();
    expect(data[2].Forecast).toBe(33);
    expect(data[2].Arriving).toBeUndefined();
  });

  it("merges a forecast for an hour that also has history", () => {
    const data = chartData(
      [hour("2026-10-20T15:00:00+00:00", 30)],
      [fc("2026-10-20T15:00:00Z", 28)]
    );
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ Arriving: 30, Forecast: 28 });
  });
});
