import type { DashboardOverviewResponse } from "@/types/dashboard";

export interface DashboardAccessNotice {
  kind: "inactive" | "upgrade" | "limit";
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export const isCompetitorLimitReached = (
  overview: DashboardOverviewResponse | null
): boolean => {
  if (!overview || !overview.entitlements.hasAccess) {
    return false;
  }

  return overview.companyCounts.competitor >= overview.entitlements.competitorLimit;
};

export const canAddCompetitorFromOverview = (
  overview: DashboardOverviewResponse | null
): boolean => {
  if (!overview) {
    return true;
  }

  return overview.entitlements.hasAccess && !isCompetitorLimitReached(overview);
};

export const getDashboardAccessNotice = (
  overview: DashboardOverviewResponse | null
): DashboardAccessNotice | null => {
  if (!overview) {
    return null;
  }

  if (!overview.entitlements.hasAccess) {
    if (overview.trial.status === "expired") {
      return {
        kind: "inactive",
        title: "Trial expired",
        description: "Dashboard history stays visible, but adding competitors and ongoing monitoring are paused until you upgrade.",
        ctaLabel: "View plans",
        ctaHref: "/dashboard/settings",
      };
    }

    return {
      kind: "inactive",
      title: "Access inactive",
      description: "Start a paid plan to resume competitor tracking, verified change monitoring, and ongoing crawl jobs.",
      ctaLabel: "View plans",
      ctaHref: "/dashboard/settings",
    };
  }

  if (!isCompetitorLimitReached(overview)) {
    return null;
  }

  if (overview.entitlements.planTier === "starter" || overview.entitlements.accessSource === "trial") {
    return {
      kind: "upgrade",
      title: "Competitor limit reached",
      description: `You are using all ${overview.entitlements.competitorLimit} tracked competitor slots available on your current plan.`,
      ctaLabel: "Upgrade to Pro",
      ctaHref: "/dashboard/settings",
    };
  }

  return {
    kind: "limit",
    title: "Competitor cap reached",
    description: `You are already using all ${overview.entitlements.competitorLimit} competitor slots on Pro. Remove one before adding another.`,
    ctaLabel: "Review competitors",
    ctaHref: "/dashboard/competitors",
  };
};
