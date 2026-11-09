import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export", // static site for S3 + CloudFront
  images: { unoptimized: true },
  trailingSlash: false,
};

export default nextConfig;
