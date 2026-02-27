import config from "@/config";
import type {
  EntitlementUserLike,
  InsightSeverity,
  InsightSeverityGate,
  PlanTier,
  ResolvedEntitlements,
} from "@/types/entitlements";

const getPlanRule = (planTier: PlanTier) => config.entitlements.plans[planTier];

const getAllowedInsightSeverities = (gate: InsightSeverityGate): InsightSeverity[] => {
  return [...config.entitlements.severityGates[gate]];
};

export const resolvePlanTierFromPriceId = (priceId?: string | null): PlanTier | null => {
  if (!priceId) {
    return null;
  }

  const plan = config.stripe.plans.find((candidate) => candidate.priceId === priceId);
  return plan?.tier ?? null;
};

export const isTrialActive = (user: EntitlementUserLike, now: Date = new Date()): boolean => {
  if (user.trialStatus !== "active" || !user.trialEndsAt) {
    return false;
  }

  return user.trialEndsAt.getTime() > now.getTime();
};

export const resolveEntitlements = (
  user: EntitlementUserLike,
  now: Date = new Date()
): ResolvedEntitlements => {
  if (user.hasAccess) {
    const paidPlanTier =
      resolvePlanTierFromPriceId(user.priceId) ?? config.entitlements.paidFallbackPlanTier;
    const paidPlanRule = getPlanRule(paidPlanTier);

    return {
      hasAccess: true,
      accessSource: "paid",
      accessState: "paid_active",
      planTier: paidPlanTier,
      competitorLimit: paidPlanRule.competitorLimit,
      insightSeverityGate: paidPlanRule.insightSeverityGate,
      allowedInsightSeverities: getAllowedInsightSeverities(paidPlanRule.insightSeverityGate),
      canReceiveWeeklyDigest: paidPlanRule.canReceiveWeeklyDigest,
      trialDays: config.entitlements.trialDays,
    };
  }

  if (isTrialActive(user, now)) {
    const trialPlanTier = config.entitlements.trialPlanTier;
    const trialPlanRule = getPlanRule(trialPlanTier);

    return {
      hasAccess: true,
      accessSource: "trial",
      accessState: "trial_active",
      planTier: trialPlanTier,
      competitorLimit: trialPlanRule.competitorLimit,
      insightSeverityGate: trialPlanRule.insightSeverityGate,
      allowedInsightSeverities: getAllowedInsightSeverities(trialPlanRule.insightSeverityGate),
      canReceiveWeeklyDigest: false,
      trialDays: config.entitlements.trialDays,
    };
  }

  return {
    hasAccess: false,
    accessSource: "none",
    accessState: "inactive",
    planTier: null,
    competitorLimit: 0,
    insightSeverityGate: null,
    allowedInsightSeverities: [],
    canReceiveWeeklyDigest: false,
    trialDays: config.entitlements.trialDays,
  };
};

export const canAddCompetitor = (
  entitlements: ResolvedEntitlements,
  currentCount: number
): boolean => {
  return entitlements.hasAccess && currentCount < entitlements.competitorLimit;
};

export const canGenerateInsight = (
  entitlements: ResolvedEntitlements,
  severity: InsightSeverity
): boolean => {
  return entitlements.hasAccess && entitlements.allowedInsightSeverities.includes(severity);
};

export const canReceiveWeeklyDigest = (entitlements: ResolvedEntitlements): boolean => {
  return entitlements.hasAccess && entitlements.canReceiveWeeklyDigest;
};
