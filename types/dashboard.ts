import type { PlanTier } from "@/types/entitlements";
import type { PricingUrlCandidate } from "@/types/companies";

export type DashboardCrawlStatus = "idle" | "ok" | "blocked" | "manual_needed" | "error";
export type DashboardDiffSeverity = "low" | "medium" | "high";
export type DashboardVerificationState = "verified" | "unverified";

export interface DashboardEntitlements {
  hasAccess: boolean;
  accessSource: "none" | "trial" | "paid";
  accessState: "inactive" | "trial_active" | "paid_active";
  planTier: PlanTier | null;
  competitorLimit: number;
  canReceiveWeeklyDigest: boolean;
}

export interface DashboardOverviewResponse {
  entitlements: DashboardEntitlements;
  billing: {
    priceId: string | null;
    hasCustomerId: boolean;
  };
  trial: {
    status: "not_started" | "active" | "expired" | "converted";
    startedAt: string | null;
    endsAt: string | null;
    isActive: boolean;
  };
  companyCounts: {
    self: number;
    competitor: number;
    total: number;
  };
  competitorStatusCounts: Record<DashboardCrawlStatus, number>;
  recentVerifiedChanges7d: {
    windowStart: string;
    countsBySeverity: Record<DashboardDiffSeverity, number>;
    total: number;
  };
}

export interface DashboardFeedRow {
  diffId: string;
  severity: DashboardDiffSeverity;
  verificationState: DashboardVerificationState;
  detectedAt: string;
  normalizedDiff: Record<string, unknown>;
  company: {
    companyId: string;
    name: string;
    domain: string;
    type: "self" | "competitor";
    lastCrawlStatus: DashboardCrawlStatus;
    lastCrawlAt: string | null;
    latestConfidence: number | null;
  };
  latestInsight: {
    insightId: string;
    generatedAt: string;
    severityGate: "high_only" | "high_and_medium";
    recommendation: Record<string, unknown>;
  } | null;
  trustCues: {
    detectedAt: string;
    verificationState: DashboardVerificationState;
    companyLastCrawlAt: string | null;
    latestConfidence: number | null;
  };
}

export interface DashboardFeedResponse {
  rows: DashboardFeedRow[];
  pageInfo: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface DashboardComparisonCompetitor {
  companyId: string;
  name: string;
  domain: string;
  homepageUrl: string | null;
  primaryPricingUrl: string | null;
  pricingUrlCandidates: PricingUrlCandidate[];
  trust: {
    blockedOrManualNeeded: boolean;
    lastCrawlStatus: DashboardCrawlStatus;
    lastCrawlAt: string | null;
    lastCrawlError: string | null;
    latestConfidence: number | null;
  };
  latestSnapshot: {
    snapshotId: string;
    capturedAt: string;
    confidence: number;
    isVerified: boolean;
    pricePoints: Array<{
      amount: number;
      currency: string;
      period: string;
    }>;
    pricePointBuckets: Array<{
      currency: string;
      period: string;
      count: number;
      minAmount: number;
      maxAmount: number;
    }>;
  } | null;
}

export interface DashboardComparisonResponse {
  selfPricingProfile: {
    name?: string;
  } | null;
  competitors: DashboardComparisonCompetitor[];
}

export type FeedSeverityFilter = "all" | "low" | "medium" | "high";
export type FeedVerificationFilter = "all" | "verified" | "unverified";

export interface FeedFilters {
  severity: FeedSeverityFilter;
  verificationState: FeedVerificationFilter;
}
