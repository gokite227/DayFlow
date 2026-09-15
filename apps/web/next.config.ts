import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Project instructions are maintained in the repository-root AGENTS.md.
  agentRules: false,
  // Workspace package shipped as TypeScript source.
  transpilePackages: ["@dayflow/api-client"],
};

export default nextConfig;
