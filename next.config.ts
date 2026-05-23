import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
