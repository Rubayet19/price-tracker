export const PLAN_TIERS = ["starter", "pro"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const ACCESS_SOURCES = ["none", "trial", "paid"] as const;
export type AccessSource = (typeof ACCESS_SOURCES)[number];

export const ACCESS_STATES = ["inactive", "trial_active", "paid_active"] as const;
export type AccessState = (typeof ACCESS_STATES)[number];

export const TRIAL_STATUSES = ["not_started", "active", "expired", "converted"] as const;
export type TrialStatus = (typeof TRIAL_STATUSES)[number];

export const INSIGHT_SEVERITIES = ["low", "medium", "high"] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export const INSIGHT_SEVERITY_GATES = ["high_only", "high_and_medium"] as const;
export type InsightSeverityGate = (typeof INSIGHT_SEVERITY_GATES)[number];

export interface PlanEntitlementRule {
  competitorLimit: number;
  insightSeverityGate: InsightSeverityGate;
  canReceiveWeeklyDigest: boolean;
}

export interface EntitlementsConfig {
  trialDays: number;
  trialPlanTier: PlanTier;
  paidFallbackPlanTier: PlanTier;
  plans: Record<PlanTier, PlanEntitlementRule>;
  severityGates: Record<InsightSeverityGate, InsightSeverity[]>;
}

export interface EntitlementUserLike {
  hasAccess: boolean;
  priceId?: string | null;
  trialStatus: TrialStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
}

export interface ResolvedEntitlements {
  hasAccess: boolean;
  accessSource: AccessSource;
  accessState: AccessState;
  planTier: PlanTier | null;
  competitorLimit: number;
  insightSeverityGate: InsightSeverityGate | null;
  allowedInsightSeverities: InsightSeverity[];
  canReceiveWeeklyDigest: boolean;
  trialDays: number;
}
