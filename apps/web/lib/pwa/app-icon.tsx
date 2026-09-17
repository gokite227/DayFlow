import { ImageResponse } from "next/og";
import { BRAND } from "./brand";

export interface AppIconOptions {
  size: number;
  /**
   * Share of the icon the letter may use. Maskable icons keep everything inside the central 80% safe zone, so the
   * letter is smaller there.
   */
  letterScale?: number;
}

/**
 * DayFlow home screen / favicon icon, drawn from the existing brand tokens (globals.css): the accent pink to the
 * lavender accent-2, with a white "D". Full-bleed and square: iOS and Android apply their own corner mask, so the
 * image has no rounded corners of its own.
 */
export function appIconResponse({ size, letterScale = 0.62 }: AppIconOptions): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${BRAND.accent} 0%, ${BRAND.accent2} 100%)`,
          color: "#ffffff",
          fontSize: Math.round(size * letterScale),
          fontWeight: 800,
          letterSpacing: -Math.round(size * 0.02),
          lineHeight: 1,
          paddingBottom: Math.round(size * 0.04),
        }}
      >
        D
      </div>
    ),
    { width: size, height: size },
  );
}
