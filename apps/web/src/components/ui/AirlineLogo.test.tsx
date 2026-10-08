import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AirlineLogo } from "@/components/ui/AirlineLogo";

describe("AirlineLogo", () => {
  it("renders the vendored logo for a supported carrier", () => {
    render(<AirlineLogo iata="B6" name="JetBlue Airways" />);
    const img = screen.getByRole("img", { name: "JetBlue Airways" });
    expect(img).toHaveAttribute("src", "/airlines/jetblue-airways.svg");
  });

  it("renders an initials badge when no logo exists", () => {
    render(<AirlineLogo iata="AV" name="Avianca" />);
    const badge = screen.getByRole("img", { name: "Avianca" });
    expect(badge).toHaveTextContent("AV");
    expect(badge.tagName).not.toBe("IMG");
  });

  it("labels the mark with the airline name for screen readers", () => {
    render(<AirlineLogo iata="AA" name="American Airlines" />);
    expect(screen.getByRole("img", { name: "American Airlines" })).toBeInTheDocument();
  });

  it("falls back to the code when the name is missing", () => {
    render(<AirlineLogo iata="CM" name={null} />);
    expect(screen.getByRole("img", { name: "CM" })).toHaveTextContent("CM");
  });

  it("stays renderable with no airline information at all", () => {
    render(<AirlineLogo iata={null} name={null} />);
    expect(screen.getByRole("img", { name: "Unknown airline" })).toHaveTextContent("—");
  });

  it("honours the requested size", () => {
    render(<AirlineLogo iata="DL" name="Delta Air Lines" size={32} />);
    expect(screen.getByRole("img", { name: "Delta Air Lines" })).toHaveAttribute("width", "32");
  });
});
