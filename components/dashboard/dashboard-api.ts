import type {
  DashboardComparisonResponse,
  DashboardFeedResponse,
  DashboardOverviewResponse,
  FeedFilters,
} from "@/types/dashboard";

const toErrorMessage = async (response: Response, fallbackMessage: string): Promise<string> => {
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

export const loadDashboardOverview = async (): Promise<DashboardOverviewResponse> => {
  const response = await fetch("/api/dashboard/overview", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response, "Failed to load dashboard overview"));
  }

  return (await response.json()) as DashboardOverviewResponse;
};

export const loadDashboardFeed = async (
  filters: FeedFilters,
  options?: { cursor?: string | null; limit?: number }
): Promise<DashboardFeedResponse> => {
  const response = await fetch(`/api/dashboard/feed?${createFeedQuery(filters, options)}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response, "Failed to load dashboard feed"));
  }

  return (await response.json()) as DashboardFeedResponse;
};

export const loadDashboardComparison = async (): Promise<DashboardComparisonResponse> => {
  const response = await fetch("/api/dashboard/comparison", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await toErrorMessage(response, "Failed to load dashboard comparison"));
  }

  return (await response.json()) as DashboardComparisonResponse;
};
