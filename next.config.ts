import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // data/ (database, selfies, backups) is read at runtime, never part of the build
  outputFileTracingExcludes: { "*": ["./data/**/*"] },
  allowedDevOrigins: ['*.trycloudflare.com'],
};
export default nextConfig;
