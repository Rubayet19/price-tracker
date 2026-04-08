import assert from "node:assert/strict";
import test from "node:test";

import {
  getCompetitorComparisonPrices,
  getCompetitorComparisonUnavailableReason,
  summarizeCompetitorComparison,
} from "@/libs/dashboard-comparison";
import type { DashboardComparisonCompetitor } from "@/types/dashboard";
import type { SelfPricingProfileData } from "@/types/self-pricing";

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
    extractionDebug: null,
  },
};

const competitorWithOrderedPlanTexts: DashboardComparisonCompetitor = {
  ...competitorWithoutPlans,
  companyId: "cmp_2",
  latestSnapshot: {
    ...competitorWithoutPlans.latestSnapshot!,
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
    extractionDebug: {
      selectedPlanTexts: ["Basic", "Pro", "Max"],
    },
  },
};

test("dashboard comparison reconstructs named plans from ordered debug labels when extracted plans are unavailable", () => {
  const unavailableReason = getCompetitorComparisonUnavailableReason(
    competitorWithOrderedPlanTexts,
    "month"
  );
  const prices = getCompetitorComparisonPrices(
    competitorWithOrderedPlanTexts,
    "month"
  );

  assert.equal(unavailableReason, null);
  assert.deepEqual(
    prices.map((price) => ({
      label: price.label,
      amount: price.minAmount,
      source: price.source,
    })),
    [
      { label: "Basic", amount: 39.9, source: "plan" },
      { label: "Pro", amount: 159, source: "plan" },
      { label: "Max", amount: 299, source: "plan" },
    ]
  );
});

test("dashboard comparison no longer renders synthetic detected price range labels when named plans are unavailable", () => {
  const unavailableReason = getCompetitorComparisonUnavailableReason(
    competitorWithoutPlans,
    "month"
  );
  const prices = getCompetitorComparisonPrices(competitorWithoutPlans, "month");

  assert.match(unavailableReason ?? "", /tier names couldn't be extracted/i);
  assert.deepEqual(prices, []);
});

test("comparison summary compares competitor range against the self pricing baseline instead of restating the obvious range", () => {
  const selfPrices = [
    { name: "Starter", amount: 10, currency: "USD" },
    { name: "Growth", amount: 50, currency: "USD" },
    { name: "Scale", amount: 120, currency: "USD" },
  ];
  const competitorPrices = getCompetitorComparisonPrices(
    competitorWithOrderedPlanTexts,
    "month"
  );

  const summary = summarizeCompetitorComparison(
    competitorWithOrderedPlanTexts,
    competitorPrices,
    selfPrices,
    "month"
  );

  assert.equal(
    summary,
    "Competitor monthly pricing starts above your Starter tier and stretches beyond your highest tier, from $39.90 to $299."
  );
});
