import type { NextConfig } from "next";
import path from "node:path";

const scriptPolicy = process.env.NODE_ENV === 'production'
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['@resvg/resvg-js'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: `default-src 'self'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
      ],
    }];
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "framer-motion$": path.join(process.cwd(), "node_modules/framer-motion/dist/cjs/index.js"),
    };

    // Prevent hot-reload triggers from E2E test artifacts
    config.watchOptions = {
      ...(config.watchOptions || {}),
      ignored: [
        ...(Array.isArray(config.watchOptions?.ignored) ? config.watchOptions.ignored : []),
        '**/test-results/**',
        '**/playwright-report/**',
        '**/playwright-report-smoke/**',
        '**/.next-e2e/**',
      ],
    };

    return config;
  },
};

export default nextConfig;
