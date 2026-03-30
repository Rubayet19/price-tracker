import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { MongoClient, ObjectId } from "mongodb";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.CHECK_BASE_URL ?? "http://localhost:3010";
const COOKIE_NAME = "authjs.session-token";

const parseEnvFile = (contents) => {
  const entries = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
};

const loadEnv = async () => {
  const envPath = resolve(ROOT, ".env.local");
  const contents = await readFile(envPath, "utf8");
  const entries = parseEnvFile(contents);

  for (const [key, value] of Object.entries(entries)) {
    if (typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }
};

const createSessionToken = async (userId) => {
  const sessionSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

  if (!sessionSecret) {
    throw new Error(
      "NEXTAUTH_SECRET or AUTH_SECRET is required for dashboard checks"
    );
  }

  return encode({
    secret: sessionSecret,
    salt: COOKIE_NAME,
    token: {
      sub: userId,
      email: "dashboard-check@price-tracker.local",
      name: "Dashboard Check",
    },
  });
};

const insertDashboardFixture = async (database) => {
  const userId = new ObjectId();
  const selfCompanyId = new ObjectId();
  const competitorId = new ObjectId();
  const now = new Date();

  await database.collection("users").insertOne({
    _id: userId,
    email: `dashboard-check-${Date.now()}@price-tracker.local`,
    name: "Dashboard Check",
    hasAccess: true,
    customerId: null,
    priceId: null,
    trialStartedAt: null,
    trialEndsAt: null,
    trialStatus: "converted",
    lastDigestSentAt: null,
    createdAt: now,
    updatedAt: now,
  });

  await database.collection("selfpricingprofiles").insertOne({
    _id: new ObjectId(),
    userId,
    currency: "USD",
    plans: [{ name: "Starter", monthlyPrice: 19, annualPrice: 190 }],
    notes: null,
    createdAt: now,
    updatedAt: now,
  });

  await database.collection("companies").insertMany([
    {
      _id: selfCompanyId,
      userId,
      name: "Price Tracker",
      domain: "price-tracker.local",
      type: "self",
      homepageUrl: "https://price-tracker.local",
      primaryPricingUrl: "https://price-tracker.local/pricing",
      pricingUrlCandidates: [],
      lastCrawlStatus: "idle",
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: competitorId,
      userId,
      name: "Acme Competitor",
      domain: "acme.test",
      type: "competitor",
      homepageUrl: "https://acme.test",
      primaryPricingUrl: "https://acme.test/pricing",
      pricingUrlCandidates: [],
      lastCrawlStatus: "ok",
      lastCrawlAt: now,
      latestConfidence: 0.9,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await database.collection("snapshots").insertOne({
    _id: new ObjectId(),
    userId,
    companyId: competitorId,
    capturedAt: now,
    captureMethod: "static",
    confidence: 0.9,
    contentHash: `hash-${Date.now()}`,
    pricingPayload: {
      extractedPlans: [{ name: "Starter", currency: "USD", monthlyPrice: 29 }],
      priceMentions: [{ amount: 29, currency: "USD", period: "month" }],
      pricingModel: "monthly_only",
      comparisonCadences: ["month"],
    },
    isVerified: true,
    createdAt: now,
    updatedAt: now,
  });

  await database.collection("diffs").insertOne({
    _id: new ObjectId(),
    userId,
    companyId: competitorId,
    currentSnapshotId: new ObjectId(),
    normalizedDiff: {},
    severity: "low",
    verificationState: "verified",
    detectedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return { userId };
};

const cleanupDashboardFixture = async (database, userId) => {
  const collections = [
    "users",
    "companies",
    "selfpricingprofiles",
    "snapshots",
    "diffs",
    "insights",
  ];

  await Promise.all(
    collections.map((name) => database.collection(name).deleteMany({ userId }))
  );
};

const captureLoad = async (page, path) => {
  const requests = [];
  const onResponse = async (response) => {
    const url = new URL(response.url());
    if (
      !url.pathname.startsWith("/dashboard") &&
      !url.pathname.startsWith("/api/dashboard") &&
      url.pathname !== "/api/auth/session"
    ) {
      return;
    }

    requests.push({
      method: response.request().method(),
      pathname: url.pathname,
      search: url.search,
      status: response.status(),
    });
  };

  page.on("response", onResponse);
  await page.goto(`${BASE_URL}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForTimeout(1_500);
  page.off("response", onResponse);
  return requests;
};

const getSiblingPrefetches = (requests, currentPath) => {
  return requests.filter(
    (request) =>
      request.pathname.startsWith("/dashboard") &&
      request.pathname !== currentPath &&
      request.search.includes("_rsc=")
  );
};

const countPath = (requests, pathname) => {
  return requests.filter((request) => request.pathname === pathname).length;
};

const main = async () => {
  await loadEnv();

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for dashboard checks");
  }

  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  const browser = await chromium.launch({ headless: true });

  let userId;

  try {
    await mongoClient.connect();
    const database = mongoClient.db();
    const fixture = await insertDashboardFixture(database);
    userId = fixture.userId;

    const sessionToken = await createSessionToken(userId.toString());
    const context = await browser.newContext({ baseURL: BASE_URL });
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: sessionToken,
        url: `${BASE_URL}/`,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();
    const dashboardRequests = await captureLoad(page, "/dashboard");
    const changesRequests = await captureLoad(page, "/dashboard/changes");

    const dashboardPrefetches = getSiblingPrefetches(
      dashboardRequests,
      "/dashboard"
    );
    const changesPrefetches = getSiblingPrefetches(
      changesRequests,
      "/dashboard/changes"
    );

    assert.equal(
      dashboardPrefetches.length,
      0,
      `dashboard should not prefetch sibling dashboard routes, saw: ${dashboardPrefetches
        .map((request) => `${request.pathname}${request.search}`)
        .join(", ")}`
    );
    assert.equal(
      changesPrefetches.length,
      0,
      `changes should not prefetch sibling dashboard routes, saw: ${changesPrefetches
        .map((request) => `${request.pathname}${request.search}`)
        .join(", ")}`
    );
    assert.equal(
      countPath(dashboardRequests, "/api/dashboard/overview"),
      1,
      `dashboard should fetch overview once, saw ${countPath(
        dashboardRequests,
        "/api/dashboard/overview"
      )}`
    );
    assert.equal(
      countPath(changesRequests, "/api/dashboard/overview"),
      1,
      `changes should fetch overview once, saw ${countPath(
        changesRequests,
        "/api/dashboard/overview"
      )}`
    );

    await context.close();
    console.log("Dashboard network checks passed");
  } finally {
    if (userId) {
      await cleanupDashboardFixture(mongoClient.db(), userId);
    }

    await browser.close();
    await mongoClient.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
