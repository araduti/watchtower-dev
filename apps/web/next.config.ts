import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@watchtower/ui", "@watchtower/errors"],
};

export default nextConfig;
