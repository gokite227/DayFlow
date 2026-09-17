/** Existing DayFlow tokens used by the home screen app (globals.css: --bg, --accent, --accent-2). */
export const BRAND = {
  background: "#fff8fb",
  accent: "#ee749d",
  accent2: "#c78be7",
} as const;

/** The icons referenced by the web app manifest (served by app/app-icons/[name]/route.tsx). */
export const MANIFEST_ICONS = {
  "icon-192.png": { size: 192, letterScale: 0.62, purpose: "any" },
  "icon-512.png": { size: 512, letterScale: 0.62, purpose: "any" },
  // Maskable: Android may crop to a circle; the letter stays inside the central 80% safe zone.
  "maskable-512.png": { size: 512, letterScale: 0.46, purpose: "maskable" },
} as const;

export type ManifestIconName = keyof typeof MANIFEST_ICONS;
