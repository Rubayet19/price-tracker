/** @type {import('next').NextConfig} */
const distDir = process.env.NODE_ENV === "development" ? ".next-dev" : ".next";
const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";
const shouldTrustAuthHost =
  process.env.AUTH_TRUST_HOST === "true" ||
  nextAuthUrl.startsWith("https://") ||
  nextAuthUrl.startsWith("http://localhost") ||
  nextAuthUrl.startsWith("http://127.0.0.1") ||
  nextAuthUrl.startsWith("http://localtest.me");

if (shouldTrustAuthHost) {
  process.env.AUTH_TRUST_HOST = "true";
}

const nextConfig = {
  distDir,
  reactStrictMode: true,
  allowedDevOrigins: ["localtest.me"],
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
