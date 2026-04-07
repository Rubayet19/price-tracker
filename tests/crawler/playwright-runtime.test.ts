import assert from "node:assert/strict";
import test from "node:test";

import {
  getChromiumPackUrl,
  registerStealthDependencyResolution,
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

test("playwright runtime appends the Vercel automation bypass secret to generated asset URLs", () => {
  const env = {
    VERCEL: "1",
    VERCEL_URL: "preview.example.vercel.app",
    VERCEL_AUTOMATION_BYPASS_SECRET: "secret-token",
  };

  assert.equal(
    getChromiumPackUrl(env),
    "https://preview.example.vercel.app/chromium-pack.tar?x-vercel-protection-bypass=secret-token"
  );
});

test("playwright runtime prefers the public production URL during production deploys", () => {
  const env = {
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_URL: "deployment-hash-user.vercel.app",
    VERCEL_PROJECT_PRODUCTION_URL: "pricingpulse.io",
  };

  assert.equal(
    getChromiumPackUrl(env),
    "https://pricingpulse.io/chromium-pack.tar"
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

test("playwright runtime registers explicit stealth dependency resolutions", async () => {
  const seen: string[] = [];

  await registerStealthDependencyResolution({
    setDependencyResolution(dependencyPath: string) {
      seen.push(dependencyPath);
      return this;
    },
  });

  assert.deepEqual(seen, [
    "stealth/evasions/chrome.app",
    "stealth/evasions/chrome.csi",
    "stealth/evasions/chrome.loadTimes",
    "stealth/evasions/chrome.runtime",
    "stealth/evasions/defaultArgs",
    "stealth/evasions/iframe.contentWindow",
    "stealth/evasions/media.codecs",
    "stealth/evasions/navigator.hardwareConcurrency",
    "stealth/evasions/navigator.languages",
    "stealth/evasions/navigator.permissions",
    "stealth/evasions/navigator.plugins",
    "stealth/evasions/navigator.webdriver",
    "stealth/evasions/sourceurl",
    "stealth/evasions/user-agent-override",
    "stealth/evasions/webgl.vendor",
    "stealth/evasions/window.outerdimensions",
  ]);
});
