import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Receipt and community photos are compressed in the browser (≤ 1600 px, ~0.5 MB each) before upload.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  poweredByHeader: false,
};

export default nextConfig;
