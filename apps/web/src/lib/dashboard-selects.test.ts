import { describe, expect, it } from "vitest";
import {
  ANALYTICS_DAILY_COLUMNS,
  ANALYTICS_HOURLY_COLUMNS,
  FLIGHT_SNAPSHOT_COLUMNS,
  PREDICTION_COLUMNS,
  WEATHER_COLUMNS,
} from "./dashboard-selects";

const columns = (projection: string) => projection.split(",");

describe("dashboard select projections", () => {
  it("keeps the flight snapshot query aligned with the current flight schema", () => {
    const snapshotColumns = columns(FLIGHT_SNAPSHOT_COLUMNS);

    expect(snapshotColumns).toContain("origin_iata");
    expect(snapshotColumns).toContain("destination_iata");
    expect(snapshotColumns).toContain("ground_speed_knots");
    expect(snapshotColumns).toContain("departure_terminal");
    expect(snapshotColumns).toContain("arrival_gate");
    expect(snapshotColumns).not.toContain("departure_airport_iata");
    expect(snapshotColumns).not.toContain("arrival_airport_iata");
    expect(snapshotColumns).not.toContain("estimated_departure");
    expect(snapshotColumns).not.toContain("speed_knots");
    expect(snapshotColumns).not.toContain("baggage_claim");
  });

  it("uses the current analytics, weather, and prediction column names", () => {
    const hourlyColumns = columns(ANALYTICS_HOURLY_COLUMNS);
    const dailyColumns = columns(ANALYTICS_DAILY_COLUMNS);
    const weatherColumns = columns(WEATHER_COLUMNS);
    const predictionColumns = columns(PREDICTION_COLUMNS);

    expect(hourlyColumns).toContain("on_time");
    expect(hourlyColumns).toContain("delayed");
    expect(hourlyColumns).toContain("cancelled");
    expect(hourlyColumns).toContain("diverted");
    expect(hourlyColumns).not.toContain("on_time_count");
    expect(hourlyColumns).not.toContain("delayed_count");
    expect(hourlyColumns).not.toContain("cancelled_count");

    expect(dailyColumns).toContain("top_delayed_airline");
    expect(dailyColumns).toContain("busiest_hour");
    expect(weatherColumns).toContain("feels_like_c");
    expect(weatherColumns).toContain("cloud_coverage_pct");
    expect(weatherColumns).toContain("is_freezing");
    expect(weatherColumns).not.toContain("dewpoint_c");
    expect(weatherColumns).not.toContain("cloud_cover_pct");

    expect(predictionColumns).toContain("created_at");
    expect(predictionColumns).toContain("direction");
    expect(predictionColumns).toContain("factors");
    expect(predictionColumns).not.toContain("generated_at");
  });
});
