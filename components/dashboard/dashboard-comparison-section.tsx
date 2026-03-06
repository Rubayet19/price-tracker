"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  formatCurrencyAmount,
  getCompetitorComparisonPrices,
  getCompetitorComparisonUnavailableReason,
  getSelfComparisonPrices,
  summarizeCompetitorComparison,
  type ComparisonCadence,
} from "@/libs/dashboard-comparison";
import type { DashboardComparisonCompetitor } from "@/types/dashboard";
import type { SelfPricingProfileData } from "@/types/self-pricing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface DashboardComparisonSectionProps {
  competitors: DashboardComparisonCompetitor[];
  selfPricingProfile: SelfPricingProfileData | null;
}

const CADENCE_OPTIONS: Array<{ value: ComparisonCadence; label: string }> = [
  { value: "month", label: "Monthly" },
  { value: "year", label: "Annual" },
];

const cadenceSuffix = (
  cadence: ComparisonCadence,
  isPerMonth?: boolean
): string => {
  if (cadence === "month") return "/mo";
  return isPerMonth ? "/mo" : "/yr";
};

const formatCheckedAt = (value: string | null): string => {
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

const getSourceStatusLabel = (
  status: DashboardComparisonCompetitor["trust"]["lastCrawlStatus"]
): string => {
  if (status === "blocked") {
    return "Blocked";
  }

  if (status === "manual_needed" || status === "error") {
    return "Parse failed";
  }

  return "OK";
};

const getSourceStatusClass = (status: string): string => {
  if (status === "Blocked") {
    return "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]";
  }

  if (status === "Parse failed") {
    return "border-[#ef4444]/35 bg-[#fef2f2] text-[#b91c1c]";
  }

  return "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]";
};

const getConfidenceLabel = (value: number | null): string => {
  if (typeof value !== "number") {
    return "Low";
  }

  if (value >= 0.8) {
    return "High";
  }

  if (value >= 0.5) {
    return "Medium";
  }

  return "Low";
};

const getDefaultCadence = (
  competitors: DashboardComparisonCompetitor[]
): ComparisonCadence => {
  let hasMonthly = false;
  let hasAnnual = false;

  for (const competitor of competitors) {
    const cadences = competitor.latestSnapshot?.comparisonCadences ?? [];
    if (cadences.includes("month")) hasMonthly = true;
    if (cadences.includes("year")) hasAnnual = true;
  }

  return hasMonthly ? "month" : hasAnnual ? "year" : "month";
};

export default function DashboardComparisonSection({
  competitors,
  selfPricingProfile,
}: DashboardComparisonSectionProps) {
  const [cadence, setCadence] = useState<ComparisonCadence>(() =>
    getDefaultCadence(competitors)
  );

  const selfPrices = useMemo(
    () => getSelfComparisonPrices(selfPricingProfile, cadence),
    [cadence, selfPricingProfile]
  );

  return (
    <Card className="border-[#0f172a]/10 bg-white/95">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardTitle className="text-2xl font-black tracking-tight text-[#0f172a]">
            You vs Competitors
          </CardTitle>
          <CardDescription className="mt-2 max-w-3xl text-sm leading-6 text-[#475569]">
            Compare your current pricing baseline against the latest detected
            competitor prices. This first version compares by price position,
            not tier-name matching.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CADENCE_OPTIONS.map((option) => {
            const isActive = cadence === option.value;

            return (
              <Button
                key={option.value}
                type="button"
                variant={isActive ? "default" : "outline"}
                onClick={() => setCadence(option.value)}
                className={
                  isActive
                    ? "bg-[#0f172a] text-white hover:bg-[#1e293b]"
                    : "border-[#0f172a]/15 bg-white text-[#0f172a] hover:bg-[#f8fafc]"
                }
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {competitors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#cbd5e1] px-4 py-8 text-center text-sm text-[#64748b]">
            No competitors yet. Add a competitor to generate comparison data.
          </div>
        ) : (
          competitors.map((competitor) => {
            const competitorPrices = getCompetitorComparisonPrices(
              competitor,
              cadence
            );
            const unavailableReason = getCompetitorComparisonUnavailableReason(
              competitor,
              cadence
            );
            const summary = summarizeCompetitorComparison(
              competitor,
              competitorPrices,
              selfPrices,
              cadence
            );
            const sourceStatusLabel = getSourceStatusLabel(
              competitor.trust.lastCrawlStatus
            );
            const confidenceLabel = getConfidenceLabel(
              competitor.trust.latestConfidence
            );

            return (
              <article
                key={competitor.companyId}
                className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4 lg:p-5"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-bold tracking-tight text-[#0f172a]">
                        {competitor.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className={getSourceStatusClass(sourceStatusLabel)}
                      >
                        Source: {sourceStatusLabel}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="border-[#0f766e]/25 bg-[#f0fdfa] text-[#115e59]"
                      >
                        Confidence: {confidenceLabel}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-[#64748b]">
                      Last checked:{" "}
                      {formatCheckedAt(competitor.trust.lastCrawlAt)}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/competitors">
                      Manage source
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <div className="rounded-2xl border border-[#0f172a]/10 bg-white p-4">
                    <p className="text-xs font-semibold tracking-[0.16em] text-[#64748b] uppercase">
                      Your {cadence === "month" ? "monthly" : "annual"} pricing
                    </p>
                    <div className="mt-3 space-y-2">
                      {selfPrices.length === 0 ? (
                        <p className="text-sm text-[#64748b]">
                          No {cadence === "month" ? "monthly" : "annual"} prices
                          configured yet.
                        </p>
                      ) : (
                        selfPrices.map((plan) => (
                          <div
                            key={`${plan.name}-${cadence}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2"
                          >
                            <span className="font-medium text-[#0f172a]">
                              {plan.name}
                            </span>
                            <span className="text-sm text-[#334155]">
                              {formatCurrencyAmount(plan.currency, plan.amount)}
                              {cadenceSuffix(cadence)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[#0f172a]/10 bg-white p-4">
                    <p className="text-xs font-semibold tracking-[0.16em] text-[#64748b] uppercase">
                      Competitor detected{" "}
                      {cadence === "month" ? "monthly" : "annual"} pricing
                    </p>
                    <div className="mt-3 space-y-2">
                      {competitorPrices.length === 0 ? (
                        <p className="text-sm text-[#64748b]">
                          {unavailableReason ??
                            `No ${cadence === "month" ? "monthly" : "annual"} prices detected yet.`}
                        </p>
                      ) : (
                        competitorPrices.map((price) => (
                          <div
                            key={`${price.label}-${price.currency}-${price.minAmount}-${price.maxAmount}`}
                            className="flex items-center justify-between gap-3 rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2"
                          >
                            <span className="font-medium text-[#0f172a]">
                              {price.label}
                            </span>
                            <span className="text-sm text-[#334155]">
                              {price.minAmount === price.maxAmount
                                ? `${formatCurrencyAmount(price.currency, price.minAmount)}${cadenceSuffix(cadence, price.annualPriceIsPerMonth)}`
                                : `${formatCurrencyAmount(price.currency, price.minAmount)} – ${formatCurrencyAmount(price.currency, price.maxAmount)}${cadenceSuffix(cadence, price.annualPriceIsPerMonth)}`}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-[#0f766e]/15 bg-[#f0fdfa] px-4 py-3">
                  <p className="text-xs font-semibold tracking-[0.16em] text-[#0f766e] uppercase">
                    Comparison summary
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#134e4a]">
                    {summary}
                  </p>
                </div>

                {competitor.trust.lastCrawlError ? (
                  <p className="mt-3 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
                    Latest crawl note: {competitor.trust.lastCrawlError}
                  </p>
                ) : null}
              </article>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
