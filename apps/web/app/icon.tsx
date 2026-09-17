import { appIconResponse } from "@/lib/pwa/app-icon";

/** Browser tab icon. */
export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return appIconResponse({ size: 48, letterScale: 0.7 });
}
