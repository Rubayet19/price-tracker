import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedPricingPayload } from "@/libs/crawler/normalize";
import { mergePricingPayloadEnrichment } from "@/libs/crawler/llm-extract";
import {
  extractPricingFromJsonLd,
  extractPricingFromStructuredScripts,
} from "@/libs/crawler/schema-extract";

test("json-ld extraction captures plan descriptions and feature lists", () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "WebPage",
                "description": "Acme pricing with a 14-day free trial."
              },
              {
                "@type": "Product",
                "name": "Starter",
                "description": "Starter plan for small teams.",
                "featureList": ["Unlimited boards", "Email support"],
                "offers": {
                  "@type": "Offer",
                  "price": "12",
                  "priceCurrency": "USD"
                }
              },
              {
                "@type": "Product",
                "name": "Pro",
                "description": "Advanced collaboration plan.",
                "featureList": ["Priority support", "SSO"],
                "offers": {
                  "@type": "Offer",
                  "price": "29",
                  "priceCurrency": "USD"
                }
              }
            ]
          }
        </script>
      </head>
      <body></body>
    </html>
  `;

  const result = extractPricingFromJsonLd(html);

  assert.equal(result.pageDescription, "Acme pricing with a 14-day free trial.");
  assert.equal(result.extractedPlans.length, 2);
  assert.deepEqual(result.extractedPlans[0]?.features, [
    "Unlimited boards",
    "Email support",
  ]);
});

test("llm enrichment fills soft fields and cadence without overriding structural prices", () => {
  const payload: NormalizedPricingPayload = {
    sourceUrl: "https://acme.com/pricing",
    pageTitle: "Acme Pricing",
    pageDescription: null,
    planNames: ["starter", "pro"],
    priceMentions: [
      { amount: 12, currency: "USD", period: "unknown" },
      { amount: 29, currency: "USD", period: "unknown" },
    ],
    extractedPlans: [],
    customPricingHints: [],
    oneTimePricingHints: [],
    pricingModel: "unknown",
    comparisonCadences: [],
  };

  const enriched = mergePricingPayloadEnrichment(payload, {
    pageDescription: "Acme pricing with a 14-day free trial.",
    comparisonCadenceHints: ["month"],
    plans: [
      {
        name: "Starter",
        price: 999,
        currency: "USD",
        cadenceHint: "month",
        description: "Starter plan for small teams.",
        features: ["Unlimited boards", "Email support"],
        hasFreeTrial: true,
        trialDetails: "14-day free trial",
      },
      {
        name: "Pro",
        price: 29,
        currency: "USD",
        cadenceHint: "month",
        description: "Advanced collaboration plan.",
        features: ["Priority support", "SSO"],
        hasFreeTrial: true,
        trialDetails: "14-day free trial",
      },
    ],
  });

  assert.equal(enriched.pageDescription, "Acme pricing with a 14-day free trial.");
  assert.deepEqual(
    enriched.priceMentions.map((entry) => entry.period),
    ["month", "month"]
  );
  assert.equal(enriched.extractedPlans?.length, 1);
  assert.equal(enriched.extractedPlans?.[0]?.name, "Pro");
  assert.equal(enriched.extractedPlans?.[0]?.monthlyPrice, 29);
  assert.equal(
    enriched.extractedPlans?.[0]?.description,
    "Advanced collaboration plan."
  );
});

test("structured script extraction recovers monthly and annual pricing from serialized app config", () => {
  const html = `
    <html>
      <head>
        <script>
          self.__next_f.push([1,"{\\"pricingConfig\\":[{\\"name\\":\\"Basic\\",\\"monthlyPrice\\":39.9,\\"annuallyPrice\\":34,\\"description\\":\\"1000 Credits / month\\"},{\\"name\\":\\"Pro\\",\\"monthlyPrice\\":159,\\"annuallyPrice\\":135,\\"description\\":\\"4000 Credits / month\\"},{\\"name\\":\\"Max\\",\\"monthlyPrice\\":299,\\"annuallyPrice\\":254,\\"description\\":\\"9000 Credits / month\\"}]}"]);
        </script>
      </head>
      <body></body>
    </html>
  `;

  const result = extractPricingFromStructuredScripts(html);

  assert.deepEqual(
    result.extractedPlans.map((plan) => ({
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      annualPriceIsPerMonth: plan.annualPriceIsPerMonth,
    })),
    [
      {
        name: "Basic",
        monthlyPrice: 39.9,
        annualPrice: 34,
        annualPriceIsPerMonth: true,
      },
      {
        name: "Pro",
        monthlyPrice: 159,
        annualPrice: 135,
        annualPriceIsPerMonth: true,
      },
      {
        name: "Max",
        monthlyPrice: 299,
        annualPrice: 254,
        annualPriceIsPerMonth: true,
      },
    ]
  );
  assert.deepEqual(
    result.priceMentions.map((entry) => ({
      amount: entry.amount,
      period: entry.period,
    })),
    [
      { amount: 39.9, period: "month" },
      { amount: 34, period: "year" },
      { amount: 159, period: "month" },
      { amount: 135, period: "year" },
      { amount: 299, period: "month" },
      { amount: 254, period: "year" },
    ]
  );
});

test("llm enrichment does not turn one-time pricing into recurring pricing", () => {
  const payload: NormalizedPricingPayload = {
    sourceUrl: "https://example.com/pricing",
    pageTitle: "SuperShrimp Pricing",
    pageDescription: "One-time payment posture app.",
    planNames: ["supershrimp"],
    priceMentions: [
      { amount: 17, currency: "USD", period: "one_time" },
      { amount: 29, currency: "USD", period: "unknown" },
      { amount: 5000, currency: "USD", period: "unknown" },
    ],
    extractedPlans: [],
    customPricingHints: [],
    oneTimePricingHints: ["one-time payment"],
    pricingModel: "one_time",
    comparisonCadences: [],
  };

  const enriched = mergePricingPayloadEnrichment(payload, {
    pageDescription: "One-time payment with a year of updates.",
    comparisonCadenceHints: ["year"],
    plans: [
      {
        name: "SuperShrimp",
        price: 17,
        currency: "USD",
        cadenceHint: "one_time",
        description: "One-time payment with all features included.",
        features: ["1 year of updates", "30-day money-back guarantee"],
        hasFreeTrial: false,
      },
      {
        name: "Chronic Back Pain Treatment",
        price: 5000,
        currency: "USD",
        cadenceHint: "year",
        description: "Runs $5,000 per year.",
      },
    ],
  });

  assert.equal(enriched.pricingModel, "one_time");
  assert.deepEqual(enriched.comparisonCadences, []);
  assert.deepEqual(
    enriched.priceMentions.map((entry) => entry.period),
    ["one_time", "unknown", "unknown"]
  );
});
