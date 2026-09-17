import { appIconResponse } from "@/lib/pwa/app-icon";

/** iPhone home screen icon (apple-touch-icon, 180×180). iOS rounds the corners itself. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIconResponse({ size: 180 });
}
