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
    remotePatterns: [
      ...remotePatterns,
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
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
