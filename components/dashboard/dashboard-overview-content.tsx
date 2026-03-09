"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  loadDashboardComparison,
  loadDashboardFeed,
  loadDashboardOverview,
} from "@/components/dashboard/dashboard-api";
import DashboardComparisonSection from "@/components/dashboard/dashboard-comparison-section";
import DashboardEntitlementBanner from "@/components/dashboard/dashboard-entitlement-banner";
import type {
  DashboardComparisonCompetitor,
  DashboardFeedRow,
  DashboardOverviewResponse,
  FeedFilters,
} from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SelfPricingProfileData } from "@/types/self-pricing";

const INITIAL_FILTERS: FeedFilters = {
  severity: "all",
  verificationState: "all",
};

const getTodayKey = (value: Date): string => {
  return value.toISOString().slice(0, 10);
};

const isActiveTracking = (
  competitor: DashboardComparisonCompetitor
): boolean => {
  return (
    competitor.trust.lastCrawlStatus === "ok" ||
    competitor.trust.lastCrawlStatus === "idle"
  );
};

interface LatestChangePricePreview {
  type: "updated" | "added" | "removed";
  planName?: string;
  from?: number;
  to?: number;
  deltaPercent?: number;
  amount?: number;
}

const getLatestChangePricePreview = (
  normalizedDiff: Record<string, unknown>
): LatestChangePricePreview | null => {
  // Prefer plan-level changes
  const planChangesRaw = normalizedDiff.planChanges;
  if (Array.isArray(planChangesRaw)) {
    for (const entry of planChangesRaw) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry))
        continue;
      const pc = entry as Record<string, unknown>;
      const planName =
        typeof pc.planName === "string" ? pc.planName : undefined;
      const type = typeof pc.type === "string" ? pc.type : "updated";

      if (type === "updated") {
        const prev =
          typeof pc.previousAmount === "number" ? pc.previousAmount : undefined;
        const curr =
          typeof pc.currentAmount === "number" ? pc.currentAmount : undefined;
        const delta =
          typeof pc.deltaPercent === "number" ? pc.deltaPercent : undefined;
        if (prev !== undefined && curr !== undefined) {
          return {
            type: "updated",
            planName,
            from: prev,
            to: curr,
            deltaPercent: delta,
          };
        }
      } else if (type === "added") {
        const amount =
          typeof pc.currentAmount === "number" ? pc.currentAmount : undefined;
        if (amount !== undefined) return { type: "added", planName, amount };
      } else if (type === "removed") {
        const amount =
          typeof pc.previousAmount === "number" ? pc.previousAmount : undefined;
        if (amount !== undefined) return { type: "removed", planName, amount };
      }
    }
  }

  // Fallback: bucket-level
  const priceChangesRaw = normalizedDiff.priceChanges;
  if (!Array.isArray(priceChangesRaw)) return null;

  for (const entry of priceChangesRaw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const bucket = entry as Record<string, unknown>;
    const updated = Array.isArray(bucket.updatedAmounts)
      ? bucket.updatedAmounts
      : [];
    for (const u of updated) {
      if (typeof u !== "object" || u === null || Array.isArray(u)) continue;
      const ub = u as Record<string, unknown>;
      const prev =
        typeof ub.previousAmount === "number" ? ub.previousAmount : undefined;
      const curr =
        typeof ub.currentAmount === "number" ? ub.currentAmount : undefined;
      const delta =
        typeof ub.deltaPercent === "number" ? ub.deltaPercent : undefined;
      if (prev !== undefined && curr !== undefined) {
        return { type: "updated", from: prev, to: curr, deltaPercent: delta };
      }
    }
  }

  return null;
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return "Unknown";
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.round(diffMs / (1000 * 60));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.round(diffHours / 24)}d ago`;
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  "Monetization shift": "border-amber-200 bg-amber-50 text-amber-700",
  "Packaging shift": "border-violet-200 bg-violet-50 text-violet-700",
  "Upmarket shift": "border-blue-200 bg-blue-50 text-blue-700",
  "Land-and-expand shift": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Value framing shift": "border-sky-200 bg-sky-50 text-sky-700",
  "Minor adjustment": "border-slate-200 bg-slate-50 text-slate-600",
};

const getMoveClassificationLabel = (row: DashboardFeedRow): string | null => {
  const rec = row.latestInsight?.recommendation;
  if (!rec) return null;
  const mc = rec.moveClassification;
  if (typeof mc === "object" && mc !== null && !Array.isArray(mc)) {
    const label = (mc as Record<string, unknown>).label;
    if (typeof label === "string") return label;
  }
  return null;
};

const getInsightSummary = (row: DashboardFeedRow): string | null => {
  const rec = row.latestInsight?.recommendation;
  if (!rec) return null;
  if (typeof rec.summary === "string" && rec.summary.length > 0)
    return rec.summary;
  return null;
};

function LatestChangeCard({ row }: { row: DashboardFeedRow }) {
  const priceChange = getLatestChangePricePreview(row.normalizedDiff);
  const classificationLabel = getMoveClassificationLabel(row);
  const summary = getInsightSummary(row);
  const classificationColor = classificationLabel
    ? (CLASSIFICATION_COLORS[classificationLabel] ??
      "border-slate-200 bg-slate-50 text-slate-600")
    : null;

  return (
    <Card className="col-span-1 border-[#0f172a]/10 bg-white/95 md:col-span-2 xl:col-span-1">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardDescription className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-[#4338ca]" />
            Latest Change
          </CardDescription>
          <p className="mt-1 truncate text-sm font-semibold text-[#0f172a]">
            {row.company.name}
          </p>
          <p className="mt-0.5 text-xs text-[#94a3b8]">
            {formatRelativeTime(row.detectedAt)}
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-xs"
        >
          <a href="/dashboard/changes">
            View all
            <ChevronRight className="ml-0.5 size-3" />
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {/* Price change preview */}
        {priceChange && (
          <div className="flex items-center gap-1.5 text-sm">
            {priceChange.planName && (
              <span className="font-semibold text-[#0f172a]">
                {priceChange.planName}
              </span>
            )}
            {priceChange.type === "updated" &&
              priceChange.from !== undefined &&
              priceChange.to !== undefined && (
                <>
                  {priceChange.to > priceChange.from ? (
                    <TrendingUp className="size-3.5 text-red-500" />
                  ) : (
                    <TrendingDown className="size-3.5 text-emerald-600" />
                  )}
                  <span className="font-mono text-[#334155]">
                    ${priceChange.from}
                  </span>
                  <ArrowRight className="size-3 text-[#94a3b8]" />
                  <span className="font-mono font-semibold text-[#0f172a]">
                    ${priceChange.to}
                  </span>
                  {priceChange.deltaPercent !== undefined && (
                    <span
                      className={`text-xs font-semibold ${priceChange.to > priceChange.from ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {priceChange.to > priceChange.from ? "+" : "-"}
                      {Math.abs(priceChange.deltaPercent).toFixed(0)}%
                    </span>
                  )}
                </>
              )}
            {priceChange.type === "added" &&
              priceChange.amount !== undefined && (
                <span className="font-medium text-emerald-700">
                  + ${priceChange.amount} new tier
                </span>
              )}
            {priceChange.type === "removed" &&
              priceChange.amount !== undefined && (
                <span className="font-medium text-red-600">
                  - ${priceChange.amount} removed
                </span>
              )}
          </div>
        )}

        {/* Classification badge */}
        {classificationLabel && classificationColor && (
          <Badge variant="outline" className={`text-xs ${classificationColor}`}>
            {classificationLabel}
          </Badge>
        )}

        {/* Summary snippet */}
        {summary && (
          <p className="line-clamp-2 text-xs leading-relaxed text-[#475569]">
            {summary}
          </p>
        )}

        {/* Pricing source link */}
        {row.company.primaryPricingUrl && (
          <a
            href={row.company.primaryPricingUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#0f766e] hover:text-[#115e59] hover:underline"
          >
            Pricing source
            <ExternalLink className="size-3" />
          </a>
        )}

        {!priceChange && !summary && (
          <p className="text-sm text-[#64748b]">
            Pricing structure change detected
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardOverviewContent() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(
    null
  );
  const [competitors, setCompetitors] = useState<
    DashboardComparisonCompetitor[]
  >([]);
  const [selfPricingProfile, setSelfPricingProfile] =
    useState<SelfPricingProfileData | null>(null);
  const [recentRows, setRecentRows] = useState<DashboardFeedRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverviewData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [overviewResponse, comparisonResponse, feedResponse] =
        await Promise.all([
          loadDashboardOverview(),
          loadDashboardComparison(),
          loadDashboardFeed(INITIAL_FILTERS, { limit: 30 }),
        ]);

      setOverview(overviewResponse);
      setCompetitors(comparisonResponse.competitors);
      setSelfPricingProfile(comparisonResponse.selfPricingProfile);
      setRecentRows(feedResponse.rows.slice(0, 6));
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load dashboard";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverviewData();
  }, [loadOverviewData]);

  useEffect(() => {
    const onCompetitorAdded = (): void => {
      void loadOverviewData();
    };

    window.addEventListener("competitor:added", onCompetitorAdded);

    return () => {
      window.removeEventListener("competitor:added", onCompetitorAdded);
    };
  }, [loadOverviewData]);

  const totalCompetitors =
    overview?.companyCounts.competitor ?? competitors.length;
  const activeTracking = competitors.filter(isActiveTracking).length;
  const changedToday = useMemo(() => {
    const todayKey = getTodayKey(new Date());
    return recentRows.filter(
      (row) => getTodayKey(new Date(row.detectedAt)) === todayKey
    ).length;
  }, [recentRows]);

  const latestRow = recentRows.length > 0 ? recentRows[0] : null;

  const canAddCompetitor = Boolean(
    overview && totalCompetitors < (overview.entitlements.competitorLimit ?? 0)
  );

  return (
    <section className="space-y-6 px-4 py-5 lg:px-6">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-[#0f172a]">
          Dashboard
        </h1>
        <p className="mt-2 text-base text-[#475569]">
          Monitor competitors and track pricing changes.
        </p>
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-[#92400e]">
          <p className="inline-flex items-center gap-2 text-sm">
            <AlertCircle className="size-4" />
            {error}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadOverviewData()}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      <DashboardEntitlementBanner overview={overview} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardDescription>Total Competitors</CardDescription>
            <CardTitle className="text-4xl font-black">
              {isLoading ? "—" : totalCompetitors}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">
            Tracked websites
          </CardContent>
        </Card>

        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardDescription>Active Tracking</CardDescription>
            <CardTitle className="text-4xl font-black">
              {isLoading ? "—" : activeTracking}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">
            Currently monitoring
          </CardContent>
        </Card>

        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardDescription>Changed Today</CardDescription>
            <CardTitle className="text-4xl font-black">
              {isLoading ? "—" : changedToday}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">
            Website updates
          </CardContent>
        </Card>

        {/* Latest Change card replaces Needs Attention */}
        {isLoading ? (
          <Card className="border-[#0f172a]/10 bg-white/95">
            <CardHeader>
              <CardDescription>Latest Change</CardDescription>
              <CardTitle className="text-4xl font-black">—</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-[#64748b]">
              Loading...
            </CardContent>
          </Card>
        ) : latestRow ? (
          <LatestChangeCard row={latestRow} />
        ) : (
          <Card className="border-[#0f172a]/10 bg-white/95">
            <CardHeader>
              <CardDescription className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-[#4338ca]" />
                Latest Change
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-[#64748b]">No changes detected yet.</p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-xs"
              >
                <a href="/dashboard/changes">View feed</a>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <DashboardComparisonSection
        competitors={competitors}
        selfPricingProfile={selfPricingProfile}
      />

      {!canAddCompetitor && overview ? (
        <p className="text-sm text-[#c2410c]">
          You have reached your plan limit (
          {overview.entitlements.competitorLimit} competitors).
        </p>
      ) : null}
    </section>
  );
}
