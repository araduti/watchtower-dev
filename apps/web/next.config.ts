import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@watchtower/ui", "@watchtower/errors"],
  experimental: {
    reactCompiler: true,
  },
};

export default nextConfig;
