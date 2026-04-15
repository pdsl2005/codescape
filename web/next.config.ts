import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true, // allow imports from outside the web/ directory (e.g. extension/src/webview/)
  },
};

export default nextConfig;
