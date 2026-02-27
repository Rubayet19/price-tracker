import { createHash } from "node:crypto";

export type PricePeriod = "day" | "week" | "month" | "year" | "one_time" | "unknown";

export interface NormalizedPricePoint {
  amount: number;
  currency: string;
  period: PricePeriod;
}

export interface NormalizedPricingPayload {
  sourceUrl: string;
  pageTitle: string | null;
  pageDescription: string | null;
  planNames: string[];
  priceMentions: NormalizedPricePoint[];
  customPricingHints: string[];
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
  const pattern = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<\\/${tagName}>`, "gi");
  return html.replace(pattern, " ");
};

export const stripHtmlToText = (html: string): string => {
  const withoutScripts = stripTagContent(html, "script");
  const withoutStyles = stripTagContent(withoutScripts, "style");
  const withoutNoscript = stripTagContent(withoutStyles, "noscript");
  const withoutComments = withoutNoscript.replace(/<!--[\s\S]*?-->/g, " ");
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
  return [...new Set(items.map((item) => normalizeWhitespace(item).toLowerCase()))]
    .filter((item) => item.length > 0)
    .sort((a, b) => a.localeCompare(b));
};

const uniquePrices = (prices: NormalizedPricePoint[]): NormalizedPricePoint[] => {
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

export const canonicalizePricingPayload = (
  payload: NormalizedPricingPayload
): NormalizedPricingPayload => {
  return {
    sourceUrl: payload.sourceUrl,
    pageTitle: payload.pageTitle ? normalizeWhitespace(payload.pageTitle) : null,
    pageDescription: payload.pageDescription ? normalizeWhitespace(payload.pageDescription) : null,
    planNames: uniqueStrings(payload.planNames),
    priceMentions: uniquePrices(payload.priceMentions),
    customPricingHints: uniqueStrings(payload.customPricingHints),
  };
};
