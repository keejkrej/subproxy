import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@neondatabase/serverless"],
  async headers() {
    return [
      {
        source: "/v1/:path*",
        headers: [{ key: "X-Accel-Buffering", value: "no" }],
      },
    ];
  },
};

export default nextConfig;
