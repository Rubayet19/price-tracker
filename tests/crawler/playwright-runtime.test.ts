import assert from "node:assert/strict";
import test from "node:test";

import {
  getChromiumPackUrl,
  shouldUseServerlessChromium,
} from "@/libs/crawler/playwright-runtime";

test("playwright runtime prefers an explicit Chromium tar URL override", () => {
  const env = {
    PLAYWRIGHT_CHROMIUM_TAR_URL: "https://cdn.example.com/custom-pack.tar",
    VERCEL: "1",
    VERCEL_URL: "preview.example.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "pricingpulse.io",
    SITE_URL: "https://pricingpulse.io",
  };

  assert.equal(
    getChromiumPackUrl(env),
    "https://cdn.example.com/custom-pack.tar"
  );
});

test("playwright runtime uses the current Vercel deployment asset before other URLs", () => {
  const env = {
    VERCEL: "1",
    VERCEL_URL: "preview.example.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "pricingpulse.io",
    SITE_URL: "https://pricingpulse.io",
  };

  assert.equal(
    getChromiumPackUrl(env),
    "https://preview.example.vercel.app/chromium-pack.tar"
  );
});

test("playwright runtime falls back to the production site URL when needed", () => {
  const env = {
    VERCEL: "1",
    SITE_URL: "https://pricingpulse.io",
  };

  assert.equal(
    getChromiumPackUrl(env),
    "https://pricingpulse.io/chromium-pack.tar"
  );
});

test("playwright runtime keeps serverless Chromium disabled outside Vercel", () => {
  const env = {
    SITE_URL: "https://pricingpulse.io",
  };

  assert.equal(shouldUseServerlessChromium(env), false);
  assert.equal(getChromiumPackUrl(env), null);
});
