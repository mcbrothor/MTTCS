import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "framer-motion$": path.join(process.cwd(), "node_modules/framer-motion/dist/cjs/index.js"),
    };

    return config;
  },
};

export default nextConfig;
