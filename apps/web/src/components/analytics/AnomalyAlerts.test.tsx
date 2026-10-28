import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnomalyAlerts } from "./AnomalyAlerts";
import type { TrafficAnomaly } from "@/types/database";

const anomaly = (over: Partial<TrafficAnomaly>): TrafficAnomaly =>
  ({
    id: "a1",
    anomaly_type: "traffic_high",
    severity: "medium",
    title: "Unusually busy: 61 aircraft vs ~38 typical for Tue 5 pm",
    description:
      "The same hour over the previous 8 weeks had a median of 38 aircraft (robust z = 4.2).",
    affected_count: 0,
    affected_flights: [],
    affected_airlines: [],
    detected_at: new Date().toISOString(),
    is_active: true,
    ...over,
  }) as TrafficAnomaly;

describe("AnomalyAlerts", () => {
  it("renders busy/quiet traffic alerts without a misleading 'flights affected' line", () => {
    render(<AnomalyAlerts anomalies={[anomaly({})]} />);
    expect(screen.getByText(/Unusually busy: 61 aircraft/)).toBeInTheDocument();
    expect(screen.getByText(/robust z = 4.2/)).toBeInTheDocument();
    expect(screen.queryByText(/flights affected/)).toBeNull();
  });

  it("renders nothing without anomalies", () => {
    const { container } = render(<AnomalyAlerts anomalies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
