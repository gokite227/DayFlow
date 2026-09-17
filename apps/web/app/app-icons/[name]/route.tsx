import { appIconResponse } from "@/lib/pwa/app-icon";
import { MANIFEST_ICONS, type ManifestIconName } from "@/lib/pwa/brand";

/** Manifest icons (192, 512, maskable 512), rendered once at build time. */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(MANIFEST_ICONS).map((name) => ({ name }));
}

export async function GET(_request: Request, context: RouteContext<"/app-icons/[name]">) {
  const { name } = await context.params;
  const icon = MANIFEST_ICONS[name as ManifestIconName];
  if (!icon) return new Response("Not found", { status: 404 });
  return appIconResponse(icon);
}
