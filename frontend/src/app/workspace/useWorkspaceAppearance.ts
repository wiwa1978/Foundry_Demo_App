import { useCallback, useEffect, useState } from "react";

import {
  colorPalettes,
  colorPaletteStorageKey,
} from "@/app/workspace/constants";
import type { ColorPalette, Theme } from "@/app/workspace/contracts";
import { readStorage, writeStorage } from "@/lib/storage";

const themeStorageKey = "foundry-chat-theme";

function initialTheme(): Theme {
  const savedTheme = readStorage(themeStorageKey);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function initialColorPalette(): ColorPalette {
  const savedPalette = readStorage(colorPaletteStorageKey);
  return colorPalettes.some((palette) => palette.id === savedPalette)
    ? (savedPalette as ColorPalette)
    : "foundry";
}

export function useWorkspaceAppearance() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [colorPalette, setColorPaletteState] =
    useState<ColorPalette>(initialColorPalette);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStorage(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.palette = colorPalette;
    writeStorage(colorPaletteStorageKey, colorPalette);
  }, [colorPalette]);

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme);
  }, []);
  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);
  const setColorPalette = useCallback((palette: ColorPalette) => {
    setColorPaletteState(palette);
  }, []);

  return {
    theme,
    colorPalette,
    setTheme,
    toggleTheme,
    setColorPalette,
  };
}
