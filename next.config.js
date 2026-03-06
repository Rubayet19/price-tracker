const { withSentryConfig } = require("@sentry/nextjs");

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
  serverExternalPackages: [
    "playwright",
    "playwright-core",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
  ],
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

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
});
