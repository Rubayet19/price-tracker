/** @type {import('next').NextConfig} */
const distDir = process.env.NODE_ENV === "development" ? ".next-dev" : ".next";

const nextConfig = {
  distDir,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // NextJS <Image> component needs to whitelist domains for src={}
      {
        protocol: "https",
        hostname: "**.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "pbs.twimg.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "logos-world.net",
      },
    ],
  },
};

module.exports = nextConfig;
