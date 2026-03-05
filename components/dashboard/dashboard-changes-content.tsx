"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { loadDashboardFeed, loadDashboardOverview } from "@/components/dashboard/dashboard-api";
import DashboardEntitlementBanner from "@/components/dashboard/dashboard-entitlement-banner";
import { DataTable } from "@/components/data-table";
import type { DashboardFeedRow, DashboardOverviewResponse } from "@/types/dashboard";
import { Button } from "@/components/ui/button";

const DEFAULT_FILTERS = { severity: "all" as const, verificationState: "all" as const };

export default function DashboardChangesContent() {
  const [rows, setRows] = useState<DashboardFeedRow[]>([]);
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadFirstPage = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const [overviewResponse, response] = await Promise.all([
        loadDashboardOverview(),
        loadDashboardFeed(DEFAULT_FILTERS, { limit: 20 }),
      ]);
      setOverview(overviewResponse);
      setRows(response.rows);
      setHasMore(response.pageInfo.hasMore);
      setNextCursor(response.pageInfo.nextCursor);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load changes feed";
      setError(message);
      setRows([]);
      setHasMore(false);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!hasMore || !nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);

    try {
      const response = await loadDashboardFeed(DEFAULT_FILTERS, {
        limit: 20,
        cursor: nextCursor,
      });
      setRows((current) => [...current, ...response.rows]);
      setHasMore(response.pageInfo.hasMore);
      setNextCursor(response.pageInfo.nextCursor);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load more changes";
      setError(message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, isLoadingMore, nextCursor]);

  const emptyState = useMemo(() => !isLoading && rows.length === 0 && !error, [error, isLoading, rows.length]);

  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#0f172a]">Recent Changes</h1>
        <p className="text-sm text-[#475569]">
          All detected pricing changes with source health and AI-powered insights.
        </p>
      </header>

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-[#92400e]">
          <p className="inline-flex items-center gap-2 text-sm">
            <AlertCircle className="size-4" />
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadFirstPage()}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      <DashboardEntitlementBanner overview={overview} />

      <DataTable
        rows={rows}
        isLoading={isLoading}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        onLoadMore={loadMore}
      />

      {emptyState ? (
        <p className="text-center text-sm text-[#64748b]">No changes detected yet.</p>
      ) : null}
    </section>
  );
}
