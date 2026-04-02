import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const remotePatterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> =
  [];

if (supabaseUrl) {
  const { hostname } = new URL(supabaseUrl);
  remotePatterns.push({
    protocol: "https",
    hostname,
    pathname: "/storage/v1/object/public/post-images/**",
  });
}

const nextConfig: NextConfig = {
  images: {
    qualities: [75,80,85, 100],
    remotePatterns: [
      ...remotePatterns,
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ui-avatars.com",
        pathname: "/api/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
