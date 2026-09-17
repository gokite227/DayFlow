import type { NextConfig } from "next";

const apiBaseUrl = process.env.NEXT_PUBLIC_DAYFLOW_API_BASE_URL?.replace(/\/+$/, "");

/** Identifies a deployment (Vercel sets these at build time); "local" disables the new-version notice. */
const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "local";

const nextConfig: NextConfig = {
  // Project instructions are maintained in the repository-root AGENTS.md.
  agentRules: false,
  // Workspace packages shipped as TypeScript source.
  transpilePackages: ["@dayflow/api-client", "@dayflow/domain"],
  env: {
    NEXT_PUBLIC_DAYFLOW_BUILD_ID: buildId,
  },
  /**
   * AUTH-004: the refresh token cookie endpoints are called on the Web's own origin and proxied to the API.
   * In production Web (*.vercel.app) and API (*.up.railway.app) are different sites, and browsers block or
   * partition third-party cookies (Safari and Firefox by default), so a cookie set by the API's own origin
   * would not survive a reload. Through this rewrite the cookie is first-party on the Web origin
   * (HttpOnly, Secure, SameSite=Lax, Path=/api/v1/auth). Every other API call goes straight to the API
   * with the Bearer access token, and Google login starts on the API origin.
   */
  async rewrites() {
    if (!apiBaseUrl) return [];
    return [
      {
        source: "/api/v1/auth/:action(exchange|refresh|logout)",
        destination: `${apiBaseUrl}/api/v1/auth/:action`,
      },
    ];
  },
  /** The service worker itself is never cached, so a fix to it reaches every installed app on the next visit. */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
