"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CircleAlert,
  ExternalLink,
  Globe,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import CompetitorManagementSheet from "@/components/dashboard/competitor-management-sheet";
import DashboardEntitlementBanner from "@/components/dashboard/dashboard-entitlement-banner";
import {
  loadDashboardComparison,
  loadDashboardOverview,
  retryCompetitorCrawl,
  runCompetitorCrawl,
} from "@/components/dashboard/dashboard-api";
import type {
  DashboardComparisonCompetitor,
  DashboardOverviewResponse,
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

const toStatusBadgeClass = (
  competitor: DashboardComparisonCompetitor
): string => {
  if (
    competitor.trust.blockedOrManualNeeded ||
    competitor.trust.lastCrawlStatus === "error"
  ) {
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

const getPriority = (competitor: DashboardComparisonCompetitor): number => {
  if (competitor.trust.lastCrawlStatus === "error") {
    return 0;
  }

  if (competitor.trust.lastCrawlStatus === "manual_needed") {
    return 1;
  }

  if (competitor.trust.lastCrawlStatus === "blocked") {
    return 2;
  }

  if (!competitor.primaryPricingUrl) {
    return 3;
  }

  if (!competitor.trust.lastCrawlAt) {
    return 4;
  }

  return 5;
};

const summarizeSnapshot = (
  competitor: DashboardComparisonCompetitor
): string | null => {
  const snapshot = competitor.latestSnapshot;
  if (!snapshot) {
    return null;
  }

  if (snapshot.pricingModel === "one_time") {
    return "One-time pricing detected; recurring comparison is unavailable.";
  }

  if (snapshot.pricingModel === "custom_only") {
    return "Custom pricing only; direct comparison is unavailable.";
  }

  if (snapshot.extractedPlans.length > 0) {
    const cadenceCount = snapshot.comparisonCadences.length;
    return `${snapshot.extractedPlans.length} named plan${snapshot.extractedPlans.length === 1 ? "" : "s"} extracted${cadenceCount > 0 ? ` across ${cadenceCount} billing cadence${cadenceCount === 1 ? "" : "s"}` : ""}.`;
  }

  if (snapshot.comparisonCadences.length > 0) {
    return "Pricing detected, but plan names couldn't be extracted.";
  }

  if (snapshot.pricePoints.length > 0) {
    return "Pricing detected, but billing cadence couldn't be determined.";
  }

  return null;
};

export default function DashboardCompetitorsContent() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(
    null
  );
  const [competitors, setCompetitors] = useState<
    DashboardComparisonCompetitor[]
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] =
    useState<DashboardComparisonCompetitor | null>(null);

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
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Failed to load competitors";
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

  const handleCrawlNow = async (companyId: string): Promise<void> => {
    setActiveCompanyId(companyId);

    try {
      const response = await runCompetitorCrawl(companyId);
      await loadCompetitors();
      toast.success(
        response.result.status === "ok"
          ? "Crawl completed"
          : `Crawl finished with status: ${response.result.status.replaceAll("_", " ")}`
      );
    } catch (crawlError) {
      const message =
        crawlError instanceof Error
          ? crawlError.message
          : "Failed to run crawl";
      toast.error(message);
    } finally {
      setActiveCompanyId(null);
    }
  };

  const handleRetryCrawl = async (companyId: string): Promise<void> => {
    setActiveCompanyId(companyId);

    try {
      await retryCompetitorCrawl(companyId);
      await loadCompetitors();
      toast.success("Crawl retried");
    } catch (retryError) {
      const message =
        retryError instanceof Error
          ? retryError.message
          : "Failed to retry crawl";
      toast.error(message);
    } finally {
      setActiveCompanyId(null);
    }
  };

  const limitLabel = useMemo(() => {
    if (!overview) {
      return "";
    }

    return `${overview.companyCounts.competitor}/${overview.entitlements.competitorLimit} competitors used`;
  }, [overview]);

  const sortedCompetitors = useMemo(() => {
    return [...competitors].sort((left, right) => {
      const priorityDiff = getPriority(left) - getPriority(right);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      if (!left.trust.lastCrawlAt && right.trust.lastCrawlAt) {
        return -1;
      }

      if (left.trust.lastCrawlAt && !right.trust.lastCrawlAt) {
        return 1;
      }

      return left.name.localeCompare(right.name);
    });
  }, [competitors]);

  const needsAttentionCount = useMemo(() => {
    return competitors.filter(
      (competitor) =>
        competitor.trust.lastCrawlStatus === "error" ||
        competitor.trust.lastCrawlStatus === "blocked" ||
        competitor.trust.lastCrawlStatus === "manual_needed"
    ).length;
  }, [competitors]);

  const missingPricingCount = useMemo(() => {
    return competitors.filter((competitor) => !competitor.primaryPricingUrl)
      .length;
  }, [competitors]);

  const activeTrackingCount = useMemo(() => {
    return competitors.filter(
      (competitor) =>
        competitor.trust.lastCrawlStatus === "ok" ||
        competitor.trust.lastCrawlStatus === "idle"
    ).length;
  }, [competitors]);

  return (
    <section className="space-y-5 px-4 py-5 lg:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#0f172a]">
          Competitors
        </h1>
        <p className="text-sm text-[#475569]">
          All tracked competitor sources and crawl status.
        </p>
      </header>

      <DashboardEntitlementBanner overview={overview} />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader className="gap-1">
            <CardDescription>Needs attention</CardDescription>
            <CardTitle className="text-3xl font-black">
              {isLoading ? "—" : needsAttentionCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">
            Error, blocked, or manual-review competitors first.
          </CardContent>
        </Card>
        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader className="gap-1">
            <CardDescription>Pricing not confirmed</CardDescription>
            <CardTitle className="text-3xl font-black">
              {isLoading ? "—" : missingPricingCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">
            Competitors that still need a trusted pricing source.
          </CardContent>
        </Card>
        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader className="gap-1">
            <CardDescription>Active tracking</CardDescription>
            <CardTitle className="text-3xl font-black">
              {isLoading ? "—" : activeTrackingCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-[#64748b]">
            Competitors ready for scheduled monitoring.
          </CardContent>
        </Card>
      </div>

      <Card className="border-[#0f172a]/10 bg-white/95">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-xl font-black tracking-tight">
              Tracked competitor list
            </CardTitle>
            <CardDescription>
              {limitLabel || "Loading plan limits..."}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadCompetitors()}
          >
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
          ) : sortedCompetitors.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm text-[#64748b]">
              No competitors added yet.
            </p>
          ) : (
            sortedCompetitors.map((competitor) => (
              <article
                key={competitor.companyId}
                className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-lg font-bold text-[#0f172a]">
                        {competitor.name}
                      </p>
                      {!competitor.primaryPricingUrl ? (
                        <Badge
                          variant="outline"
                          className="border-[#f59e0b]/35 bg-[#fffbeb] text-[#a16207]"
                        >
                          Pricing source needed
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 inline-flex items-center gap-1 truncate text-sm text-[#64748b]">
                      <Globe className="size-3.5" />
                      {competitor.domain}
                    </p>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-xl border border-white bg-white/80 p-3">
                        <p className="text-xs font-semibold tracking-[0.2em] text-[#64748b] uppercase">
                          Pricing source
                        </p>
                        {competitor.primaryPricingUrl ? (
                          <a
                            href={competitor.primaryPricingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-sm font-medium break-all text-[#0f766e] hover:underline"
                          >
                            {competitor.primaryPricingUrl}
                            <ExternalLink className="size-3.5" />
                          </a>
                        ) : (
                          <p className="mt-2 text-sm text-[#92400e]">
                            No primary pricing URL selected.
                          </p>
                        )}
                      </div>

                      <div className="rounded-xl border border-white bg-white/80 p-3">
                        <p className="text-xs font-semibold tracking-[0.2em] text-[#64748b] uppercase">
                          Trust details
                        </p>
                        <p className="mt-2 text-sm text-[#0f172a]">
                          Last checked:{" "}
                          {formatDate(competitor.trust.lastCrawlAt)}
                        </p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {typeof competitor.trust.latestConfidence === "number"
                            ? `${Math.round(competitor.trust.latestConfidence * 100)}% confidence`
                            : "No confidence score yet"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-white bg-white/80 p-3">
                        <p className="text-xs font-semibold tracking-[0.2em] text-[#64748b] uppercase">
                          Latest snapshot
                        </p>
                        <p className="mt-2 text-sm text-[#0f172a]">
                          {summarizeSnapshot(competitor) ??
                            "No extracted pricing snapshot yet."}
                        </p>
                      </div>
                    </div>

                    {competitor.trust.lastCrawlError ? (
                      <p className="mt-4 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
                        {competitor.trust.lastCrawlError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex min-w-[220px] flex-col gap-3">
                    <Badge
                      variant="outline"
                      className={toStatusBadgeClass(competitor)}
                    >
                      {toStatusLabel(competitor)}
                    </Badge>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedCompetitor(competitor);
                      }}
                      className="justify-start bg-white"
                    >
                      <Search className="size-4" />
                      Manage pricing source
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        void handleCrawlNow(competitor.companyId);
                      }}
                      disabled={activeCompanyId === competitor.companyId}
                      className="justify-start bg-white"
                    >
                      <RefreshCw className="size-4" />
                      Crawl now
                    </Button>
                    {competitor.trust.lastCrawlStatus === "error" ||
                    competitor.trust.lastCrawlStatus === "blocked" ||
                    competitor.trust.lastCrawlStatus === "manual_needed" ? (
                      <Button
                        onClick={() => {
                          void handleRetryCrawl(competitor.companyId);
                        }}
                        disabled={activeCompanyId === competitor.companyId}
                        className="justify-start bg-[#0f766e] text-white hover:bg-[#115e59]"
                      >
                        <RotateCcw className="size-4" />
                        Retry crawl
                      </Button>
                    ) : (
                      <div className="rounded-xl border border-dashed border-[#cbd5e1] px-3 py-2 text-sm text-[#64748b]">
                        <div className="inline-flex items-center gap-2">
                          <Sparkles className="size-4" />
                          Tracking is healthy.
                        </div>
                      </div>
                    )}
                    {getPriority(competitor) < 3 ? (
                      <div className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
                        <div className="inline-flex items-start gap-2">
                          <CircleAlert className="mt-0.5 size-4 shrink-0" />
                          Review this competitor before trusting new diffs.
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </CardContent>
      </Card>

      <CompetitorManagementSheet
        competitor={selectedCompetitor}
        open={Boolean(selectedCompetitor)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCompetitor(null);
          }
        }}
        onUpdated={loadCompetitors}
      />
    </section>
  );
}
