import assert from "node:assert/strict";
import test from "node:test";

import { summarizeCompetitorSnapshot } from "@/libs/dashboard-competitor-summary";
import type { DashboardComparisonCompetitor } from "@/types/dashboard";

const baseCompetitor: DashboardComparisonCompetitor = {
  companyId: "cmp_summary",
  name: "Lessie",
  domain: "lessie.ai",
  homepageUrl: "https://lessie.ai",
  primaryPricingUrl: "https://lessie.ai/pricing",
  pricingUrlCandidates: [],
  trust: {
    blockedOrManualNeeded: false,
    lastCrawlStatus: "ok",
    lastCrawlAt: null,
    lastCrawlError: null,
    latestConfidence: 0.96,
  },
  latestSnapshot: {
    snapshotId: "snap_summary",
    capturedAt: new Date().toISOString(),
    confidence: 0.96,
    isVerified: true,
    pageDescription: null,
    pricingModel: "mixed_recurring",
    comparisonCadences: ["month", "year"],
    pricePoints: [
      { amount: 39.9, currency: "USD", period: "month" },
      { amount: 159, currency: "USD", period: "month" },
      { amount: 299, currency: "USD", period: "month" },
      { amount: 34, currency: "USD", period: "year" },
      { amount: 135, currency: "USD", period: "year" },
      { amount: 254, currency: "USD", period: "year" },
    ],
    pricePointBuckets: [
      {
        currency: "USD",
        period: "month",
        count: 3,
        minAmount: 39.9,
        maxAmount: 299,
      },
      {
        currency: "USD",
        period: "year",
        count: 3,
        minAmount: 34,
        maxAmount: 254,
      },
    ],
    extractedPlans: [],
    extractionDebug: {
      selectedPlanTexts: ["Basic", "Pro", "Max"],
      clickedCadences: ["month", "year"],
      scopeStrategy: "playwright",
    },
  },
};

test("competitor summary uses ordered fallback plan labels before claiming plan names could not be extracted", () => {
  const summary = summarizeCompetitorSnapshot(baseCompetitor);

  assert.equal(summary, "3 named plans extracted across 2 billing cadences.");
});

test("competitor summary only claims plan names could not be extracted when there are no extracted plans or fallback names", () => {
  const summary = summarizeCompetitorSnapshot({
    ...baseCompetitor,
    latestSnapshot: {
      ...baseCompetitor.latestSnapshot!,
      extractionDebug: null,
    },
  });

  assert.equal(summary, "Pricing detected, but plan names couldn't be extracted.");
});
