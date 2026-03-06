import type {
  DashboardCrawlStatus,
  DashboardComparisonResponse,
  DashboardFeedResponse,
  DashboardOverviewResponse,
  FeedFilters,
} from "@/types/dashboard";
import type { PricingUrlCandidate } from "@/types/companies";

/* ------------------------------------------------------------------ */
/*  Short-lived request cache — avoids re-fetching on tab switches     */
/* ------------------------------------------------------------------ */

const REQUEST_CACHE_TTL_MS = 10_000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const requestCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = requestCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > REQUEST_CACHE_TTL_MS) {
    requestCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  requestCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateDashboardCache(): void {
  requestCache.clear();
}

/* ------------------------------------------------------------------ */

const toErrorMessage = async (
  response: Response,
  fallbackMessage: string
): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error;
    }
  } catch {
    // Keep fallback.
  }

  return fallbackMessage;
};

const createFeedQuery = (
  filters: FeedFilters,
  options?: { cursor?: string | null; limit?: number }
): string => {
  const params = new URLSearchParams({
    limit: String(options?.limit ?? 20),
  });

  if (filters.severity !== "all") {
    params.set("severity", filters.severity);
  }

  if (filters.verificationState !== "all") {
    params.set("verificationState", filters.verificationState);
  }

  if (options?.cursor) {
    params.set("cursor", options.cursor);
  }

  return params.toString();
};

export const loadDashboardOverview =
  async (): Promise<DashboardOverviewResponse> => {
    const cacheKey = "overview";
    const cached = getCached<DashboardOverviewResponse>(cacheKey);
    if (cached) return cached;

    const response = await fetch("/api/dashboard/overview", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        await toErrorMessage(response, "Failed to load dashboard overview")
      );
    }

    const data = (await response.json()) as DashboardOverviewResponse;
    setCache(cacheKey, data);
    return data;
  };

export const loadDashboardFeed = async (
  filters: FeedFilters,
  options?: { cursor?: string | null; limit?: number }
): Promise<DashboardFeedResponse> => {
  const response = await fetch(
    `/api/dashboard/feed?${createFeedQuery(filters, options)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to load dashboard feed")
    );
  }

  return (await response.json()) as DashboardFeedResponse;
};

export const loadDashboardComparison =
  async (): Promise<DashboardComparisonResponse> => {
    const cacheKey = "comparison";
    const cached = getCached<DashboardComparisonResponse>(cacheKey);
    if (cached) return cached;

    const response = await fetch("/api/dashboard/comparison", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        await toErrorMessage(response, "Failed to load dashboard comparison")
      );
    }

    const data = (await response.json()) as DashboardComparisonResponse;
    setCache(cacheKey, data);
    return data;
  };

export const createBillingPortalSession = async (
  returnUrl: string
): Promise<string> => {
  const response = await fetch("/api/stripe/create-portal", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ returnUrl }),
  });

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to open billing portal")
    );
  }

  const payload = (await response.json()) as { url: string };
  return payload.url;
};

export const createCheckoutSession = async (payload: {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  mode: "payment" | "subscription";
}): Promise<string> => {
  const response = await fetch("/api/stripe/create-checkout", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response, "Failed to start checkout"));
  }

  const data = (await response.json()) as { url: string };
  return data.url;
};

export interface RunCompetitorCrawlResponse {
  companyId: string;
  completed: boolean;
  result: {
    companyId: string;
    status: DashboardCrawlStatus;
    changed: boolean;
    snapshotCreated: boolean;
    diffCreated: boolean;
    insightCreated: boolean;
    skippedByHash: boolean;
    reason?: string;
  };
}

export const runCompetitorCrawl = async (
  companyId: string
): Promise<RunCompetitorCrawlResponse> => {
  const response = await fetch(`/api/companies/${companyId}/crawl-now`, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response, "Failed to run crawl"));
  }

  invalidateDashboardCache();
  return (await response.json()) as RunCompetitorCrawlResponse;
};

export const retryCompetitorCrawl = async (
  companyId: string
): Promise<void> => {
  const response = await fetch(`/api/companies/${companyId}/retry-crawl`, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response, "Failed to retry crawl"));
  }

  invalidateDashboardCache();
};

export const discoverCompetitorPricing = async (
  companyId: string
): Promise<{
  candidates: PricingUrlCandidate[];
  primaryPricingUrl: string | null;
  recommendedPrimaryUrl: string | null;
}> => {
  const response = await fetch(`/api/companies/${companyId}/discover-pricing`, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to discover pricing URLs")
    );
  }

  return (await response.json()) as {
    candidates: PricingUrlCandidate[];
    primaryPricingUrl: string | null;
    recommendedPrimaryUrl: string | null;
  };
};

export const updateCompetitorPrimaryPricing = async (
  companyId: string,
  payload: { candidateUrl?: string; url?: string }
): Promise<{
  primaryPricingUrl: string | null;
  pricingUrlCandidates: PricingUrlCandidate[];
}> => {
  const response = await fetch(`/api/companies/${companyId}/primary-pricing`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to save pricing source")
    );
  }

  invalidateDashboardCache();
  return (await response.json()) as {
    primaryPricingUrl: string | null;
    pricingUrlCandidates: PricingUrlCandidate[];
  };
};

export const deleteCompetitor = async (companyId: string): Promise<void> => {
  const response = await fetch(`/api/companies/${companyId}`, {
    method: "DELETE",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to delete competitor")
    );
  }

  invalidateDashboardCache();
};

export interface UpdateCompetitorDetailsResponse {
  companyId: string;
  name: string;
  domain: string;
  homepageUrl: string | null;
  primaryPricingUrl: string | null;
  domainChanged: boolean;
}

export const updateCompetitorDetails = async (
  companyId: string,
  data: { name?: string; homepageUrl?: string }
): Promise<UpdateCompetitorDetailsResponse> => {
  const response = await fetch(`/api/companies/${companyId}`, {
    method: "PATCH",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to update competitor details")
    );
  }

  invalidateDashboardCache();
  return (await response.json()) as UpdateCompetitorDetailsResponse;
};
