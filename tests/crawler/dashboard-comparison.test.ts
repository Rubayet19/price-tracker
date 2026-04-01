import assert from "node:assert/strict";
import test from "node:test";

import {
  getCompetitorComparisonPrices,
  getCompetitorComparisonUnavailableReason,
} from "@/libs/dashboard-comparison";
import type { DashboardComparisonCompetitor } from "@/types/dashboard";

const competitorWithoutPlans: DashboardComparisonCompetitor = {
  companyId: "cmp_1",
  name: "Acme",
  domain: "acme.com",
  homepageUrl: "https://acme.com",
  primaryPricingUrl: "https://acme.com/pricing",
  pricingUrlCandidates: [],
  trust: {
    blockedOrManualNeeded: false,
    lastCrawlStatus: "ok",
    lastCrawlAt: null,
    lastCrawlError: null,
    latestConfidence: 0.78,
  },
  latestSnapshot: {
    snapshotId: "snap_1",
    capturedAt: new Date().toISOString(),
    confidence: 0.78,
    isVerified: false,
    pricingModel: "monthly_only",
    comparisonCadences: ["month"],
    pricePoints: [
      { amount: 12, currency: "USD", period: "month" },
      { amount: 29, currency: "USD", period: "month" },
    ],
    pricePointBuckets: [
      {
        currency: "USD",
        period: "month",
        count: 2,
        minAmount: 12,
        maxAmount: 29,
      },
    ],
    extractedPlans: [],
  },
};

test("dashboard comparison falls back to price buckets when named plans are unavailable", () => {
  const unavailableReason = getCompetitorComparisonUnavailableReason(
    competitorWithoutPlans,
    "month"
  );
  const prices = getCompetitorComparisonPrices(competitorWithoutPlans, "month");

  assert.equal(unavailableReason, null);
  assert.equal(prices.length, 1);
  assert.equal(prices[0]?.source, "bucket");
});
