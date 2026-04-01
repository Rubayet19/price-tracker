import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedPricingPayload } from "@/libs/crawler/normalize";
import { mergePricingPayloadEnrichment } from "@/libs/crawler/llm-extract";
import { extractPricingFromJsonLd } from "@/libs/crawler/schema-extract";

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
