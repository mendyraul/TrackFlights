import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { BehindTheScenes } from "./BehindTheScenes";

describe("BehindTheScenes", () => {
  it("renders the headline and pipeline overview", () => {
    render(<BehindTheScenes />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Behind the Scenes/i })
    ).toBeInTheDocument();
    expect(screen.getAllByText(/1090/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/200 km/).length).toBeGreaterThan(0);
  });

  it("shows no photo placeholders or 'coming soon' copy while photos are unset", () => {
    const { container } = render(<BehindTheScenes />);
    expect(screen.queryByRole("img", { name: /placeholder/i })).toBeNull();
    expect(container.textContent).not.toMatch(/coming soon|on the way|draft walkthrough/i);
  });

  it("gives every table a real header row", () => {
    render(<BehindTheScenes />);
    for (const table of screen.getAllByRole("table")) {
      expect(within(table).getAllByRole("columnheader").length).toBeGreaterThanOrEqual(3);
    }
  });

  it("describes the actual hardware: generic RTL-SDR, Pi 3, antenna in a window", () => {
    const { container } = render(<BehindTheScenes />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Generic RTL-SDR/);
    expect(text).toMatch(/Raspberry Pi 3/);
    expect(text).toMatch(/window/);
    expect(text).not.toMatch(/roof-mounted|Rooftop|Raspberry Pi 4/);
  });

  it("states the corrected pipeline facts", () => {
    const { container } = render(<BehindTheScenes />);
    const text = container.textContent ?? "";
    // The movement gate only drops slow aircraft at a 15 s poll.
    expect(text).toMatch(/19\s*knots/);
    expect(text).not.toMatch(/barely move between polls/);
    expect(text).not.toMatch(/60–80%/);
    // Egress claim is per CDN region, not global.
    expect(text).toMatch(/same CDN region/);
    expect(text).toMatch(/ICAO hex address/);
  });

  it("has no intro blurb, big-picture section or build guide", () => {
    const { container } = render(<BehindTheScenes />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/The big picture|Build it yourself|puts live planes on this map/);
  });
});

describe("Models section", () => {
  it("shows what each model is waiting for until a real evaluation exists", () => {
    render(<BehindTheScenes />);
    expect(screen.getByRole("heading", { level: 2, name: "Models" })).toBeInTheDocument();
    expect(screen.getByText(/Collecting data: needs about 4 weeks/)).toBeInTheDocument();
    expect(screen.getByText(/Collecting tracks: needs about 2 weeks/)).toBeInTheDocument();
  });
});
