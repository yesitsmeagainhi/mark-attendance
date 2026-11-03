import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // data/ (database, selfies, backups) is read at runtime, never part of the build
  outputFileTracingExcludes: { "*": ["./data/**/*"] },
  allowedDevOrigins: ["192.168.0.199"],
};

export default nextConfig;
