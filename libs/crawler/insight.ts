import { canGenerateInsight, resolveEntitlements } from "@/libs/entitlements";
import { generateStructuredCompletion } from "@/libs/llm";
import type { DiffSeverity, DiffVerificationState } from "@/models/Diff";
import type { InsightSeverityGate } from "@/models/Insight";
import type { TrialStatus } from "@/types/entitlements";
import type {
  LlmInsightRecommendation,
  MoveClassificationLabel,
  StrategicEffort,
  StrategicRisk,
  StrategyType,
} from "@/types/insight";
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
  companyName: string;
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

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

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

const buildDiffDescription = (
  normalizedDiff: Record<string, unknown>,
  summary: PriceChangeSummary
): string => {
  const parts: string[] = [];

  if (summary.added > 0) {
    parts.push(`${summary.added} price point(s) added`);
  }
  if (summary.removed > 0) {
    parts.push(`${summary.removed} price point(s) removed`);
  }
  if (summary.updated > 0) {
    parts.push(`${summary.updated} price point(s) updated`);
  }

  const priceChanges = normalizedDiff.priceChanges;
  if (Array.isArray(priceChanges)) {
    for (const entry of priceChanges) {
      const bucket = asRecord(entry);
      if (!bucket) continue;

      const planName = typeof bucket.planName === "string" ? bucket.planName : null;
      const updatedAmounts = Array.isArray(bucket.updatedAmounts) ? bucket.updatedAmounts : [];

      for (const update of updatedAmounts) {
        const u = asRecord(update);
        if (!u) continue;
        const from = typeof u.from === "number" ? u.from : null;
        const to = typeof u.to === "number" ? u.to : null;
        const period = typeof u.period === "string" ? u.period : "";
        if (from !== null && to !== null) {
          const prefix = planName ? `${planName}: ` : "";
          parts.push(`${prefix}$${from}/${period} → $${to}/${period}`);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join(". ") : "Pricing structure changes detected";
};

/* ------------------------------------------------------------------ */
/*  Rules-v1 fallback engine                                           */
/* ------------------------------------------------------------------ */

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
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
};

const buildRulesV1Recommendation = (
  input: InsightBuildInput,
  summary: PriceChangeSummary
): Record<string, unknown> => {
  return {
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
};

/* ------------------------------------------------------------------ */
/*  LLM insight engine                                                 */
/* ------------------------------------------------------------------ */

const MOVE_CLASSIFICATION_LABELS: Set<string> = new Set([
  "Monetization shift",
  "Packaging shift",
  "Upmarket shift",
  "Land-and-expand shift",
  "Value framing shift",
  "Minor adjustment",
]);

const STRATEGY_TYPES: Set<string> = new Set([
  "Compete on price",
  "Compete on features",
  "Compete on positioning",
]);

const EFFORT_RISK_LEVELS: Set<string> = new Set(["Low", "Medium", "High"]);

const SYSTEM_PROMPT = `You are a competitive pricing analyst. Given a pricing change diff for a competitor, produce a structured JSON analysis.

Your response MUST be valid JSON with this exact shape:
{
  "summary": "1-2 sentence plain English summary of what changed and why it matters",
  "moveClassification": {
    "label": "<one of: Monetization shift, Packaging shift, Upmarket shift, Land-and-expand shift, Value framing shift, Minor adjustment>",
    "description": "1-sentence explanation of why this classification applies"
  },
  "strategicOptions": [
    {
      "strategy": "Compete on price",
      "action": "Specific actionable step for this week",
      "bestFor": "When this strategy makes sense",
      "effort": "<Low|Medium|High>",
      "risk": "<Low|Medium|High>"
    },
    {
      "strategy": "Compete on features",
      "action": "Specific actionable step for this week",
      "bestFor": "When this strategy makes sense",
      "effort": "<Low|Medium|High>",
      "risk": "<Low|Medium|High>"
    },
    {
      "strategy": "Compete on positioning",
      "action": "Specific actionable step for this week",
      "bestFor": "When this strategy makes sense",
      "effort": "<Low|Medium|High>",
      "risk": "<Low|Medium|High>"
    }
  ],
  "watchList": ["1-2 follow-up items to monitor next"]
}

Rules:
- Classification label MUST be exactly one of the 6 listed options.
- strategicOptions MUST have exactly 3 entries, one per strategy type.
- Actions must be specific and doable this week, not vague advice.
- Watch list should have 1-2 items maximum.`;

const buildUserPrompt = (
  input: InsightBuildInput,
  summary: PriceChangeSummary,
  diffDescription: string
): string => {
  const lines: string[] = [
    `Competitor: ${input.companyName}`,
    `Severity: ${input.severity}`,
    `Verification: ${input.verificationState}`,
    `Changes: ${diffDescription}`,
    `Diff summary: ${summary.added} added, ${summary.removed} removed, ${summary.updated} updated`,
  ];

  return lines.join("\n");
};

const validateLlmResponse = (
  parsed: Record<string, unknown>,
  input: InsightBuildInput,
  summary: PriceChangeSummary
): LlmInsightRecommendation | null => {
  if (typeof parsed.summary !== "string" || parsed.summary.length === 0) return null;

  const mc = asRecord(parsed.moveClassification);
  if (!mc) return null;
  if (typeof mc.label !== "string" || !MOVE_CLASSIFICATION_LABELS.has(mc.label)) return null;
  if (typeof mc.description !== "string") return null;

  if (!Array.isArray(parsed.strategicOptions) || parsed.strategicOptions.length !== 3) return null;

  const validatedOptions = [];
  for (const opt of parsed.strategicOptions) {
    const o = asRecord(opt);
    if (!o) return null;
    if (typeof o.strategy !== "string" || !STRATEGY_TYPES.has(o.strategy)) return null;
    if (typeof o.action !== "string" || o.action.length === 0) return null;
    if (typeof o.bestFor !== "string") return null;
    if (typeof o.effort !== "string" || !EFFORT_RISK_LEVELS.has(o.effort)) return null;
    if (typeof o.risk !== "string" || !EFFORT_RISK_LEVELS.has(o.risk)) return null;

    validatedOptions.push({
      strategy: o.strategy as StrategyType,
      action: o.action,
      bestFor: o.bestFor,
      effort: o.effort as StrategicEffort,
      risk: o.risk as StrategicRisk,
    });
  }

  if (!Array.isArray(parsed.watchList)) return null;
  const watchList = parsed.watchList
    .filter((item): item is string => typeof item === "string")
    .slice(0, 2);
  if (watchList.length === 0) return null;

  return {
    summary: parsed.summary,
    moveClassification: {
      label: mc.label as MoveClassificationLabel,
      description: mc.description,
    },
    strategicOptions: validatedOptions,
    watchList,
    severity: input.severity,
    verificationState: input.verificationState,
    diffSummary: summary,
  };
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export const buildInsightFromDiff = async (input: InsightBuildInput): Promise<InsightBuildResult> => {
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
  const diffDescription = buildDiffDescription(input.normalizedDiff, summary);

  // Attempt LLM-powered insight
  try {
    const userPrompt = buildUserPrompt(input, summary, diffDescription);
    const result = await generateStructuredCompletion(SYSTEM_PROMPT, userPrompt);

    if (result) {
      const validated = validateLlmResponse(result.parsed, input, summary);
      if (validated) {
        return {
          shouldCreate: true,
          createInput: {
            userId: input.user._id,
            companyId: input.companyId,
            diffId: input.diffId,
            model: "gpt-4o-mini",
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalCostUsd: result.totalCostUsd,
            recommendation: validated as unknown as Record<string, unknown>,
            severityGate: entitlements.insightSeverityGate,
            generatedAt: input.now,
            feedback: "none",
          },
        };
      }
    }
  } catch {
    // LLM failed — fall through to rules-v1
  }

  // Fallback: rules-v1 deterministic engine
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
      recommendation: buildRulesV1Recommendation(input, summary),
      severityGate: entitlements.insightSeverityGate,
      generatedAt: input.now,
      feedback: "none",
    },
  };
};
