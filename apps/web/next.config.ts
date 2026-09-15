import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Project instructions are maintained in the repository-root AGENTS.md.
  agentRules: false,
  // Workspace packages shipped as TypeScript source.
  transpilePackages: ["@dayflow/api-client", "@dayflow/domain"],
};

export default nextConfig;
