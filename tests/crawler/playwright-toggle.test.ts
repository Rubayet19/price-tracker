import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";

import { extractPricingWithPlaywright } from "@/libs/crawler/playwright-extract";

const loadFixture = (name: string): string => {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
};

const startFixtureServer = async (html: string) => {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to start fixture server");
  }

  return {
    url: `http://127.0.0.1:${address.port}/pricing`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
};

test("playwright extraction prefers explicit toggle states over inferred annual monthly copy", async (t) => {
  const server = await startFixtureServer(
    loadFixture("playwright-toggle-pricing.html")
  );
  t.after(async () => {
    await server.close();
  });

  const result = await extractPricingWithPlaywright(server.url);

  assert.ok(result);
  assert.deepEqual(result.pricingPayload.extractionDebug?.clickedCadences, [
    "month",
    "year",
  ]);

  const starter = result.pricingPayload.extractedPlans?.find(
    (plan) => plan.name === "Starter"
  );
  const professional = result.pricingPayload.extractedPlans?.find(
    (plan) => plan.name === "Professional"
  );

  assert.ok(starter);
  assert.ok(professional);
  assert.equal(starter.monthlyPrice, 19.99);
  assert.equal(starter.annualPrice, 9);
  assert.equal(starter.annualPriceIsPerMonth, true);
  assert.equal(professional.monthlyPrice, 39.99);
  assert.equal(professional.annualPrice, 19);
  assert.equal(professional.annualPriceIsPerMonth, true);
});

test("playwright extraction does not misfire cookie-dismiss logic on unrelated CTA buttons", async (t) => {
  const server = await startFixtureServer(
    loadFixture("playwright-toggle-cta-modal-pricing.html")
  );
  t.after(async () => {
    await server.close();
  });

  const result = await extractPricingWithPlaywright(server.url);

  assert.ok(result);
  const starter = result.pricingPayload.extractedPlans?.find(
    (plan) => plan.name === "Starter"
  );

  assert.ok(starter);
  assert.equal(starter.monthlyPrice, 19.99);
  assert.equal(starter.annualPrice, 9);
  assert.equal(starter.annualPriceIsPerMonth, true);
  assert.deepEqual(result.pricingPayload.extractionDebug?.clickedCadences, [
    "month",
    "year",
  ]);
});

test("playwright extraction ignores compare-table pricing noise outside the primary plan grid", async (t) => {
  const server = await startFixtureServer(
    loadFixture("playwright-compare-noise-pricing.html")
  );
  t.after(async () => {
    await server.close();
  });

  const result = await extractPricingWithPlaywright(server.url);

  assert.ok(result);
  assert.deepEqual(
    result.pricingPayload.extractedPlans?.map((plan) => ({
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      annualPriceIsPerMonth: plan.annualPriceIsPerMonth,
    })),
    [
      {
        name: "Annual Plan",
        monthlyPrice: null,
        annualPrice: 8.34,
        annualPriceIsPerMonth: true,
      },
      {
        name: "Monthly Plan",
        monthlyPrice: 24.99,
        annualPrice: null,
        annualPriceIsPerMonth: false,
      },
    ]
  );

  assert.deepEqual(result.pricingPayload.priceMentions, [
    { amount: 24.99, currency: "USD", period: "month" },
    { amount: 8.34, currency: "USD", period: "year" },
  ]);
  assert.ok(
    !result.pricingPayload.planNames.includes("premium+"),
    "secondary compare sections should not leak into canonical plan names"
  );
});
