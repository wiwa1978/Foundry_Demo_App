import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceAppearance } from "./useWorkspaceAppearance";

describe("useWorkspaceAppearance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    delete document.documentElement.dataset.palette;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
  });

  it("initializes from persisted preferences and updates the document root", () => {
    window.localStorage.setItem("foundry-chat-theme", "dark");
    window.localStorage.setItem("foundry-chat-color-palette", "forest");

    const { result } = renderHook(useWorkspaceAppearance);

    expect(result.current.theme).toBe("dark");
    expect(result.current.colorPalette).toBe("forest");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.dataset.palette).toBe("forest");
  });

  it("uses system theme and the default palette for invalid storage", () => {
    window.localStorage.setItem("foundry-chat-theme", "system");
    window.localStorage.setItem("foundry-chat-color-palette", "invalid");
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
    } as MediaQueryList);

    const { result } = renderHook(useWorkspaceAppearance);

    expect(result.current.theme).toBe("dark");
    expect(result.current.colorPalette).toBe("foundry");
  });

  it("toggles and sets preferences with persistence", () => {
    const { result } = renderHook(useWorkspaceAppearance);

    act(() => {
      result.current.toggleTheme();
      result.current.setColorPalette("ember");
    });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("foundry-chat-theme")).toBe("dark");
    expect(window.localStorage.getItem("foundry-chat-color-palette")).toBe(
      "ember",
    );

    act(() => result.current.setTheme("light"));
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
