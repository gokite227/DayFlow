import { darkPalette, fontSize, lightPalette, radius, spacing, type ThemePalette } from "@dayflow/design-tokens";
import { createContext, useContext } from "react";
import { StyleSheet } from "react-native";

export { fontSize, radius, spacing };
export type { ThemePalette };

/** Minimum touch target (Apple HIG 44pt). */
export const TOUCH_TARGET = 44;

export interface AppTheme {
  scheme: "light" | "dark";
  palette: ThemePalette;
}

export const LIGHT_THEME: AppTheme = { scheme: "light", palette: lightPalette };
export const DARK_THEME: AppTheme = { scheme: "dark", palette: darkPalette };

export const ThemeContext = createContext<AppTheme>(LIGHT_THEME);

export function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}

export function usePalette(): ThemePalette {
  return useContext(ThemeContext).palette;
}

/**
 * Themed StyleSheet factory: styles are created once per palette (light/dark) and reused, so
 * components only pay a context read per render.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (palette: ThemePalette) => T): () => T {
  const cache = new Map<ThemePalette, T>();
  return function useStyles(): T {
    const palette = usePalette();
    let styles = cache.get(palette);
    if (!styles) {
      styles = StyleSheet.create(factory(palette));
      cache.set(palette, styles);
    }
    return styles;
  };
}

/** A translucent version of a #rrggbb color, e.g. Category backgrounds on dark surfaces. */
export function withAlpha(hex: string, alpha: number): string {
  const value = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${value}` : hex;
}