// Extends vitest's `expect` with jest-dom matchers (and their TS types).
import "@testing-library/jest-dom/vitest";

// Unmount React trees after each test so renders don't accumulate in the DOM
// across cases (otherwise singular queries like getByRole can match leftovers).
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
