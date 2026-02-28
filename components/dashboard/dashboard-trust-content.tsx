"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import {
  loadDashboardComparison,
  loadDashboardFeed,
  loadDashboardOverview,
} from "@/components/dashboard/dashboard-api";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import DashboardEntitlementBanner from "@/components/dashboard/dashboard-entitlement-banner";
import type {
  DashboardComparisonCompetitor,
  DashboardFeedRow,
  DashboardOverviewResponse,
  FeedFilters,
} from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const INITIAL_FILTERS: FeedFilters = {
  severity: "all",
  verificationState: "all",
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

export default function DashboardTrustContent() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [competitors, setCompetitors] = useState<DashboardComparisonCompetitor[]>([]);
  const [rows, setRows] = useState<DashboardFeedRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrustData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [overviewResponse, comparisonResponse, feedResponse] = await Promise.all([
        loadDashboardOverview(),
        loadDashboardComparison(),
        loadDashboardFeed(INITIAL_FILTERS, { limit: 20 }),
      ]);
      setOverview(overviewResponse);
      setCompetitors(comparisonResponse.competitors);
      setRows(feedResponse.rows);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load trust signals";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrustData();
  }, [loadTrustData]);

  const reviewQueue = competitors.filter((competitor) => {
    return (
      competitor.trust.lastCrawlStatus === "error" ||
      competitor.trust.lastCrawlStatus === "blocked" ||
      competitor.trust.lastCrawlStatus === "manual_needed" ||
      !competitor.primaryPricingUrl
    );
  });

  const healthySourcesCount = competitors.filter((competitor) => {
    return (
      (competitor.trust.lastCrawlStatus === "ok" || competitor.trust.lastCrawlStatus === "idle") &&
      competitor.latestSnapshot?.isVerified
    );
  }).length;

  const highConfidenceCount = competitors.filter((competitor) => {
    return typeof competitor.trust.latestConfidence === "number" && competitor.trust.latestConfidence >= 0.8;
  }).length;

  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#0f172a]">Trust Signals</h1>
        <p className="text-sm text-[#475569]">
          Confidence, crawl reliability, and verification mix for current monitoring.
        </p>
      </header>

      <DashboardEntitlementBanner overview={overview} />

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-[#92400e]">
          <p className="inline-flex items-center gap-2 text-sm">
            <AlertCircle className="size-4" />
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadTrustData()}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      <ChartAreaInteractive overview={overview} rows={rows} isLoading={isLoading} />

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-black tracking-tight text-[#0f172a]">Review queue</CardTitle>
              <CardDescription>
                Competitors that need manual confirmation before you should trust automated changes.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/competitors">
                Open competitors
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-sm text-[#64748b]">Loading trust queue...</p>
            ) : reviewQueue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm text-[#64748b]">
                No competitors need manual review right now.
              </div>
            ) : (
              reviewQueue.map((competitor) => (
                <article key={competitor.companyId} className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0f172a]">{competitor.name}</p>
                      <p className="truncate text-sm text-[#64748b]">{competitor.domain}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        competitor.trust.lastCrawlStatus === "error" || competitor.trust.blockedOrManualNeeded
                          ? "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]"
                          : "border-[#f59e0b]/35 bg-[#fffbeb] text-[#a16207]"
                      }
                    >
                      {!competitor.primaryPricingUrl
                        ? "Pricing source needed"
                        : competitor.trust.lastCrawlStatus.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-[#475569]">
                    Last checked: {formatDate(competitor.trust.lastCrawlAt)}
                  </p>
                  {competitor.trust.lastCrawlError ? (
                    <p className="mt-2 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
                      {competitor.trust.lastCrawlError}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-[#0f172a]/10 bg-white/95">
            <CardHeader>
              <CardTitle className="text-xl font-black tracking-tight text-[#0f172a]">Coverage summary</CardTitle>
              <CardDescription>How much of the monitored set is currently trustworthy enough to act on.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Healthy sources</p>
                <p className="mt-2 text-2xl font-black text-[#0f172a]">{isLoading ? "—" : healthySourcesCount}</p>
                <p className="mt-1 text-sm text-[#64748b]">Verified latest snapshot and no crawl issue.</p>
              </div>
              <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">High confidence</p>
                <p className="mt-2 text-2xl font-black text-[#0f172a]">{isLoading ? "—" : highConfidenceCount}</p>
                <p className="mt-1 text-sm text-[#64748b]">Competitors at 80% confidence or higher.</p>
              </div>
              <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Verified in 7d</p>
                <p className="mt-2 text-2xl font-black text-[#0f172a]">
                  {isLoading ? "—" : overview?.recentVerifiedChanges7d.total ?? 0}
                </p>
                <p className="mt-1 text-sm text-[#64748b]">Recent changes already verified in the feed.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#0f172a]/10 bg-white/95">
            <CardHeader>
              <CardTitle className="text-xl font-black tracking-tight text-[#0f172a]">Recent trust sample</CardTitle>
              <CardDescription>Latest feed rows, with verification state visible before any recommendation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <p className="text-sm text-[#64748b]">Loading recent trust sample...</p>
              ) : rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm text-[#64748b]">
                  No recent pricing diffs yet.
                </div>
              ) : (
                rows.slice(0, 5).map((row) => (
                  <article key={row.diffId} className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#0f172a]">{row.company.domain}</p>
                      <Badge
                        variant="outline"
                        className={
                          row.verificationState === "verified"
                            ? "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]"
                            : "border-[#64748b]/35 bg-white text-[#475569]"
                        }
                      >
                        {row.verificationState === "verified" ? (
                          <ShieldCheck className="size-3.5" />
                        ) : (
                          <CircleAlert className="size-3.5" />
                        )}
                        {row.verificationState}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-[#475569]">
                      Detected {formatDate(row.detectedAt)} · confidence{" "}
                      {typeof row.company.latestConfidence === "number"
                        ? `${Math.round(row.company.latestConfidence * 100)}%`
                        : "unknown"}
                    </p>
                  </article>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
