import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@inventory": __dirname,
      "@inventory/instant.schema": path.join(__dirname, "instant.schema"),
    };
    return config;
  },
};

export default nextConfig;
