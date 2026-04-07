import { z } from "zod";
import { generateSchemaCompletion } from "@/libs/llm";
import {
  canonicalizePricingPayload,
  type ComparisonCadence,
  type NormalizedExtractedPlan,
  type NormalizedPricingPayload,
} from "@/libs/crawler/normalize";

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const PricingPlanEnrichmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: z.number().positive().nullable().optional(),
  currency: z.string().trim().min(1).max(8).nullable().optional(),
  cadenceHint: z.enum(["month", "year", "one_time", "unknown"]).default("unknown"),
  description: z.string().trim().max(280).nullable().optional(),
  features: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  hasFreeTrial: z.boolean().nullable().optional(),
  trialDetails: z.string().trim().max(180).nullable().optional(),
});

const PricingPayloadEnrichmentSchema = z.object({
  pageDescription: z.string().trim().max(280).nullable().optional(),
  comparisonCadenceHints: z
    .array(z.enum(["month", "year"]))
    .max(2)
    .default([]),
  plans: z.array(PricingPlanEnrichmentSchema).max(12).default([]),
});

export type PricingPayloadEnrichment = z.infer<
  typeof PricingPayloadEnrichmentSchema
>;

const hasSoftFieldGaps = (payload: NormalizedPricingPayload): boolean => {
  if (!payload.pageDescription && (payload.extractedPlans?.length ?? 0) > 0) {
    return true;
  }

  return (payload.extractedPlans ?? []).some((plan) => {
    const hasFeatures = Array.isArray(plan.features) && plan.features.length > 0;
    return !plan.description || !hasFeatures || plan.hasFreeTrial === null;
  });
};

export const shouldRunLlmPricingEnrichment = (input: {
  payload: NormalizedPricingPayload;
  confidence: number;
}): boolean => {
  const { payload, confidence } = input;

  if (payload.priceMentions.length === 0 && (payload.extractedPlans?.length ?? 0) === 0) {
    return false;
  }

  if (confidence < 0.78) {
    return true;
  }

  if (payload.pricingModel === "unknown") {
    return true;
  }

  if (
    payload.pricingModel === "one_time" ||
    ((payload.oneTimePricingHints?.length ?? 0) > 0 &&
      (payload.comparisonCadences?.length ?? 0) === 0)
  ) {
    return false;
  }

  if (confidence >= 0.86) {
    return false;
  }

  return hasSoftFieldGaps(payload);
};

const buildPricingSummary = (payload: NormalizedPricingPayload): string => {
  const planLines = (payload.extractedPlans ?? [])
    .map((plan) => {
      const monthly =
        typeof plan.monthlyPrice === "number" ? `${plan.monthlyPrice}/month` : "n/a";
      const annual =
        typeof plan.annualPrice === "number" ? `${plan.annualPrice}/year` : "n/a";
      return `- ${plan.name}: monthly=${monthly}, annual=${annual}`;
    })
    .join("\n");

  const priceLines = payload.priceMentions
    .map(
      (price) => `- ${price.currency} ${price.amount} (${price.period})`
    )
    .join("\n");

  return [
    `Page title: ${payload.pageTitle ?? "unknown"}`,
    `Page description: ${payload.pageDescription ?? "unknown"}`,
    `Known plan names: ${payload.planNames.join(", ") || "none"}`,
    `Known plan pricing:\n${planLines || "- none"}`,
    `Detected price mentions:\n${priceLines || "- none"}`,
  ].join("\n");
};

const buildPrompt = (input: {
  payload: NormalizedPricingPayload;
  scopeText: string;
}): { systemPrompt: string; userPrompt: string } => {
  const scopeText = normalizeWhitespace(input.scopeText).slice(0, 6_000);

  return {
    systemPrompt:
      "Extract only pricing enrichment from SaaS pricing page text. Never invent prices. If a price is not explicitly present in the provided text, return price=null. Only use cadenceHint when the text supports it. Keep descriptions short and features concise.",
    userPrompt: [
      buildPricingSummary(input.payload),
      "",
      "Scoped pricing page text:",
      scopeText || "[no scoped text available]",
    ].join("\n"),
  };
};

const normalizePlanName = (value: string): string => {
  return normalizeWhitespace(value).toLowerCase();
};

const buildStructuralPriceMap = (payload: NormalizedPricingPayload): Map<string, Set<number>> => {
  const map = new Map<string, Set<number>>();

  for (const price of payload.priceMentions) {
    const key = price.currency.toUpperCase();
    if (!map.has(key)) {
      map.set(key, new Set<number>());
    }
    map.get(key)?.add(Number(price.amount.toFixed(2)));
  }

  for (const plan of payload.extractedPlans ?? []) {
    const currency = plan.currency?.toUpperCase();
    if (!currency) {
      continue;
    }

    if (!map.has(currency)) {
      map.set(currency, new Set<number>());
    }

    if (typeof plan.monthlyPrice === "number") {
      map.get(currency)?.add(Number(plan.monthlyPrice.toFixed(2)));
    }

    if (typeof plan.annualPrice === "number") {
      map.get(currency)?.add(Number(plan.annualPrice.toFixed(2)));
    }
  }

  return map;
};

const upsertExtractedPlan = (
  plans: NormalizedExtractedPlan[],
  enrichmentPlan: PricingPayloadEnrichment["plans"][number],
  allowPriceInsert: boolean
): void => {
  const normalizedName = normalizePlanName(enrichmentPlan.name);
  const existing = plans.find(
    (plan) => normalizePlanName(plan.name) === normalizedName
  );

  const normalizedDescription =
    typeof enrichmentPlan.description === "string" &&
    normalizeWhitespace(enrichmentPlan.description).length > 0
      ? normalizeWhitespace(enrichmentPlan.description)
      : null;
  const normalizedTrialDetails =
    typeof enrichmentPlan.trialDetails === "string" &&
    normalizeWhitespace(enrichmentPlan.trialDetails).length > 0
      ? normalizeWhitespace(enrichmentPlan.trialDetails)
      : null;
  const normalizedFeatures = [
    ...new Set(
      (Array.isArray(enrichmentPlan.features) ? enrichmentPlan.features : [])
        .map((feature) => normalizeWhitespace(feature))
        .filter(Boolean)
    ),
  ].slice(0, 12);

  if (existing) {
    if (!existing.description && normalizedDescription) {
      existing.description = normalizedDescription;
    }
    if (normalizedFeatures.length > 0) {
      existing.features = [
        ...new Set([...(existing.features ?? []), ...normalizedFeatures]),
      ].slice(0, 12);
    }
    if (existing.hasFreeTrial == null && typeof enrichmentPlan.hasFreeTrial === "boolean") {
      existing.hasFreeTrial = enrichmentPlan.hasFreeTrial;
    }
    if (!existing.trialDetails && normalizedTrialDetails) {
      existing.trialDetails = normalizedTrialDetails;
    }

    if (
      allowPriceInsert &&
      typeof enrichmentPlan.price === "number" &&
      enrichmentPlan.cadenceHint === "month" &&
      existing.monthlyPrice == null
    ) {
      existing.monthlyPrice = enrichmentPlan.price;
    }

    if (
      allowPriceInsert &&
      typeof enrichmentPlan.price === "number" &&
      enrichmentPlan.cadenceHint === "year" &&
      existing.annualPrice == null
    ) {
      existing.annualPrice = enrichmentPlan.price;
    }
    return;
  }

  if (!allowPriceInsert) {
    return;
  }

  plans.push({
    name: normalizeWhitespace(enrichmentPlan.name),
    currency:
      typeof enrichmentPlan.currency === "string"
        ? normalizeWhitespace(enrichmentPlan.currency).toUpperCase()
        : null,
    monthlyPrice:
      enrichmentPlan.cadenceHint === "month" &&
      typeof enrichmentPlan.price === "number"
        ? enrichmentPlan.price
        : null,
    annualPrice:
      enrichmentPlan.cadenceHint === "year" &&
      typeof enrichmentPlan.price === "number"
        ? enrichmentPlan.price
        : null,
    description: normalizedDescription,
    features: normalizedFeatures,
    hasFreeTrial:
      typeof enrichmentPlan.hasFreeTrial === "boolean"
        ? enrichmentPlan.hasFreeTrial
        : null,
    trialDetails: normalizedTrialDetails,
  });
};

export const mergePricingPayloadEnrichment = (
  payload: NormalizedPricingPayload,
  enrichment: PricingPayloadEnrichment
): NormalizedPricingPayload => {
  const structuralPriceMap = buildStructuralPriceMap(payload);
  const updatedPriceMentions = payload.priceMentions.map((entry) => ({ ...entry }));
  const updatedPlans = [...(payload.extractedPlans ?? [])].map((plan) => ({
    ...plan,
    features: [...(plan.features ?? [])],
  }));
  const matchedCadenceByPriceKey = new Map<string, ComparisonCadence>();
  const allowRecurringCadenceHints =
    payload.pricingModel !== "one_time" &&
    !(
      (payload.oneTimePricingHints?.length ?? 0) > 0 &&
      (payload.comparisonCadences?.length ?? 0) === 0
    );

  for (const plan of enrichment.plans) {
    const currency =
      typeof plan.currency === "string"
        ? normalizeWhitespace(plan.currency).toUpperCase()
        : null;
    const roundedPrice =
      typeof plan.price === "number" ? Number(plan.price.toFixed(2)) : null;
    const structuralMatch =
      currency &&
      roundedPrice !== null &&
      structuralPriceMap.get(currency)?.has(roundedPrice) === true;
    const cadenceHint =
      plan.cadenceHint === "month" || plan.cadenceHint === "year"
        ? plan.cadenceHint
        : null;

    if (allowRecurringCadenceHints && structuralMatch && cadenceHint) {
      matchedCadenceByPriceKey.set(`${currency}|${roundedPrice.toFixed(2)}`, cadenceHint);
    }

    upsertExtractedPlan(
      updatedPlans,
      plan,
      allowRecurringCadenceHints && Boolean(structuralMatch)
    );
  }

  const globalCadenceHint =
    allowRecurringCadenceHints && enrichment.comparisonCadenceHints.length === 1
      ? enrichment.comparisonCadenceHints[0]
      : null;

  for (const price of updatedPriceMentions) {
    if (price.period !== "unknown") {
      continue;
    }

    const key = `${price.currency.toUpperCase()}|${Number(price.amount.toFixed(2)).toFixed(2)}`;
    const cadenceHint = matchedCadenceByPriceKey.get(key);
    if (cadenceHint) {
      price.period = cadenceHint;
      continue;
    }

    if (globalCadenceHint) {
      price.period = globalCadenceHint;
    }
  }

  const extractionDebug = {
    ...(payload.extractionDebug ?? {}),
    enrichmentSources: [
      ...new Set([...(payload.extractionDebug?.enrichmentSources ?? []), "llm" as const]),
    ],
  };

  return canonicalizePricingPayload({
    ...payload,
    pageDescription:
      payload.pageDescription ??
      (typeof enrichment.pageDescription === "string"
        ? normalizeWhitespace(enrichment.pageDescription)
        : null),
    priceMentions: updatedPriceMentions,
    extractedPlans: updatedPlans,
    extractionDebug,
  });
};

export const enrichPricingPayloadWithLlm = async (input: {
  payload: NormalizedPricingPayload;
  scopeText: string;
}): Promise<{
  payload: NormalizedPricingPayload;
  totalCostUsd: number;
} | null> => {
  const { systemPrompt, userPrompt } = buildPrompt(input);
  const completion = await generateSchemaCompletion(
    systemPrompt,
    userPrompt,
    PricingPayloadEnrichmentSchema,
    "pricing_enrichment"
  );

  if (!completion) {
    return null;
  }

  return {
    payload: mergePricingPayloadEnrichment(input.payload, completion.parsed),
    totalCostUsd: completion.totalCostUsd,
  };
};
