import { canGenerateInsight, resolveEntitlements } from "@/libs/entitlements";
import type { DiffSeverity, DiffVerificationState } from "@/models/Diff";
import type { InsightSeverityGate } from "@/models/Insight";
import type { TrialStatus } from "@/types/entitlements";
import type { Types } from "mongoose";

export interface InsightEligibleUser {
  _id: Types.ObjectId;
  hasAccess: boolean;
  priceId?: string | null;
  trialStatus: TrialStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
}

interface PriceChangeSummary {
  added: number;
  removed: number;
  updated: number;
}

export interface InsightBuildInput {
  user: InsightEligibleUser;
  companyId: Types.ObjectId;
  diffId: Types.ObjectId;
  severity: DiffSeverity;
  verificationState: DiffVerificationState;
  normalizedDiff: Record<string, unknown>;
  now: Date;
}

export interface InsightBuildResult {
  shouldCreate: boolean;
  reason?: string;
  createInput?: {
    userId: Types.ObjectId;
    companyId: Types.ObjectId;
    diffId: Types.ObjectId;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalCostUsd: number;
    recommendation: Record<string, unknown>;
    severityGate: InsightSeverityGate;
    generatedAt: Date;
    feedback: "none";
  };
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
};

const getPriceChangeSummary = (normalizedDiff: Record<string, unknown>): PriceChangeSummary => {
  const priceChangesRaw = normalizedDiff.priceChanges;
  if (!Array.isArray(priceChangesRaw)) {
    return { added: 0, removed: 0, updated: 0 };
  }

  let added = 0;
  let removed = 0;
  let updated = 0;

  for (const entry of priceChangesRaw) {
    const asBucket = asRecord(entry);
    if (!asBucket) {
      continue;
    }

    const addedAmounts = Array.isArray(asBucket.addedAmounts) ? asBucket.addedAmounts.length : 0;
    const removedAmounts = Array.isArray(asBucket.removedAmounts) ? asBucket.removedAmounts.length : 0;
    const updatedAmounts = Array.isArray(asBucket.updatedAmounts) ? asBucket.updatedAmounts.length : 0;

    added += addedAmounts;
    removed += removedAmounts;
    updated += updatedAmounts;
  }

  return { added, removed, updated };
};

const createActionItems = (
  severity: DiffSeverity,
  verificationState: DiffVerificationState,
  summary: PriceChangeSummary
): string[] => {
  const actions: string[] = [];

  if (severity === "high") {
    actions.push("Review competitor positioning and update your pricing strategy within 24 hours.");
  }

  if (summary.updated > 0) {
    actions.push("Compare changed price points against your plan tiers and conversion funnel performance.");
  }

  if (summary.added > 0 || summary.removed > 0) {
    actions.push("Audit your sales messaging for affected segments and adjust objection handling.");
  }

  if (verificationState === "unverified") {
    actions.push("Manually verify the competitor pricing page before acting on this change.");
  }

  if (actions.length === 0) {
    actions.push("Monitor this competitor for repeated movement before making pricing changes.");
  }

  return actions;
};

const getRiskLabel = (severity: DiffSeverity): "low" | "medium" | "high" => {
  if (severity === "high") {
    return "high";
  }

  if (severity === "medium") {
    return "medium";
  }

  return "low";
};

export const buildInsightFromDiff = (input: InsightBuildInput): InsightBuildResult => {
  const entitlements = resolveEntitlements(input.user, input.now);

  if (!entitlements.insightSeverityGate) {
    return {
      shouldCreate: false,
      reason: "No insight severity gate available for user",
    };
  }

  if (!canGenerateInsight(entitlements, input.severity)) {
    return {
      shouldCreate: false,
      reason: `Severity ${input.severity} not allowed for plan gate ${entitlements.insightSeverityGate}`,
    };
  }

  const summary = getPriceChangeSummary(input.normalizedDiff);
  const recommendation = {
    headline: `Competitor pricing moved (${input.severity})`,
    summary:
      summary.updated > 0
        ? `${summary.updated} existing price points changed.`
        : "New pricing structure changes were detected.",
    risk: getRiskLabel(input.severity),
    severity: input.severity,
    verificationState: input.verificationState,
    actionItems: createActionItems(input.severity, input.verificationState, summary),
    diffSummary: summary,
  };

  return {
    shouldCreate: true,
    createInput: {
      userId: input.user._id,
      companyId: input.companyId,
      diffId: input.diffId,
      model: "rules-v1",
      promptTokens: 0,
      completionTokens: 0,
      totalCostUsd: 0,
      recommendation,
      severityGate: entitlements.insightSeverityGate,
      generatedAt: input.now,
      feedback: "none",
    },
  };
};
