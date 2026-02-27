"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { loadDashboardFeed, loadDashboardOverview } from "@/components/dashboard/dashboard-api";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import type { DashboardFeedRow, DashboardOverviewResponse, FeedFilters } from "@/types/dashboard";
import { Button } from "@/components/ui/button";

const INITIAL_FILTERS: FeedFilters = {
  severity: "all",
  verificationState: "all",
};

export default function DashboardTrustContent() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [rows, setRows] = useState<DashboardFeedRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrustData = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [overviewResponse, feedResponse] = await Promise.all([
        loadDashboardOverview(),
        loadDashboardFeed(INITIAL_FILTERS, { limit: 20 }),
      ]);
      setOverview(overviewResponse);
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

  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#0f172a]">Trust Signals</h1>
        <p className="text-sm text-[#475569]">
          Confidence, crawl reliability, and verification mix for current monitoring.
        </p>
      </header>

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
    </section>
  );
}
