"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Globe, RefreshCw } from "lucide-react";
import { loadDashboardComparison, loadDashboardOverview } from "@/components/dashboard/dashboard-api";
import type { DashboardComparisonCompetitor, DashboardOverviewResponse } from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

const toStatusBadgeClass = (competitor: DashboardComparisonCompetitor): string => {
  if (competitor.trust.blockedOrManualNeeded || competitor.trust.lastCrawlStatus === "error") {
    return "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]";
  }

  return "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]";
};

const toStatusLabel = (competitor: DashboardComparisonCompetitor): string => {
  if (competitor.trust.lastCrawlStatus === "error") {
    return "Error";
  }

  if (competitor.trust.blockedOrManualNeeded) {
    return "Needs attention";
  }

  return "Active";
};

export default function DashboardCompetitorsContent() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [competitors, setCompetitors] = useState<DashboardComparisonCompetitor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadCompetitors = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [overviewResponse, comparisonResponse] = await Promise.all([
        loadDashboardOverview(),
        loadDashboardComparison(),
      ]);
      setOverview(overviewResponse);
      setCompetitors(comparisonResponse.competitors);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load competitors";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCompetitors();
  }, [loadCompetitors]);

  useEffect(() => {
    const onCompetitorAdded = (): void => {
      void loadCompetitors();
    };

    window.addEventListener("competitor:added", onCompetitorAdded);

    return () => {
      window.removeEventListener("competitor:added", onCompetitorAdded);
    };
  }, [loadCompetitors]);

  const limitLabel = useMemo(() => {
    if (!overview) {
      return "";
    }

    return `${overview.companyCounts.competitor}/${overview.entitlements.competitorLimit} competitors used`;
  }, [overview]);

  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#0f172a]">Competitors</h1>
        <p className="text-sm text-[#475569]">All tracked competitor sources and crawl status.</p>
      </header>

      <Card className="border-[#0f172a]/10 bg-white/95">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-black tracking-tight">Tracked competitor list</CardTitle>
            <CardDescription>{limitLabel || "Loading plan limits..."}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadCompetitors()}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-[#92400e]">
              <p className="inline-flex items-center gap-2 text-sm">
                <AlertCircle className="size-4" />
                {error}
              </p>
            </div>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-[#64748b]">Loading competitors...</p>
          ) : competitors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm text-[#64748b]">
              No competitors added yet.
            </p>
          ) : (
            competitors.map((competitor) => (
              <article
                key={competitor.companyId}
                className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#0f172a]">{competitor.name}</p>
                    <p className="inline-flex items-center gap-1 truncate text-xs text-[#64748b]">
                      <Globe className="size-3.5" />
                      {competitor.domain}
                    </p>
                  </div>
                  <Badge variant="outline" className={toStatusBadgeClass(competitor)}>
                    {toStatusLabel(competitor)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-[#64748b]">
                  Last checked: {formatDate(competitor.trust.lastCrawlAt)}
                  {typeof competitor.trust.latestConfidence === "number"
                    ? ` • ${Math.round(competitor.trust.latestConfidence * 100)}% confidence`
                    : ""}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
