import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { MongoClient, ObjectId } from "mongodb";
import { chromium } from "playwright";
import { encode } from "next-auth/jwt";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://localtest.me:${PORT}`;
const COOKIE_NAME = "authjs.session-token";

const parseEnvFile = (contents) => {
  const entries = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
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
  let contents;

  try {
    contents = await readFile(envPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const entries = parseEnvFile(contents);

  for (const [key, value] of Object.entries(entries)) {
    if (typeof process.env[key] === "undefined") {
      process.env[key] = value;
    }
  }
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep waiting.
    }

    await delay(1000);
  }

  throw new Error(`Server did not start at ${BASE_URL}`);
};

const startServer = async () => {
  const child = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NEXTAUTH_URL: BASE_URL,
      AUTH_TRUST_HOST: "true",
    },
    stdio: "inherit",
  });

  await waitForServer();
  return child;
};

const createSessionToken = async (userId) => {
  const sessionSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

  if (!sessionSecret) {
    throw new Error("NEXTAUTH_SECRET or AUTH_SECRET is required for smoke test sessions");
  }

  return encode({
    secret: sessionSecret,
    salt: COOKIE_NAME,
    token: {
      sub: userId,
      email: "smoke-test@price-tracker.local",
      name: "Smoke Test User",
    },
  });
};

const createSmokeUser = async (database) => {
  const smokeEmail = `smoke-${Date.now()}@price-tracker.local`;
  const userId = new ObjectId();

  await database.collection("users").insertOne({
    _id: userId,
    email: smokeEmail,
    name: "Smoke Test User",
    hasAccess: false,
    trialStartedAt: null,
    trialEndsAt: null,
    trialStatus: "not_started",
    lastDigestSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { userId, smokeEmail };
};

const cleanupSmokeUser = async (database, userId) => {
  const collections = ["users", "companies", "selfpricingprofiles", "snapshots", "diffs", "insights", "audits", "auditevents"];

  await Promise.all(
    collections.map(async (name) => {
      const collection = database.collection(name);
      await collection.deleteMany({ userId });
    })
  );

  await database.collection("users").deleteOne({ _id: userId });
};

const runBrowserFlow = async (sessionToken) => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: BASE_URL,
  });

  await context.addCookies([
    {
      name: COOKIE_NAME,
      value: sessionToken,
      domain: "localtest.me",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  await page.goto("/dashboard/changes", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForURL("**/dashboard/setup/self-pricing**");

  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForURL("**/dashboard/setup/self-pricing**");

  await page.getByLabel("Product name").fill("Price Tracker");
  await page.getByLabel("Primary domain").fill("price-tracker.local");
  await page.getByLabel("Homepage URL").fill("https://price-tracker.local");
  await page.getByLabel("Currency").fill("USD");
  await page.getByLabel("Plan name").first().fill("Starter");
  await page.getByLabel("Price").first().fill("19");
  await page.getByRole("button", { name: /save pricing and continue/i }).click();
  await page.waitForURL("**/dashboard/setup/trial");

  await page.getByRole("button", { name: /^start trial$/i }).click();
  await page.waitForURL("**/dashboard/setup/competitors");

  await page.getByLabel("Competitor name").fill("Smoke Competitor");
  await page.getByLabel("Domain").fill("localtest.me");
  await page.getByLabel("Homepage URL").fill(`${BASE_URL}/smoke/competitor-home.html`);
  await page.getByRole("button", { name: /^add competitor$/i }).click();
  await page.waitForURL("**/dashboard/setup/competitors/**/pricing");

  const candidateButton = page.locator("button").filter({ hasText: "competitor-pricing.html" }).first();
  if ((await candidateButton.count()) > 0) {
    await candidateButton.click();
  } else {
    await page.getByLabel("Manual pricing URL").fill(`${BASE_URL}/smoke/competitor-pricing.html`);
  }
  await page.getByRole("button", { name: /confirm pricing url/i }).click();
  await page.waitForURL("**/dashboard");

  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  await page.getByText("Smoke Competitor").waitFor();

  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("heading", { name: "Settings & Billing" }).waitFor();

  await browser.close();
};

const main = async () => {
  await loadEnv();

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for the smoke test");
  }

  const mongoClient = new MongoClient(process.env.MONGODB_URI);
  let server;
  let userId;

  try {
    await mongoClient.connect();
    const database = mongoClient.db();
    const smokeUser = await createSmokeUser(database);
    userId = smokeUser.userId;
    const sessionToken = await createSessionToken(smokeUser.userId.toString());
    server = await startServer();
    await runBrowserFlow(sessionToken);
    await cleanupSmokeUser(database, smokeUser.userId);
    console.log("Smoke dashboard flow passed");
  } finally {
    if (userId) {
      try {
        await cleanupSmokeUser(mongoClient.db(), userId);
      } catch {
        // Ignore cleanup errors on shutdown.
      }
    }

    if (server && !server.killed) {
      server.kill("SIGTERM");
    }

    await mongoClient.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
