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
        hostname: "*.rensendriessen.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "gallemakelaars.nl",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.gallemakelaars.nl",
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
};

export default nextConfig;
