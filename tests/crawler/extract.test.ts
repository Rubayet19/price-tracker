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

test("static extraction does not collapse recurring pricing into one-time pricing when add-on packs exist", async (t) => {
  const originalFetch = global.fetch;
  const fixture = loadFixture("static-recurring-with-topups.html");

  global.fetch = async () => htmlResponse(fixture);
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await fetchAndExtractPricing("https://example.com/pricing", {
    allowPlaywrightFallback: false,
    allowLlmEnrichment: false,
  });

  assert.equal(result.status, "ok");
  assert.notEqual(result.pricingPayload.pricingModel, "one_time");
  assert.equal(
    result.pricingPayload.priceMentions.some(
      (price) => price.period === "month" || price.period === "year"
    ),
    true
  );
});

test("static extraction keeps one-time license pricing out of annual comparison even when copy mentions a year of updates", async (t) => {
  const originalFetch = global.fetch;
  const fixture = loadFixture("static-one-time-license-pricing.html");

  global.fetch = async () => htmlResponse(fixture);
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await fetchAndExtractPricing("https://example.com/pricing", {
    allowPlaywrightFallback: false,
    allowLlmEnrichment: false,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.pricingPayload.pricingModel, "one_time");
  assert.deepEqual(result.pricingPayload.comparisonCadences, []);
  assert.equal(
    result.pricingPayload.priceMentions.some((entry) => entry.period === "year"),
    false
  );
  assert.equal(
    result.pricingPayload.planNames.includes("how does supershrimp work"),
    false
  );
});

test("serialized pricing config enriches the payload with monthly and annual plans before playwright fallback", async (t) => {
  const originalFetch = global.fetch;
  const html = `
    <html>
      <head>
        <title>Pricing | Lessie AI Plans & Credits</title>
        <meta name="description" content="Discover Lessie AI’s flexible plans designed for every creator. Get up to 4500 credits monthly and save more with annual billing." />
        <script>
          self.__next_f.push([1,"{\\"pricingConfig\\":[{\\"name\\":\\"Basic\\",\\"monthlyPrice\\":39.9,\\"annuallyPrice\\":34,\\"description\\":\\"1000 Credits / month\\"},{\\"name\\":\\"Pro\\",\\"monthlyPrice\\":159,\\"annuallyPrice\\":135,\\"description\\":\\"4000 Credits / month\\"},{\\"name\\":\\"Max\\",\\"monthlyPrice\\":299,\\"annuallyPrice\\":254,\\"description\\":\\"9000 Credits / month\\"}]}"]);
        </script>
      </head>
      <body>
        <h1>Upgrade your plan for more credits</h1>
      </body>
    </html>
  `;

  global.fetch = async () => htmlResponse(html);
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await fetchAndExtractPricing("https://example.com/pricing", {
    allowPlaywrightFallback: false,
    allowLlmEnrichment: false,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.pricingPayload.pricingModel, "mixed_recurring");
  assert.deepEqual(result.pricingPayload.comparisonCadences, ["month", "year"]);
  assert.deepEqual(
    result.pricingPayload.extractedPlans?.map((plan) => ({
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
    })),
    [
      { name: "Basic", monthlyPrice: 39.9, annualPrice: 34 },
      { name: "Max", monthlyPrice: 299, annualPrice: 254 },
      { name: "Pro", monthlyPrice: 159, annualPrice: 135 },
    ]
  );
  assert.deepEqual(result.pricingPayload.extractionDebug?.enrichmentSources, [
    "script",
  ]);
});

test("anchored pricing scope does not bleed annual comparison noise from following faq sections", async (t) => {
  const originalFetch = global.fetch;
  const html = `
    <html>
      <body>
        <section id="pricing">
          <h2>Pricing</h2>
          <h3>SuperShrimp</h3>
          <p>One-time payment</p>
          <p>$17</p>
          <p>Launch price will increase to $29 soon.</p>
          <p>1 year of updates included.</p>
        </section>
        <section id="faq">
          <h3>How does SuperShrimp work?</h3>
          <p>Chronic back pain treatment costs $5,000 per year.</p>
        </section>
      </body>
    </html>
  `;

  global.fetch = async () => htmlResponse(html);
  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await fetchAndExtractPricing("https://example.com/pricing", {
    allowPlaywrightFallback: false,
    allowLlmEnrichment: false,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.pricingPayload.pricingModel, "one_time");
  assert.deepEqual(result.pricingPayload.comparisonCadences, []);
  assert.equal(
    result.pricingPayload.priceMentions.some((entry) => entry.period === "year"),
    false
  );
  assert.equal(
    result.pricingPayload.planNames.includes("how does supershrimp work"),
    false
  );
});
