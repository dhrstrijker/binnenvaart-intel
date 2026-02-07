import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.rensendriessen.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "gallemakelaars.nl",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.gallemakelaars.nl",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.pcshipbrokers.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.gtsschepen.nl",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "gskbrokers.imgix.net",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
