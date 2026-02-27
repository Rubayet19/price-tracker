import {
  BLOCKED_HTTP_STATUSES,
  BLOCKED_TEXT_SIGNALS,
  CRAWL_REQUEST_HEADERS,
  CUSTOM_PRICING_SIGNALS,
  FETCH_TIMEOUT_MS,
  MAX_HTML_LENGTH,
  PRICING_TEXT_SIGNALS,
  VERIFIED_CONFIDENCE_THRESHOLD,
} from "@/libs/crawler/constants";
import {
  canonicalizePricingPayload,
  createContentHash,
  normalizeHtmlForHash,
  normalizeUrl,
  stripHtmlToText,
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

const extractPriceMentions = (text: string): NormalizedPricePoint[] => {
  const prices: NormalizedPricePoint[] = [];
  const pattern =
    /(?:\b(USD|EUR|GBP|CAD|AUD|JPY)\s*)?([€£$¥])?\s*(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)(?:\s*(?:\/|per)\s*(day|daily|d|week|weekly|wk|w|month|monthly|mo|m|year|yearly|annual|annually|yr|y|once|one-time|onetime))?/gi;

  let match = pattern.exec(text);
  while (match) {
    const codeToken = match[1];
    const symbolToken = match[2];
    const amountToken = match[3];
    const periodToken = match[4];

    const amount = Number.parseFloat(amountToken.replace(/,/g, ""));
    if (Number.isFinite(amount) && amount > 0) {
      const currency = codeToken ? codeToken.toUpperCase() : mapCurrency(symbolToken ?? "$");
      prices.push({
        amount,
        currency,
        period: mapPeriod(periodToken),
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

const extractPlanNames = (html: string): string[] => {
  const matches = [...html.matchAll(/<(h1|h2|h3|h4|h5)[^>]*>([\s\S]*?)<\/\1>/gi)];

  return matches
    .map((match) => stripHtmlToText(match[2] ?? ""))
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 80)
    .filter((value) => /plan|pricing|starter|pro|business|enterprise/i.test(value));
};

const getConfidence = (
  prices: NormalizedPricePoint[],
  pricingSignals: string[],
  customSignals: string[]
): number => {
  if (prices.length >= 3) {
    return 0.9;
  }

  if (prices.length >= 1) {
    return pricingSignals.length > 0 ? 0.78 : 0.72;
  }

  if (customSignals.length > 0) {
    return 0.45;
  }

  if (pricingSignals.length > 0) {
    return 0.4;
  }

  return 0;
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
  const contentHash = createContentHash(normalizedHashInput);

  const pricingText = stripHtmlToText(fetched.html);
  const blockedSignals = extractSignalMentions(pricingText, BLOCKED_TEXT_SIGNALS);
  if (blockedSignals.length > 0) {
    return {
      status: "blocked",
      error: `Bot protection detected: ${blockedSignals.join(", ")}`,
      confidence: 0,
      isVerified: false,
      captureMethod: "static",
    };
  }

  const priceMentions = extractPriceMentions(pricingText);
  const pricingSignals = extractSignalMentions(pricingText, PRICING_TEXT_SIGNALS);
  const customPricingHints = extractSignalMentions(pricingText, CUSTOM_PRICING_SIGNALS);
  const confidence = getConfidence(priceMentions, pricingSignals, customPricingHints);

  if (priceMentions.length === 0 && pricingSignals.length === 0 && customPricingHints.length === 0) {
    return {
      status: "manual_needed",
      error: "Pricing signals not detected on the page",
      confidence: 0,
      isVerified: false,
      captureMethod: "static",
    };
  }

  const payload = canonicalizePricingPayload({
    sourceUrl: normalizedSourceUrl,
    pageTitle: findTitle(fetched.html),
    pageDescription: findMetaContent(fetched.html, "description"),
    planNames: extractPlanNames(fetched.html),
    priceMentions,
    customPricingHints,
  });

  return {
    status: "ok",
    contentHash,
    pricingPayload: payload,
    confidence,
    isVerified: confidence >= VERIFIED_CONFIDENCE_THRESHOLD && payload.priceMentions.length > 0,
    captureMethod: "static",
  };
};
