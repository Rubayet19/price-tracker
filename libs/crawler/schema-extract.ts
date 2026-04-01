import {
  canonicalizePricingPayload,
  type NormalizedExtractedPlan,
  type NormalizedPricingPayload,
  type NormalizedPricePoint,
  type PricePeriod,
} from "@/libs/crawler/normalize";

export interface SchemaPricingExtract {
  pageDescription: string | null;
  priceMentions: NormalizedPricePoint[];
  extractedPlans: NormalizedExtractedPlan[];
}

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const asArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) {
    return value;
  }

  return value == null ? [] : [value];
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const flattenJsonLdNodes = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenJsonLdNodes(entry));
  }

  if (!isRecord(value)) {
    return [];
  }

  const graphEntries = Array.isArray(value["@graph"])
    ? value["@graph"].flatMap((entry) => flattenJsonLdNodes(entry))
    : [];

  return [value, ...graphEntries];
};

const extractJsonLdBlocks = (html: string): string[] => {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean);
};

const mapPeriodFromText = (value: string | null | undefined): PricePeriod => {
  const normalized = normalizeWhitespace(value ?? "").toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (/p1m|month|monthly|\/mo\b|per month/.test(normalized)) {
    return "month";
  }

  if (/p1y|year|yearly|annual|annually|\/yr\b|per year/.test(normalized)) {
    return "year";
  }

  if (/lifetime|one-time|one time|pay once/.test(normalized)) {
    return "one_time";
  }

  return "unknown";
};

const extractFeatures = (node: Record<string, unknown>): string[] => {
  const features = new Set<string>();

  const featureList = node.featureList;
  for (const entry of asArray(featureList)) {
    if (typeof entry === "string") {
      const normalized = normalizeWhitespace(entry);
      if (normalized) {
        features.add(normalized);
      }
    }
  }

  const additionalProperty = asArray(node.additionalProperty).filter(isRecord);
  for (const property of additionalProperty) {
    const value = property.value;
    if (typeof value === "string") {
      const normalized = normalizeWhitespace(value);
      if (normalized) {
        features.add(normalized);
      }
    }
  }

  return [...features].slice(0, 12);
};

const extractTrialDetails = (
  description: string | null,
  isAccessibleForFree: unknown
): { hasFreeTrial: boolean | null; trialDetails: string | null } => {
  const normalizedDescription = description
    ? normalizeWhitespace(description)
    : null;

  if (
    normalizedDescription &&
    /free trial|trial for \d+|14-day trial|30-day trial|\d+-day free trial/i.test(
      normalizedDescription
    )
  ) {
    const match = normalizedDescription.match(
      /(\d+[-\s]?day free trial|free trial)/i
    );
    return {
      hasFreeTrial: true,
      trialDetails: match ? match[1] : normalizedDescription,
    };
  }

  if (typeof isAccessibleForFree === "boolean") {
    return {
      hasFreeTrial: isAccessibleForFree,
      trialDetails: isAccessibleForFree ? "Free access available." : null,
    };
  }

  return {
    hasFreeTrial: null,
    trialDetails: null,
  };
};

const extractOfferData = (
  offerNode: Record<string, unknown>,
  fallbackText: string | null
): { amount: number | null; currency: string | null; period: PricePeriod } => {
  const rawPrice =
    typeof offerNode.price === "number"
      ? offerNode.price
      : typeof offerNode.price === "string"
        ? Number(offerNode.price)
        : null;
  const amount =
    typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0
      ? rawPrice
      : null;

  const currency =
    typeof offerNode.priceCurrency === "string" &&
    normalizeWhitespace(offerNode.priceCurrency).length > 0
      ? normalizeWhitespace(offerNode.priceCurrency).toUpperCase()
      : null;

  const priceSpecification = isRecord(offerNode.priceSpecification)
    ? offerNode.priceSpecification
    : null;
  const period = mapPeriodFromText(
    typeof priceSpecification?.billingDuration === "string"
      ? priceSpecification.billingDuration
      : typeof priceSpecification?.unitText === "string"
        ? priceSpecification.unitText
        : fallbackText
  );

  return { amount, currency, period };
};

export const extractPricingFromJsonLd = (html: string): SchemaPricingExtract => {
  const pageDescriptions = new Set<string>();
  const priceMentions: NormalizedPricePoint[] = [];
  const extractedPlans: NormalizedExtractedPlan[] = [];

  for (const block of extractJsonLdBlocks(html)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    for (const node of flattenJsonLdNodes(parsed)) {
      const typeValues = asArray(node["@type"])
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.toLowerCase());
      const description =
        typeof node.description === "string"
          ? normalizeWhitespace(node.description)
          : null;

      if (description && typeValues.some((entry) => entry.includes("webpage"))) {
        pageDescriptions.add(description);
      }

      if (
        !typeValues.some(
          (entry) =>
            entry.includes("product") ||
            entry.includes("service") ||
            entry.includes("offer")
        )
      ) {
        continue;
      }

      const planName =
        typeof node.name === "string" ? normalizeWhitespace(node.name) : "";
      const features = extractFeatures(node);
      const { hasFreeTrial, trialDetails } = extractTrialDetails(
        description,
        node.isAccessibleForFree
      );

      const offers = asArray(node.offers).filter(isRecord);
      const offerFallbackText = [node.name, node.description]
        .filter((entry): entry is string => typeof entry === "string")
        .join(" ");

      if (offers.length === 0) {
        continue;
      }

      for (const offer of offers) {
        const { amount, currency, period } = extractOfferData(
          offer,
          offerFallbackText
        );
        if (amount === null || !currency) {
          continue;
        }

        priceMentions.push({
          amount,
          currency,
          period,
        });

        if (!planName) {
          continue;
        }

        extractedPlans.push({
          name: planName,
          currency,
          monthlyPrice: period === "month" ? amount : null,
          annualPrice: period === "year" ? amount : null,
          description,
          features,
          hasFreeTrial,
          trialDetails,
        });
      }
    }
  }

  return {
    pageDescription: [...pageDescriptions][0] ?? null,
    priceMentions,
    extractedPlans,
  };
};

export const mergeSchemaPricingIntoPayload = (
  payload: NormalizedPricingPayload,
  schemaExtract: SchemaPricingExtract
): NormalizedPricingPayload => {
  const extractionDebug = payload.extractionDebug
    ? {
        ...payload.extractionDebug,
        enrichmentSources: [
          ...(payload.extractionDebug.enrichmentSources ?? []),
          ...(schemaExtract.extractedPlans.length > 0 ||
          schemaExtract.priceMentions.length > 0 ||
          schemaExtract.pageDescription
            ? (["jsonld"] as const)
            : []),
        ],
      }
    : schemaExtract.extractedPlans.length > 0 ||
        schemaExtract.priceMentions.length > 0 ||
        schemaExtract.pageDescription
      ? { enrichmentSources: ["jsonld" as const] }
      : undefined;

  return canonicalizePricingPayload({
    ...payload,
    pageDescription: payload.pageDescription ?? schemaExtract.pageDescription,
    priceMentions: [...payload.priceMentions, ...schemaExtract.priceMentions],
    extractedPlans: [...(payload.extractedPlans ?? []), ...schemaExtract.extractedPlans],
    extractionDebug,
  });
};
