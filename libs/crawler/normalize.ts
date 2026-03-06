import { createHash } from "node:crypto";

export type PricePeriod =
  | "day"
  | "week"
  | "month"
  | "year"
  | "one_time"
  | "unknown";
export type ComparisonCadence = "month" | "year";
export type PricingModel =
  | "monthly_only"
  | "annual_only"
  | "mixed_recurring"
  | "one_time"
  | "custom_only"
  | "unknown";

export interface NormalizedPricePoint {
  amount: number;
  currency: string;
  period: PricePeriod;
}

export interface NormalizedExtractedPlan {
  name: string;
  currency: string | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  /** When true, annualPrice is a per-month figure shown on an annual billing toggle. */
  annualPriceIsPerMonth?: boolean;
}

export interface NormalizedPricingPayload {
  sourceUrl: string;
  pageTitle: string | null;
  pageDescription: string | null;
  planNames: string[];
  priceMentions: NormalizedPricePoint[];
  extractedPlans?: NormalizedExtractedPlan[];
  customPricingHints: string[];
  oneTimePricingHints?: string[];
  pricingModel?: PricingModel;
  comparisonCadences?: ComparisonCadence[];
}

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const normalizeHostname = (hostname: string): string => {
  return hostname.toLowerCase().replace(/^www\./, "");
};

const normalizeUrlPath = (pathname: string): string => {
  const normalized = pathname.replace(/\/{2,}/g, "/");
  return normalized === "" ? "/" : normalized;
};

export const normalizeUrl = (value: string): string | null => {
  try {
    const prepared = value.includes("://") ? value : `https://${value}`;
    const url = new URL(prepared);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hostname = normalizeHostname(url.hostname);
    url.hash = "";
    url.search = "";
    url.pathname = normalizeUrlPath(url.pathname);
    return url.toString();
  } catch {
    return null;
  }
};

const stripTagContent = (html: string, tagName: string): string => {
  const pattern = new RegExp(
    `<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`,
    "gi"
  );
  return html.replace(pattern, " ");
};

const stripStrikethroughContent = (html: string): string => {
  let result = stripTagContent(html, "del");
  result = stripTagContent(result, "strike");
  // Use word boundary for <s> to avoid matching <script>, <span>, <section>, etc.
  result = result.replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi, " ");
  // Remove elements with class containing 'line-through' or 'strikethrough'
  result = result.replace(
    /<(\w+)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:line-through|strikethrough)\b[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi,
    " "
  );
  // Remove elements with inline style text-decoration line-through
  result = result.replace(
    /<(\w+)\b[^>]*\bstyle\s*=\s*["'][^"']*text-decoration(?:-line)?\s*:\s*[^"']*line-through[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi,
    " "
  );
  return result;
};

export const stripHtmlToText = (html: string): string => {
  const withoutScripts = stripTagContent(html, "script");
  const withoutStyles = stripTagContent(withoutScripts, "style");
  const withoutNoscript = stripTagContent(withoutStyles, "noscript");
  const withoutStrikethrough = stripStrikethroughContent(withoutNoscript);
  const withoutComments = withoutStrikethrough.replace(/<!--[\s\S]*?-->/g, "");
  const withoutTags = withoutComments.replace(/<[^>]+>/g, " ");
  const decodedBasicEntities = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return normalizeWhitespace(decodedBasicEntities);
};

export const normalizeHtmlForHash = (html: string): string => {
  const text = stripHtmlToText(html);
  return normalizeWhitespace(text).toLowerCase();
};

export const createContentHash = (value: string): string => {
  return createHash("sha256").update(value).digest("hex");
};

const uniqueStrings = (items: string[]): string[] => {
  return [
    ...new Set(items.map((item) => normalizeWhitespace(item).toLowerCase())),
  ]
    .filter((item) => item.length > 0)
    .sort((a, b) => a.localeCompare(b));
};

const uniquePrices = (
  prices: NormalizedPricePoint[]
): NormalizedPricePoint[] => {
  const keyToPrice = new Map<string, NormalizedPricePoint>();

  for (const price of prices) {
    const roundedAmount = Number(price.amount.toFixed(2));
    const key = `${price.currency}|${price.period}|${roundedAmount.toFixed(2)}`;

    if (!keyToPrice.has(key)) {
      keyToPrice.set(key, {
        amount: roundedAmount,
        currency: price.currency.toUpperCase(),
        period: price.period,
      });
    }
  }

  return [...keyToPrice.values()].sort((a, b) => {
    if (a.currency !== b.currency) {
      return a.currency.localeCompare(b.currency);
    }

    if (a.period !== b.period) {
      return a.period.localeCompare(b.period);
    }

    return a.amount - b.amount;
  });
};

const uniqueExtractedPlans = (
  plans: NormalizedExtractedPlan[] | undefined
): NormalizedExtractedPlan[] => {
  if (!plans || plans.length === 0) {
    return [];
  }

  const planMap = new Map<string, NormalizedExtractedPlan>();

  for (const plan of plans) {
    const displayName = normalizeWhitespace(plan.name);
    const normalizedName = displayName.toLowerCase();
    if (!displayName) {
      continue;
    }

    const existing = planMap.get(normalizedName);

    if (!existing) {
      planMap.set(normalizedName, {
        name: displayName,
        currency: plan.currency ? plan.currency.toUpperCase() : null,
        monthlyPrice:
          typeof plan.monthlyPrice === "number" &&
          Number.isFinite(plan.monthlyPrice)
            ? Number(plan.monthlyPrice.toFixed(2))
            : null,
        annualPrice:
          typeof plan.annualPrice === "number" &&
          Number.isFinite(plan.annualPrice)
            ? Number(plan.annualPrice.toFixed(2))
            : null,
        annualPriceIsPerMonth: plan.annualPriceIsPerMonth ?? false,
      });
      continue;
    }

    if (!existing.currency && plan.currency) {
      existing.currency = plan.currency.toUpperCase();
    }

    if (
      existing.monthlyPrice === null &&
      typeof plan.monthlyPrice === "number"
    ) {
      existing.monthlyPrice = Number(plan.monthlyPrice.toFixed(2));
    }

    if (existing.annualPrice === null && typeof plan.annualPrice === "number") {
      existing.annualPrice = Number(plan.annualPrice.toFixed(2));
      existing.annualPriceIsPerMonth = plan.annualPriceIsPerMonth ?? false;
    }
  }

  return [...planMap.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
};

const uniqueComparisonCadences = (
  cadences: ComparisonCadence[] | undefined
): ComparisonCadence[] => {
  if (!cadences || cadences.length === 0) {
    return [];
  }

  return [...new Set(cadences)].sort((left, right) =>
    left.localeCompare(right)
  );
};

export const getComparisonCadences = (payload: {
  priceMentions: ReadonlyArray<NormalizedPricePoint>;
  extractedPlans?: ReadonlyArray<NormalizedExtractedPlan>;
}): ComparisonCadence[] => {
  const cadenceSet = new Set<ComparisonCadence>();

  for (const plan of payload.extractedPlans ?? []) {
    if (
      typeof plan.monthlyPrice === "number" &&
      Number.isFinite(plan.monthlyPrice)
    ) {
      cadenceSet.add("month");
    }

    if (
      typeof plan.annualPrice === "number" &&
      Number.isFinite(plan.annualPrice)
    ) {
      cadenceSet.add("year");
    }
  }

  for (const price of payload.priceMentions) {
    if (price.period === "month") {
      cadenceSet.add("month");
    }

    if (price.period === "year") {
      cadenceSet.add("year");
    }
  }

  return uniqueComparisonCadences([...cadenceSet]);
};

export const classifyPricingModel = (payload: {
  priceMentions: ReadonlyArray<NormalizedPricePoint>;
  extractedPlans?: ReadonlyArray<NormalizedExtractedPlan>;
  customPricingHints: ReadonlyArray<string>;
  oneTimePricingHints?: ReadonlyArray<string>;
}): PricingModel => {
  const comparisonCadences = getComparisonCadences(payload);
  const hasOneTimePricing =
    (payload.oneTimePricingHints?.length ?? 0) > 0 ||
    payload.priceMentions.some((price) => price.period === "one_time");

  if (
    comparisonCadences.includes("month") &&
    comparisonCadences.includes("year")
  ) {
    return "mixed_recurring";
  }

  if (comparisonCadences.includes("month")) {
    return "monthly_only";
  }

  if (comparisonCadences.includes("year")) {
    return "annual_only";
  }

  if (hasOneTimePricing) {
    return "one_time";
  }

  if (payload.customPricingHints.length > 0) {
    const hasConcreteExtractedPrices = (payload.extractedPlans ?? []).some(
      (plan) =>
        (typeof plan.monthlyPrice === "number" && plan.monthlyPrice > 0) ||
        (typeof plan.annualPrice === "number" && plan.annualPrice > 0)
    );
    const hasConcretePriceMentions = payload.priceMentions.some(
      (price) => price.amount > 0
    );

    if (!hasConcreteExtractedPrices && !hasConcretePriceMentions) {
      return "custom_only";
    }
  }

  return "unknown";
};

export const canonicalizePricingPayload = (
  payload: NormalizedPricingPayload
): NormalizedPricingPayload => {
  const priceMentions = uniquePrices(payload.priceMentions);
  const extractedPlans = uniqueExtractedPlans(payload.extractedPlans);
  const customPricingHints = uniqueStrings(payload.customPricingHints);
  const oneTimePricingHints = uniqueStrings(payload.oneTimePricingHints ?? []);
  const comparisonCadences = getComparisonCadences({
    priceMentions,
    extractedPlans,
  });
  const pricingModel = classifyPricingModel({
    priceMentions,
    extractedPlans,
    customPricingHints,
    oneTimePricingHints,
  });

  return {
    sourceUrl: payload.sourceUrl,
    pageTitle: payload.pageTitle
      ? normalizeWhitespace(payload.pageTitle)
      : null,
    pageDescription: payload.pageDescription
      ? normalizeWhitespace(payload.pageDescription)
      : null,
    planNames: uniqueStrings(payload.planNames),
    priceMentions,
    extractedPlans,
    customPricingHints,
    oneTimePricingHints,
    pricingModel,
    comparisonCadences,
  };
};
