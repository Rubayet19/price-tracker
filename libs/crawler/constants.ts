export const DEFAULT_CRAWL_BATCH_LIMIT = 3;
export const MAX_CRAWL_BATCH_LIMIT = 20;

const parseIntFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

export const CRAWL_BATCH_LIMIT = parseIntFromEnv(
  process.env.CRAWL_BATCH_LIMIT,
  DEFAULT_CRAWL_BATCH_LIMIT
);

export const CRAWL_LEASE_MS = parseIntFromEnv(process.env.CRAWL_LEASE_MS, 6 * 60 * 1000);

export const SUCCESS_CRAWL_DELAY_MS = parseIntFromEnv(
  process.env.CRAWL_SUCCESS_DELAY_MS,
  24 * 60 * 60 * 1000
);

export const ERROR_BACKOFF_MS = parseIntFromEnv(process.env.CRAWL_ERROR_BACKOFF_MS, 6 * 60 * 60 * 1000);
export const BLOCKED_BACKOFF_MS = parseIntFromEnv(
  process.env.CRAWL_BLOCKED_BACKOFF_MS,
  36 * 60 * 60 * 1000
);
export const MANUAL_NEEDED_BACKOFF_MS = parseIntFromEnv(
  process.env.CRAWL_MANUAL_BACKOFF_MS,
  48 * 60 * 60 * 1000
);

export const FETCH_TIMEOUT_MS = parseIntFromEnv(process.env.CRAWL_FETCH_TIMEOUT_MS, 15_000);
export const MAX_HTML_LENGTH = parseIntFromEnv(process.env.CRAWL_MAX_HTML_LENGTH, 1_000_000);

export const VERIFIED_CONFIDENCE_THRESHOLD = 0.75;
export const PRICING_URL_DISCOVERY_MIN_CONFIDENCE = 0.35;
export const PRICING_URL_DISCOVERY_MAX_CANDIDATES = 8;
export const PRICING_URL_DISCOVERY_PRIMARY_CONFIDENCE_THRESHOLD = 0.86;
export const PRICING_URL_DISCOVERY_MIN_PRIMARY_GAP = 0.08;

export const CRAWL_REQUEST_HEADERS: Readonly<Record<string, string>> = {
  "user-agent":
    "Mozilla/5.0 (compatible; PriceTrackerBot/1.0; +https://price-tracker.vercel.app/bot)",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.8",
  "cache-control": "no-cache",
};

export const BLOCKED_HTTP_STATUSES = new Set<number>([401, 403, 429]);

export const BLOCKED_TEXT_SIGNALS = [
  "access denied",
  "temporarily blocked",
  "captcha",
  "cloudflare",
  "attention required",
  "verify you are human",
  "bot detection",
] as const;

export const PRICING_TEXT_SIGNALS = [
  "pricing",
  "plans",
  "per month",
  "monthly",
  "yearly",
  "annual",
  "billed",
  "free trial",
] as const;

export const CUSTOM_PRICING_SIGNALS = [
  "contact sales",
  "custom pricing",
  "talk to sales",
  "enterprise pricing",
  "request a quote",
  "book a demo",
] as const;
