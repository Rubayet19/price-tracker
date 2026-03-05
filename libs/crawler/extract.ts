import {
  BLOCKED_HTTP_STATUSES,
  BLOCKED_TEXT_SIGNALS,
  CRAWL_REQUEST_HEADERS,
  CUSTOM_PRICING_SIGNALS,
  FETCH_TIMEOUT_MS,
  MAX_REASONABLE_PRICE_AMOUNT,
  MAX_HTML_LENGTH,
  ONE_TIME_PRICING_SIGNALS,
  PLAYWRIGHT_FALLBACK_CONFIDENCE_THRESHOLD,
  PRICING_TEXT_SIGNALS,
  VERIFIED_CONFIDENCE_THRESHOLD,
} from "@/libs/crawler/constants";
import { extractPricingWithPlaywright } from "@/libs/crawler/playwright-extract";
import {
  canonicalizePricingPayload,
  createContentHash,
  normalizeHtmlForHash,
  normalizeUrl,
  stripHtmlToText,
  type PricingModel,
  type NormalizedExtractedPlan,
  type NormalizedPricePoint,
  type NormalizedPricingPayload,
  type PricePeriod,
} from "@/libs/crawler/normalize";
import type { CompanyCrawlStatus } from "@/models/Company";
import type { SnapshotCaptureMethod } from "@/models/Snapshot";

interface StaticFetchSuccess {
  ok: true;
  status: number;
  html: string;
  contentType: string | null;
}

interface StaticFetchFailure {
  ok: false;
  status: number;
  error: string;
}

type StaticFetchResult = StaticFetchSuccess | StaticFetchFailure;

interface ExtractionBase {
  confidence: number;
  isVerified: boolean;
  captureMethod: SnapshotCaptureMethod;
}

export interface CrawlExtractionSuccess extends ExtractionBase {
  status: "ok";
  contentHash: string;
  pricingPayload: NormalizedPricingPayload;
}

export interface CrawlExtractionFailure extends ExtractionBase {
  status: Exclude<CompanyCrawlStatus, "idle" | "ok">;
  error: string;
}

export type CrawlExtractionResult = CrawlExtractionSuccess | CrawlExtractionFailure;

const findMetaContent = (html: string, name: string): string | null => {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  return match?.[1]?.trim() ?? null;
};

const findTitle = (html: string): string | null => {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1]?.trim() ?? null;
};

const mapCurrency = (token: string): string => {
  const normalized = token.trim().toUpperCase();

  if (normalized === "$") {
    return "USD";
  }

  if (normalized === "€") {
    return "EUR";
  }

  if (normalized === "£") {
    return "GBP";
  }

  if (normalized === "¥") {
    return "JPY";
  }

  return normalized;
};

const mapPeriod = (token: string | undefined): PricePeriod => {
  if (!token) {
    return "unknown";
  }

  const normalized = token.toLowerCase();

  if (["day", "daily", "d"].includes(normalized)) {
    return "day";
  }

  if (["week", "weekly", "wk", "w"].includes(normalized)) {
    return "week";
  }

  if (["month", "monthly", "mo", "m"].includes(normalized)) {
    return "month";
  }

  if (["year", "yearly", "annual", "annually", "yr", "y"].includes(normalized)) {
    return "year";
  }

  if (["once", "one-time", "onetime"].includes(normalized)) {
    return "one_time";
  }

  return "unknown";
};

const inferPeriodFromContext = (context: string): PricePeriod => {
  const lowered = context.toLowerCase();

  if (
    /(per user\/month|per month|\/month|\/mo|billed monthly|monthly plan|monthly)/.test(lowered)
  ) {
    return "month";
  }

  if (
    /(per year|\/year|billed yearly|billed annually|annual plan|yearly plan|yearly|annual|annually)/.test(
      lowered
    )
  ) {
    return "year";
  }

  if (
    /(one-time payment|one time payment|pay once|one-time fee|lifetime access|yours forever|buy once|single payment)/.test(
      lowered
    )
  ) {
    return "one_time";
  }

  return "unknown";
};

const hasNoisyPriceContext = (context: string): boolean => {
  return /(save up to|per invoice|stripe fees|support tickets|customer support|followers|reviews|ratings|testimonial|guarantee)/i.test(
    context
  );
};

const extractPriceMentions = (text: string): NormalizedPricePoint[] => {
  const prices: NormalizedPricePoint[] = [];
  const pattern =
    /(?:\b(USD|EUR|GBP|CAD|AUD|JPY)\b\s*|([€£$¥]))\s*(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)(?:\s*(?:\/|per)?\s*(day|daily|d|week|weekly|wk|w|month|monthly|mo|m|year|yearly|annual|annually|yr|y|once|one-time|onetime))?/gi;

  let match = pattern.exec(text);
  while (match) {
    const codeToken = match[1];
    const symbolToken = match[2];
    const amountToken = match[3];
    const periodToken = match[4];
    const matchText = match[0] ?? "";

    const amount = Number.parseFloat(amountToken.replace(/,/g, ""));
    const matchIndex = match.index ?? 0;
    const context = text.slice(
      Math.max(0, matchIndex - 60),
      Math.min(text.length, matchIndex + matchText.length + 60)
    );
    const inferredPeriod = periodToken ? mapPeriod(periodToken) : inferPeriodFromContext(context);
    const contextAmounts = [...context.matchAll(/(?:\b(?:USD|EUR|GBP|CAD|AUD|JPY)\b\s*|[€£$¥])\s*(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)/gi)]
      .map((contextMatch) => Number.parseFloat((contextMatch[1] ?? "").replace(/,/g, "")))
      .filter((contextAmount) => Number.isFinite(contextAmount) && contextAmount > 0);
    const hasPairedPriceContext = contextAmounts.length >= 2;
    const lowestContextAmount = hasPairedPriceContext ? Math.min(...contextAmounts) : null;
    const shouldPreferLowestPairedPrice =
      hasPairedPriceContext &&
      lowestContextAmount !== null &&
      (inferredPeriod === "one_time" || inferredPeriod === "month" || inferredPeriod === "year");

    if (
      Number.isFinite(amount) &&
      amount > 0 &&
      amount <= MAX_REASONABLE_PRICE_AMOUNT &&
      !(hasNoisyPriceContext(context) && amount < 10) &&
      !(inferredPeriod === "unknown" && amount < 5) &&
      !(inferredPeriod === "unknown" && amount > 500) &&
      !(inferredPeriod === "unknown" && hasNoisyPriceContext(context)) &&
      !(shouldPreferLowestPairedPrice && amount !== lowestContextAmount)
    ) {
      const currency = codeToken ? codeToken.toUpperCase() : mapCurrency(symbolToken ?? "$");
      prices.push({
        amount,
        currency,
        period: inferredPeriod,
      });
    }

    match = pattern.exec(text);
  }

  return prices;
};

const extractSignalMentions = (text: string, signals: readonly string[]): string[] => {
  const lowered = text.toLowerCase();
  const matches: string[] = [];

  for (const signal of signals) {
    if (lowered.includes(signal)) {
      matches.push(signal);
    }
  }

  return matches;
};

const extractPricingCardsFromHtml = (html: string): NormalizedExtractedPlan[] => {
  // Strip scripts, styles, noscript while keeping HTML structure
  let cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  cleanHtml = cleanHtml.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ");

  // Strip strikethrough elements (same patterns as normalize.ts)
  cleanHtml = cleanHtml.replace(/<del[^>]*>[\s\S]*?<\/del>/gi, " ");
  cleanHtml = cleanHtml.replace(/<strike[^>]*>[\s\S]*?<\/strike>/gi, " ");
  cleanHtml = cleanHtml.replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi, " ");
  cleanHtml = cleanHtml.replace(
    /<(\w+)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:line-through|strikethrough)\b[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi,
    " "
  );
  cleanHtml = cleanHtml.replace(
    /<(\w+)\b[^>]*\bstyle\s*=\s*["'][^"']*text-decoration(?:-line)?\s*:\s*[^"']*line-through[^"']*["'][^>]*>[\s\S]*?<\/\1\s*>/gi,
    " "
  );

  // Strip HTML comments (React hydration: $<!-- -->29 → $29)
  cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/g, "");

  const plans: NormalizedExtractedPlan[] = [];
  const headingPattern = /<(h[1-5])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const priceWithPeriodPattern =
    /([€£$¥])\s*(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)[\s\S]{0,40}?(?:\/|per\s+)(month|monthly|mo|year|yearly|annual|annually|yr)/i;

  let headingMatch;
  while ((headingMatch = headingPattern.exec(cleanHtml)) !== null) {
    const rawContent = headingMatch[2] ?? "";
    const headingText = rawContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

    // Strict plan name filters (aligned with Playwright isLikelyPlanName)
    if (!headingText || headingText.length > 28) continue;
    if (headingText.split(/\s+/).length > 4) continue;
    if (!/[a-z]/i.test(headingText)) continue;
    if (/[.,:!?]/.test(headingText) || /\d/.test(headingText)) continue;
    if (/pricing|compare|faq|features|trusted by|money-back|save up to|most popular|intro price|best value|limited time|per month|billed|trial/i.test(headingText)) continue;

    // Look for a price with period indicator within 500 chars after this heading
    const searchStart = headingMatch.index + headingMatch[0].length;
    const searchWindow = cleanHtml.slice(searchStart, searchStart + 500);

    const priceMatch = searchWindow.match(priceWithPeriodPattern);
    if (!priceMatch) continue;

    // Skip if another heading appears between this heading and the matched price
    const distanceToPrice = priceMatch.index ?? 0;
    if (/<h[1-5]\b/i.test(searchWindow.slice(0, distanceToPrice))) continue;

    const amount = Number.parseFloat((priceMatch[2] ?? "").replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_REASONABLE_PRICE_AMOUNT) continue;

    const currency = mapCurrency(priceMatch[1] ?? "$");
    const period = mapPeriod(priceMatch[3]);

    plans.push({
      name: headingText,
      currency,
      monthlyPrice: period === "month" ? amount : null,
      annualPrice: period === "year" ? amount : null,
    });
  }

  return plans;
};

const extractPlanNames = (html: string): string[] => {
  const matches = [...html.matchAll(/<(h1|h2|h3|h4|h5)[^>]*>([\s\S]*?)<\/\1>/gi)];

  return matches
    .map((match) => stripHtmlToText(match[2] ?? ""))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 48)
    .filter((value) => !/pricing|compare|faq|features|trusted by|money-back|save up to/i.test(value))
    .filter((value) => /[a-z]/i.test(value))
    .filter((value) => value.split(/\s+/).length <= 4);
};

const getConfidence = (
  prices: NormalizedPricePoint[],
  planNames: string[],
  pricingSignals: string[],
  customSignals: string[],
  oneTimeSignals: string[],
  hasExplicitCadenceSignals: boolean,
  pricingModel: PricingModel
): number => {
  if (prices.length === 0 && customSignals.length === 0) {
    return pricingSignals.length > 0 ? 0.15 : 0;
  }

  let confidence = 0;

  if (prices.length > 0) {
    confidence += 0.3;
  }

  if (prices.length >= 2) {
    confidence += 0.12;
  }

  if (planNames.length >= 1) {
    confidence += 0.15;
  }

  if (planNames.length >= 2) {
    confidence += 0.15;
  }

  if (pricingSignals.length > 0) {
    confidence += 0.08;
  }

  if (hasExplicitCadenceSignals) {
    confidence += 0.08;
  }

  if (oneTimeSignals.length > 0) {
    confidence += 0.05;
  }

  if (prices.length > 0 && planNames.length > 0) {
    confidence += 0.1;
  }

  if (prices.length > 0 && planNames.length === 0) {
    confidence = Math.min(confidence, 0.62);
  }

  if (prices.some((price) => price.period === "unknown")) {
    confidence = Math.min(confidence, 0.7);
  }

  if (pricingModel === "one_time") {
    confidence = Math.min(confidence, 0.58);
  }

  if (pricingModel === "unknown") {
    confidence = Math.min(confidence, 0.45);
  }

  if (customSignals.length > 0 && prices.length === 0) {
    confidence = Math.min(confidence + 0.1, 0.35);
  }

  return Math.max(0, Math.min(0.92, confidence));
};

const hasInteractiveCadenceSignals = (text: string): boolean => {
  const lowered = text.toLowerCase();
  return lowered.includes("monthly") && (lowered.includes("yearly") || lowered.includes("annual"));
};

const hasImplausiblePriceSpread = (prices: NormalizedPricePoint[]): boolean => {
  if (prices.length < 2) {
    return false;
  }

  const amounts = prices.map((price) => price.amount).sort((left, right) => left - right);
  const min = amounts[0];
  const max = amounts[amounts.length - 1];

  return max >= 5_000 || max / Math.max(min, 1) >= 100;
};

const shouldUsePlaywrightFallback = ({
  prices,
  planNames,
  extractedPlans,
  pricingText,
  confidence,
}: {
  prices: NormalizedPricePoint[];
  planNames: string[];
  extractedPlans: NormalizedExtractedPlan[];
  pricingText: string;
  confidence: number;
}): boolean => {
  if (hasInteractiveCadenceSignals(pricingText)) {
    return true;
  }

  if (prices.length > 0 && planNames.length === 0) {
    return true;
  }

  // Static found prices but couldn't pair any plan name with a price.
  // This happens when plan names are in non-heading elements (e.g. styled <p> tags)
  // that the static HTML parser misses. Playwright's DOM-based detection handles these.
  if (prices.length > 0 && extractedPlans.length === 0) {
    return true;
  }

  if (hasImplausiblePriceSpread(prices)) {
    return true;
  }

  return confidence < PLAYWRIGHT_FALLBACK_CONFIDENCE_THRESHOLD;
};

const fetchStaticHtml = async (url: string): Promise<StaticFetchResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: CRAWL_REQUEST_HEADERS,
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type");
    const html = (await response.text()).slice(0, MAX_HTML_LENGTH);

    return {
      ok: true,
      status: response.status,
      contentType,
      html,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        status: 408,
        error: "Request timed out",
      };
    }

    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "Unknown fetch error",
    };
  } finally {
    clearTimeout(timeout);
  }
};

const classifyFetchFailure = (result: StaticFetchFailure): CrawlExtractionFailure => {
  if (BLOCKED_HTTP_STATUSES.has(result.status)) {
    return {
      status: "blocked",
      error: result.error,
      confidence: 0,
      isVerified: false,
      captureMethod: "static",
    };
  }

  if (result.status >= 400 && result.status < 500) {
    return {
      status: "manual_needed",
      error: result.error,
      confidence: 0,
      isVerified: false,
      captureMethod: "static",
    };
  }

  return {
    status: "error",
    error: result.error,
    confidence: 0,
    isVerified: false,
    captureMethod: "static",
  };
};

export const fetchAndExtractPricing = async (sourceUrl: string): Promise<CrawlExtractionResult> => {
  const normalizedSourceUrl = normalizeUrl(sourceUrl);
  if (!normalizedSourceUrl) {
    return {
      status: "manual_needed",
      error: "Invalid pricing URL",
      confidence: 0,
      isVerified: false,
      captureMethod: "static",
    };
  }

  const fetched = await fetchStaticHtml(normalizedSourceUrl);
  if (fetched.ok === false) {
    if (BLOCKED_HTTP_STATUSES.has(fetched.status)) {
      try {
        const playwrightResult = await extractPricingWithPlaywright(sourceUrl);
        if (
          playwrightResult &&
          playwrightResult.pricingPayload.priceMentions.length > 0
        ) {
          return {
            status: "ok",
            contentHash: playwrightResult.contentHash,
            pricingPayload: playwrightResult.pricingPayload,
            confidence: playwrightResult.confidence,
            isVerified:
              playwrightResult.isVerified &&
              playwrightResult.pricingPayload.priceMentions.length > 0 &&
              playwrightResult.pricingPayload.planNames.length > 0,
            captureMethod: "playwright",
          };
        }
      } catch (playwrightError) {
        console.error("Playwright fallback failed after blocked static fetch");
      }
    }

    return classifyFetchFailure(fetched);
  }

  if (!fetched.contentType?.toLowerCase().includes("text/html")) {
    return {
      status: "manual_needed",
      error: "Pricing URL did not return HTML content",
      confidence: 0,
      isVerified: false,
      captureMethod: "static",
    };
  }

  const normalizedHashInput = normalizeHtmlForHash(fetched.html);

  const pricingText = stripHtmlToText(fetched.html);
  const blockedSignals = extractSignalMentions(pricingText, BLOCKED_TEXT_SIGNALS);

  const priceMentions = extractPriceMentions(pricingText);
  const pricingSignals = extractSignalMentions(pricingText, PRICING_TEXT_SIGNALS);
  const customPricingHints = extractSignalMentions(pricingText, CUSTOM_PRICING_SIGNALS);
  const oneTimePricingHints = extractSignalMentions(pricingText, ONE_TIME_PRICING_SIGNALS);
  const planNames = extractPlanNames(fetched.html);

  const staticFoundNothing =
    blockedSignals.length > 0 ||
    (priceMentions.length === 0 &&
      pricingSignals.length === 0 &&
      customPricingHints.length === 0 &&
      oneTimePricingHints.length === 0);

  if (staticFoundNothing) {
    // Static HTML is either a bot challenge page or a JS-rendered shell — try Playwright.
    try {
      const playwrightResult = await extractPricingWithPlaywright(sourceUrl);
      if (
        playwrightResult &&
        playwrightResult.pricingPayload.priceMentions.length > 0
      ) {
        return {
          status: "ok",
          contentHash: playwrightResult.contentHash,
          pricingPayload: playwrightResult.pricingPayload,
          confidence: playwrightResult.confidence,
          isVerified:
            playwrightResult.isVerified &&
            playwrightResult.pricingPayload.priceMentions.length > 0 &&
            playwrightResult.pricingPayload.planNames.length > 0,
          captureMethod: "playwright",
        };
      }
    } catch (playwrightError) {
      console.error("Playwright fallback failed after empty static extraction");
    }

    if (blockedSignals.length > 0) {
      return {
        status: "blocked",
        error: `Bot protection detected: ${blockedSignals.join(", ")}`,
        confidence: 0,
        isVerified: false,
        captureMethod: "static",
      };
    }

    return {
      status: "manual_needed",
      error: "Pricing signals not detected on the page",
      confidence: 0,
      isVerified: false,
      captureMethod: "static",
    };
  }

  const extractedPlans = extractPricingCardsFromHtml(fetched.html);

  const staticPayload = canonicalizePricingPayload({
    sourceUrl: normalizedSourceUrl,
    pageTitle: findTitle(fetched.html),
    pageDescription: findMetaContent(fetched.html, "description"),
    planNames,
    priceMentions,
    extractedPlans,
    customPricingHints,
    oneTimePricingHints,
  });
  const confidence = getConfidence(
    staticPayload.priceMentions,
    staticPayload.planNames,
    pricingSignals,
    staticPayload.customPricingHints,
    staticPayload.oneTimePricingHints ?? [],
    hasInteractiveCadenceSignals(pricingText),
    staticPayload.pricingModel ?? "unknown"
  );

  let payload = staticPayload;
  let finalConfidence = confidence;
  let captureMethod: SnapshotCaptureMethod = "static";
  let contentHash = createContentHash(normalizedHashInput);
  let isVerified = confidence >= VERIFIED_CONFIDENCE_THRESHOLD && payload.priceMentions.length > 0 && payload.planNames.length > 0;

  if (
    shouldUsePlaywrightFallback({
      prices: staticPayload.priceMentions,
      planNames: staticPayload.planNames,
      extractedPlans: staticPayload.extractedPlans ?? [],
      pricingText,
      confidence,
    })
  ) {
    try {
      const playwrightResult = await extractPricingWithPlaywright(sourceUrl);

      if (
        playwrightResult &&
        ((playwrightResult.pricingPayload.extractedPlans?.length ?? 0) >= 2 ||
          playwrightResult.pricingPayload.planNames.length > staticPayload.planNames.length ||
          (playwrightResult.pricingPayload.priceMentions.length >= staticPayload.priceMentions.length &&
            playwrightResult.confidence >= finalConfidence))
      ) {
        payload = playwrightResult.pricingPayload;
        finalConfidence = playwrightResult.confidence;
        captureMethod = "playwright";
        contentHash = playwrightResult.contentHash;
        isVerified =
          playwrightResult.isVerified &&
          playwrightResult.pricingPayload.priceMentions.length > 0 &&
          playwrightResult.pricingPayload.planNames.length > 0;
      }
    } catch (playwrightError) {
      console.error("Playwright fallback failed during confidence-based upgrade");
    }
  }

  return {
    status: "ok",
    contentHash,
    pricingPayload: payload,
    confidence: finalConfidence,
    isVerified,
    captureMethod,
  };
};
