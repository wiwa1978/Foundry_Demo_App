import { describe, expect, it, vi } from "vitest";

import { readStorage, writeStorage } from "./storage";


describe("safe storage", () => {
  it("returns a fallback when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    expect(readStorage("theme", "light")).toBe("light");
    vi.restoreAllMocks();
  });

  it("does not throw when writes are blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    expect(() => writeStorage("theme", "dark")).not.toThrow();
    vi.restoreAllMocks();
  });
});
