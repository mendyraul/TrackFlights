import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/model-metrics.json", () => ({
  default: {
    forecast: {
      ships: true,
      model: "gradient_boosting",
      mae: 1.78,
      best_baseline_mae: 2.73,
      improvement_pct: 34.8,
      heldout_days: 7,
      evaluated_at: "2026-11-20",
    },
    phase: {
      ships: false,
      model: "logistic_regression",
      macro_f1: 0.61,
      baseline_macro_f1: 0.64,
      test_samples: 51234,
      heldout_days: 4,
      evaluated_at: "2026-11-06",
    },
  },
}));

import { Models } from "./BehindTheScenes";

describe("Models with real evaluation results", () => {
  it("reports shipped and not-shipped models honestly", () => {
    render(<Models />);
    expect(
      screen.getByText(/off by 1.8 aircraft\/hour on average with gradient-boosted trees, vs 2.7/)
    ).toBeInTheDocument();
    expect(screen.getByText(/34.8% better/)).toBeInTheDocument();
    expect(screen.getByText(/didn.t beat the hand-written rules yet/)).toBeInTheDocument();
  });
});
