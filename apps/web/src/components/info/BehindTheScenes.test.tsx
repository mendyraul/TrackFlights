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
    expect(screen.getByRole("columnheader", { name: /Quality build/i })).toBeInTheDocument();
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
    expect(text).not.toMatch(/ssh pi@raspberrypi/);
    expect(text).toMatch(/ICAO hex address/);
  });

  it("keeps env-file comments on their own lines", () => {
    render(<BehindTheScenes />);
    const env = screen.getByLabelText(/Ingestor environment file/i).textContent ?? "";
    expect(env).toMatch(/ADSB_JSON_URL/);
    for (const line of env.split("\n")) {
      if (/^[A-Z_]+=/.test(line)) expect(line).not.toMatch(/#/);
    }
  });
});
