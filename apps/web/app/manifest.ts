import type { MetadataRoute } from "next";
import { BRAND, MANIFEST_ICONS } from "../lib/pwa/brand";

/**
 * Web app manifest: "홈 화면에 추가" opens DayFlow without the browser UI (standalone), with the DayFlow background
 * while it starts. Colors are the existing tokens (--bg); no new brand color.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DayFlow",
    short_name: "DayFlow",
    description: "목표를 향해, 다시 시작하는 하루.",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: BRAND.background,
    theme_color: BRAND.background,
    icons: Object.entries(MANIFEST_ICONS).map(([name, icon]) => ({
      src: `/app-icons/${name}`,
      sizes: `${icon.size}x${icon.size}`,
      type: "image/png",
      purpose: icon.purpose,
    })),
  };
}
