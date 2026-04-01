import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { fetchAndExtractPricing } from "@/libs/crawler/extract";

const loadFixture = (name: string): string => {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
};

const htmlResponse = (html: string): Response => {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
};

test("static extraction scopes plan names to the pricing section", async (t) => {
  const originalFetch = global.fetch;
  const fixture = loadFixture("static-pricing-scope.html");

  global.fetch = async () => htmlResponse(fixture);
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await fetchAndExtractPricing("https://example.com/pricing");

  assert.equal(result.status, "ok");
  assert.deepEqual(result.pricingPayload.planNames, ["pro", "starter"]);
  assert.equal(result.pricingPayload.priceMentions.length, 2);
});

test("extraction payload includes compact debug evidence for the selected scope", async (t) => {
  const originalFetch = global.fetch;
  const fixture = loadFixture("static-pricing-scope.html");

  global.fetch = async () => htmlResponse(fixture);
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await fetchAndExtractPricing("https://example.com/pricing");

  assert.equal(result.status, "ok");
  assert.equal(
    result.pricingPayload.extractionDebug?.scopeStrategy,
    "pricing_section"
  );
  assert.equal(
    result.pricingPayload.extractionDebug?.selectedPlanTexts?.includes(
      "Starter"
    ),
    true
  );
  assert.equal(
    typeof result.pricingPayload.extractionDebug?.candidateCount,
    "number"
  );
});
