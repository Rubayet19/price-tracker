"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { loadDashboardComparison, loadDashboardFeed, loadDashboardOverview } from "@/components/dashboard/dashboard-api";
import DashboardEntitlementBanner from "@/components/dashboard/dashboard-entitlement-banner";
import type {
  DashboardComparisonCompetitor,
  DashboardFeedRow,
  DashboardOverviewResponse,
  FeedFilters,
} from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const INITIAL_FILTERS: FeedFilters = {
  severity: "all",
  verificationState: "all",
};

const getTodayKey = (value: Date): string => {
  return value.toISOString().slice(0, 10);
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return "Not checked yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not checked yet";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const summarizeDiff = (normalizedDiff: Record<string, unknown>): string => {
  const priceChangesRaw = normalizedDiff.priceChanges;
  const priceChanges = Array.isArray(priceChangesRaw) ? priceChangesRaw : [];

  if (priceChanges.length > 0) {
    return `${priceChanges.length} pricing bucket${priceChanges.length === 1 ? "" : "s"} changed`;
  }

  return "Pricing details changed";
};

const isActiveTracking = (competitor: DashboardComparisonCompetitor): boolean => {
  return competitor.trust.lastCrawlStatus === "ok" || competitor.trust.lastCrawlStatus === "idle";
};

export default function DashboardOverviewContent() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [competitors, setCompetitors] = useState<DashboardComparisonCompetitor[]>([]);
  const [recentRows, setRecentRows] = useState<DashboardFeedRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverviewData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [overviewResponse, comparisonResponse, feedResponse] = await Promise.all([
        loadDashboardOverview(),
        loadDashboardComparison(),
        loadDashboardFeed(INITIAL_FILTERS, { limit: 30 }),
      ]);

      setOverview(overviewResponse);
      setCompetitors(comparisonResponse.competitors);
      setRecentRows(feedResponse.rows.slice(0, 6));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load dashboard";
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

  const totalCompetitors = overview?.companyCounts.competitor ?? competitors.length;
  const activeTracking = competitors.filter(isActiveTracking).length;
  const changedToday = useMemo(() => {
    const todayKey = getTodayKey(new Date());
    return recentRows.filter((row) => getTodayKey(new Date(row.detectedAt)) === todayKey).length;
  }, [recentRows]);

  const needsAttention = useMemo(() => {
    if (!overview) {
      return 0;
    }

    return (
      overview.competitorStatusCounts.blocked +
      overview.competitorStatusCounts.manual_needed +
      overview.competitorStatusCounts.error
    );
  }, [overview]);

  const canAddCompetitor = Boolean(
    overview && totalCompetitors < (overview.entitlements.competitorLimit ?? 0)
  );

  return (
    <section className="space-y-6 px-4 py-5 lg:px-6">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-[#0f172a]">Dashboard</h1>
        <p className="mt-2 text-base text-[#475569]">Monitor competitors and track pricing changes.</p>
      </div>

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-[#92400e]">
          <p className="inline-flex items-center gap-2 text-sm">
            <AlertCircle className="size-4" />
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadOverviewData()}>
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
            <CardTitle className="text-4xl font-black">{isLoading ? "—" : totalCompetitors}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">Tracked websites</CardContent>
        </Card>

        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardDescription>Active Tracking</CardDescription>
            <CardTitle className="text-4xl font-black">{isLoading ? "—" : activeTracking}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">Currently monitoring</CardContent>
        </Card>

        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardDescription>Changed Today</CardDescription>
            <CardTitle className="text-4xl font-black">{isLoading ? "—" : changedToday}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">Website updates</CardContent>
        </Card>

        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardDescription>Needs Attention</CardDescription>
            <CardTitle className="text-4xl font-black">{isLoading ? "—" : needsAttention}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">Blocked/manual-needed/error</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card id="tracked-competitors" className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardTitle className="text-2xl font-black tracking-tight">Tracked Competitors</CardTitle>
            <CardDescription>All competitors currently monitored in your workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {competitors.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm text-[#64748b]">
                No competitors yet. Use Add Competitor to start monitoring.
              </p>
            ) : (
              competitors.slice(0, 6).map((competitor) => (
                <article
                  key={competitor.companyId}
                  className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0f172a]">{competitor.name}</p>
                      <p className="truncate text-sm text-[#64748b]">{competitor.domain}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        competitor.trust.blockedOrManualNeeded
                          ? "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]"
                          : "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]"
                      }
                    >
                      {competitor.trust.blockedOrManualNeeded ? "Needs attention" : "Active"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-[#64748b]">
                    Last checked: {formatDate(competitor.trust.lastCrawlAt)}
                  </p>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <Card id="recent-changes" className="border-[#0f172a]/10 bg-white/95">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl font-black tracking-tight">Recent Changes</CardTitle>
              <CardDescription>Latest updates from tracked competitors.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href="/dashboard/changes">View all</a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm text-[#64748b]">
                No recent changes found yet.
              </p>
            ) : (
              recentRows.map((row) => (
                <article key={row.diffId} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          row.verificationState === "verified"
                            ? "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]"
                            : "border-[#64748b]/35 bg-[#f8fafc] text-[#475569]"
                        }
                      >
                        {row.verificationState === "verified" ? "Verified" : "Unverified"}
                      </Badge>
                      <p className="font-semibold text-[#0f172a]">{row.company.domain}</p>
                    </div>
                    <p className="text-xs text-[#64748b]">{formatDate(row.detectedAt)}</p>
                  </div>
                  <p className="mt-2 text-sm text-[#334155]">{summarizeDiff(row.normalizedDiff)}</p>
                </article>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {!canAddCompetitor && overview ? (
        <p className="text-sm text-[#c2410c]">
          You have reached your plan limit ({overview.entitlements.competitorLimit} competitors).
        </p>
      ) : null}
    </section>
  );
}
