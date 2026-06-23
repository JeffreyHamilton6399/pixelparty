import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* No `output: "standalone"` — Vercel handles the build output. */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
