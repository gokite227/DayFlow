/**
 * DayFlow visual identity (docs/prototype.html v0.6) as platform-neutral values. Web keeps its CSS
 * variables in apps/web/app/globals.css; these are the same values for clients without CSS (Mobile).
 */
export const colors = {
  background: "#fff8fb",
  panel: "#ffffff",
  line: "#eadfe5",
  text: "#2d2730",
  muted: "#8f838b",
  accent: "#ee749d",
  accent2: "#c78be7",
  accentSoft: "#fde8ef",
  lavender: "#f4effb",
  mint: "#eaf6f2",
  danger: "#c95670",
  success: "#2a927f",
  successSoft: "#e6f5f1",
} as const;

/**
 * Semantic palette for clients that support light and dark appearance (Mobile). Dark keeps the
 * pink/lavender identity on deep plum surfaces instead of inverting the light colors.
 */
export interface ThemePalette {
  background: string;
  surface: string;
  surfaceElevated: string;
  /** Soft lavender panels (drawers, nested forms). */
  surfaceMuted: string;
  text: string;
  textSecondary: string;
  /** Placeholders and disabled content. */
  muted: string;
  border: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  /** Text and icons drawn on `accent`. */
  onAccent: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  warningSoft: string;
  overlay: string;
  gridLine: string;
  gridLineMinor: string;
  nowLine: string;
}

export const lightPalette: ThemePalette = {
  background: colors.background,
  surface: colors.panel,
  surfaceElevated: "#ffffff",
  surfaceMuted: colors.lavender,
  text: colors.text,
  textSecondary: colors.muted,
  muted: "#b4a9b1",
  border: colors.line,
  accent: colors.accent,
  accent2: colors.accent2,
  accentSoft: colors.accentSoft,
  onAccent: "#ffffff",
  danger: colors.danger,
  dangerSoft: "#fdecef",
  success: colors.success,
  successSoft: colors.successSoft,
  warningSoft: "#fdf1e4",
  overlay: "rgba(45, 39, 48, 0.35)",
  gridLine: "#efe4ea",
  gridLineMinor: "#f8f0f4",
  nowLine: "#e0527f",
};

export const darkPalette: ThemePalette = {
  background: "#17131a",
  surface: "#211b25",
  surfaceElevated: "#2b2330",
  surfaceMuted: "#2a2233",
  text: "#f3ecf1",
  textSecondary: "#b6aab3",
  muted: "#7d727d",
  border: "#3a3040",
  accent: "#f08bae",
  accent2: "#c9a0ec",
  accentSoft: "#3b2431",
  onAccent: "#2a1420",
  danger: "#ef8aa0",
  dangerSoft: "#3a1f27",
  success: "#5fc3ad",
  successSoft: "#1d3430",
  warningSoft: "#3a2a1c",
  overlay: "rgba(0, 0, 0, 0.55)",
  gridLine: "#342b39",
  gridLineMinor: "#261f2b",
  nowLine: "#f08bae",
};

export const radius = { sm: 8, md: 12, lg: 18, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const fontSize = { caption: 12, body: 15, title: 17, heading: 22, display: 28 } as const;

/**
 * EVT-006 Event Category palette. The server validates the same values (EventCategoryColors.java);
 * `soft` is the light background used behind a Category-colored bar.
 */
export const eventCategoryColors: readonly { value: string; label: string; soft: string }[] = [
  { value: "#66707a", label: "슬레이트", soft: "#eff1f3" },
  { value: "#d9822b", label: "오렌지", soft: "#fdf1e4" },
  { value: "#3a78b8", label: "블루", soft: "#e8f1fa" },
  { value: "#7453c2", label: "퍼플", soft: "#f0ebfa" },
  { value: "#cf3f5c", label: "레드", soft: "#fdeaee" },
  { value: "#2a927f", label: "틸", soft: "#e6f5f1" },
  { value: "#c2549a", label: "마젠타", soft: "#f9eaf3" },
  { value: "#8a6d3b", label: "브라운", soft: "#f4efe6" },
];

/** Neutral look of an Event without a Category (미분류). */
export const uncategorizedEventColor = { value: "#9a939c", soft: "#f3f1f3" } as const;

/** DAY-005 Day Tag palette (validated server-side by DayTagColors.java). */
export const dayTagColors: readonly { value: string; label: string }[] = [
  { value: "#ee749d", label: "핑크" },
  { value: "#c78be7", label: "라벤더" },
  { value: "#8aa6ee", label: "블루" },
  { value: "#5fb7a5", label: "민트" },
  { value: "#7fb469", label: "그린" },
  { value: "#f0a45c", label: "살구" },
  { value: "#d7ae3c", label: "머스터드" },
  { value: "#9a8fa6", label: "그레이" },
];