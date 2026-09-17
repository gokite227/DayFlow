/**
 * The build this deployment serves, never cached. An open DayFlow compares it with the build it was loaded from and
 * offers a reload after a new deployment (a home-screen app can stay open for days).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_DAYFLOW_BUILD_ID ?? "local" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
