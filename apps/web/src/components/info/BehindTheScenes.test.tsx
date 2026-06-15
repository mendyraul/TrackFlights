import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BehindTheScenes } from "./BehindTheScenes";

describe("BehindTheScenes", () => {
  it("renders the headline and pipeline overview", () => {
    render(<BehindTheScenes />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Behind the Scenes/i })
    ).toBeInTheDocument();
    // Anchor on a couple of the baked-in benchmark values.
    expect(screen.getAllByText(/1090 MHz/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/200 km/i).length).toBeGreaterThan(0);
  });

  it("includes photo placeholders for the owner to fill later", () => {
    render(<BehindTheScenes />);
    const placeholders = screen.getAllByRole("img", { name: /Photo placeholder/i });
    expect(placeholders.length).toBeGreaterThanOrEqual(4);
  });
});
