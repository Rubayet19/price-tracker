import {
  canonicalizePricingPayload,
  type NormalizedExtractedPlan,
  type PricingEnrichmentSource,
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

const extractStructuredScriptBlocks = (html: string): string[] => {
  return [
    ...html.matchAll(
      /<script\b(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi
    ),
  ]
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

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const decodeEmbeddedScriptText = (value: string): string => {
  return normalizeWhitespace(
    value
      .replace(/\\u0022/gi, '"')
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, " ")
      .replace(/\\t/g, " ")
  );
};

const parseStructuredNumericField = (
  objectText: string,
  fieldNames: string[]
): number | null => {
  for (const fieldName of fieldNames) {
    const pattern = new RegExp(
      `"${fieldName}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`,
      "i"
    );
    const match = objectText.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const amount = Number.parseFloat(match[1]);
    if (Number.isFinite(amount) && amount >= 0) {
      return amount;
    }
  }

  return null;
};

const parseStructuredStringField = (
  objectText: string,
  fieldNames: string[]
): string | null => {
  for (const fieldName of fieldNames) {
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`, "i");
    const match = objectText.match(pattern);
    const value = normalizeWhitespace(match?.[1] ?? "");
    if (value) {
      return value;
    }
  }

  return null;
};

const isLikelyStructuredPlanName = (value: string | null): value is string => {
  if (!value) {
    return false;
  }

  const normalized = normalizeWhitespace(value);
  if (!normalized || normalized.length > 32) {
    return false;
  }

  if (normalized.split(/\s+/).length > 4) {
    return false;
  }

  return !/\b(monthly|yearly|annually|pricing|credits|plan toggle|upgrade)\b/i.test(
    normalized
  );
};

const extractPricingFromStructuredScripts = (
  html: string
): SchemaPricingExtract => {
  const priceMentions: NormalizedPricePoint[] = [];
  const extractedPlans: NormalizedExtractedPlan[] = [];

  const planObjectPattern =
    /\{[^{}]{0,1400}?"name"\s*:\s*"[^"]{1,40}"[^{}]{0,1400}?\}/g;

  for (const block of extractStructuredScriptBlocks(html)) {
    const decodedBlock = decodeEmbeddedScriptText(block);

    for (const match of decodedBlock.matchAll(planObjectPattern)) {
      const objectText = match[0] ?? "";
      const planName = parseStructuredStringField(objectText, ["name"]);
      if (!isLikelyStructuredPlanName(planName)) {
        continue;
      }

      const currency =
        parseStructuredStringField(objectText, ["currency", "priceCurrency"])
          ?.toUpperCase() ?? "USD";
      const monthlyPrice = parseStructuredNumericField(objectText, [
        "monthlyPrice",
        "monthPrice",
      ]);
      const annualPrice = parseStructuredNumericField(objectText, [
        "annuallyPrice",
        "annualPrice",
        "yearlyPrice",
        "yearPrice",
      ]);
      const description = parseStructuredStringField(objectText, [
        "description",
        "subtitle",
      ]);

      if (monthlyPrice === null && annualPrice === null) {
        continue;
      }

      extractedPlans.push({
        name: planName,
        currency,
        monthlyPrice,
        annualPrice,
        annualPriceIsPerMonth: annualPrice !== null,
        description,
      });

      if (monthlyPrice !== null) {
        priceMentions.push({
          amount: monthlyPrice,
          currency,
          period: "month",
        });
      }

      if (annualPrice !== null) {
        priceMentions.push({
          amount: annualPrice,
          currency,
          period: "year",
        });
      }
    }
  }

  return {
    pageDescription: null,
    priceMentions,
    extractedPlans,
  };
};

const inferOfferPeriodFromPageDescription = (input: {
  offerName: string | null;
  amount: number | null;
  description: string | null;
}): PricePeriod => {
  const description = normalizeWhitespace(input.description ?? "");
  if (!description || input.amount === null) {
    return "unknown";
  }

  const amountPattern = escapeRegExp(
    String(Number(input.amount.toFixed(2))).replace(/\.00$/, "")
  );
  const normalizedOfferName = normalizeWhitespace(input.offerName ?? "");

  if (normalizedOfferName) {
    const namedWindowPattern = new RegExp(
      `${escapeRegExp(normalizedOfferName)}[\\s\\S]{0,60}?\\$?${amountPattern}(?:\\.0)?(?:0)?[\\s\\S]{0,24}?(?:\\/|per\\s+)?(month|monthly|mo|year|yearly|annual|annually|yr)`,
      "i"
    );
    const namedWindowMatch = description.match(namedWindowPattern);
    if (namedWindowMatch?.[1]) {
      return mapPeriodFromText(namedWindowMatch[1]);
    }
  }

  const globalAmountPattern = new RegExp(
    `\\$?${amountPattern}(?:\\.0)?(?:0)?[\\s\\S]{0,24}?(?:\\/|per\\s+)?(month|monthly|mo|year|yearly|annual|annually|yr)`,
    "i"
  );
  const globalAmountMatch = description.match(globalAmountPattern);
  if (globalAmountMatch?.[1]) {
    return mapPeriodFromText(globalAmountMatch[1]);
  }

  return "unknown";
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
        const offerName =
          typeof offer.name === "string"
            ? normalizeWhitespace(offer.name)
            : planName || null;
        const { amount, currency, period } = extractOfferData(
          offer,
          offerFallbackText
        );
        if (amount === null || !currency) {
          continue;
        }
        const enrichedPeriod =
          period !== "unknown"
            ? period
            : inferOfferPeriodFromPageDescription({
                offerName,
                amount,
                description,
              });

        priceMentions.push({
          amount,
          currency,
          period: enrichedPeriod,
        });

        if (!offerName) {
          continue;
        }

        extractedPlans.push({
          name: offerName,
          currency,
          monthlyPrice: enrichedPeriod === "month" ? amount : null,
          annualPrice: enrichedPeriod === "year" ? amount : null,
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

const mergePricingEnrichment = (
  payload: NormalizedPricingPayload,
  enrichmentExtract: SchemaPricingExtract,
  source: PricingEnrichmentSource
): NormalizedPricingPayload => {
  const extractionDebug = payload.extractionDebug
    ? {
        ...payload.extractionDebug,
        enrichmentSources: [
          ...(payload.extractionDebug.enrichmentSources ?? []),
          ...(enrichmentExtract.extractedPlans.length > 0 ||
          enrichmentExtract.priceMentions.length > 0 ||
          enrichmentExtract.pageDescription
            ? ([source] as const)
            : []),
        ],
      }
    : enrichmentExtract.extractedPlans.length > 0 ||
        enrichmentExtract.priceMentions.length > 0 ||
        enrichmentExtract.pageDescription
      ? { enrichmentSources: [source] }
      : undefined;

  return canonicalizePricingPayload({
    ...payload,
    pageDescription: payload.pageDescription ?? enrichmentExtract.pageDescription,
    priceMentions: [...payload.priceMentions, ...enrichmentExtract.priceMentions],
    extractedPlans: [...(payload.extractedPlans ?? []), ...enrichmentExtract.extractedPlans],
    extractionDebug,
  });
};

export const mergeSchemaPricingIntoPayload = (
  payload: NormalizedPricingPayload,
  schemaExtract: SchemaPricingExtract
): NormalizedPricingPayload => {
  return mergePricingEnrichment(payload, schemaExtract, "jsonld");
};

export const mergeStructuredScriptPricingIntoPayload = (
  payload: NormalizedPricingPayload,
  scriptExtract: SchemaPricingExtract
): NormalizedPricingPayload => {
  return mergePricingEnrichment(payload, scriptExtract, "script");
};

export { extractPricingFromStructuredScripts };
