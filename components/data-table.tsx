"use client";

import { memo, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { DashboardFeedRow } from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InsightModal from "@/components/dashboard/insight-modal";

interface DataTableProps {
  rows: DashboardFeedRow[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

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

interface PriceChangePreview {
  type: "updated" | "added" | "removed";
  planName?: string;
  from?: number;
  to?: number;
  deltaPercent?: number;
  amount?: number;
}

const getFirstPriceChange = (
  normalizedDiff: Record<string, unknown>
): PriceChangePreview | null => {
  // Prefer plan-level changes (include tier name)
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

  // Fallback: bucket-level changes
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

    const added = Array.isArray(bucket.addedAmounts) ? bucket.addedAmounts : [];
    for (const a of added) {
      if (typeof a === "number") return { type: "added", amount: a };
    }

    const removed = Array.isArray(bucket.removedAmounts)
      ? bucket.removedAmounts
      : [];
    for (const r of removed) {
      if (typeof r === "number") return { type: "removed", amount: r };
    }
  }

  return null;
};

const getMoveClassificationLabel = (row: DashboardFeedRow): string | null => {
  const rec = row.latestInsight?.recommendation;
  if (!rec) return null;
  const mc = rec.moveClassification;
  if (typeof mc === "object" && mc !== null && !Array.isArray(mc)) {
    const label = (mc as Record<string, unknown>).label;
    if (typeof label === "string") return label;
  }
  if (typeof rec.headline === "string") return "Analysis available";
  return null;
};

const getInsightSummary = (row: DashboardFeedRow): string | null => {
  const rec = row.latestInsight?.recommendation;
  if (!rec) return null;
  if (typeof rec.summary === "string" && rec.summary.length > 0)
    return rec.summary;
  return null;
};

const CLASSIFICATION_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  "Monetization shift": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  "Packaging shift": {
    bg: "bg-violet-50",
    text: "text-violet-700",
    border: "border-violet-200",
  },
  "Upmarket shift": {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  "Land-and-expand shift": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  "Value framing shift": {
    bg: "bg-sky-50",
    text: "text-sky-700",
    border: "border-sky-200",
  },
  "Minor adjustment": {
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
  },
  "Analysis available": {
    bg: "bg-teal-50",
    text: "text-teal-700",
    border: "border-teal-200",
  },
};

function PriceChangeInline({ change }: { change: PriceChangePreview }) {
  if (
    change.type === "updated" &&
    change.from !== undefined &&
    change.to !== undefined
  ) {
    const up = change.to > change.from;
    const pct =
      change.deltaPercent !== undefined
        ? `${up ? "+" : "-"}${Math.abs(change.deltaPercent).toFixed(0)}%`
        : null;
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        {change.planName && (
          <span className="font-semibold text-[#0f172a]">
            {change.planName}
          </span>
        )}
        {up ? (
          <TrendingUp className="size-3.5 text-red-500" />
        ) : (
          <TrendingDown className="size-3.5 text-emerald-600" />
        )}
        <span className="font-mono text-[#334155]">${change.from}</span>
        <ArrowRight className="size-3 text-[#94a3b8]" />
        <span className="font-mono font-semibold text-[#0f172a]">
          ${change.to}
        </span>
        {pct && (
          <span
            className={`text-xs font-semibold ${up ? "text-red-600" : "text-emerald-600"}`}
          >
            {pct}
          </span>
        )}
      </span>
    );
  }
  if (change.type === "added" && change.amount !== undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
        {change.planName && (
          <span className="font-semibold">{change.planName}</span>
        )}
        <TrendingUp className="size-3.5" />
        <span className="font-mono font-semibold">${change.amount}</span>
        <span>new tier</span>
      </span>
    );
  }
  if (change.type === "removed" && change.amount !== undefined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
        {change.planName && (
          <span className="font-semibold">{change.planName}</span>
        )}
        <TrendingDown className="size-3.5" />
        <span className="font-mono font-semibold">${change.amount}</span>
        <span>removed</span>
      </span>
    );
  }
  return null;
}

const FeedCard = memo(function FeedCard({
  row,
  onViewInsight,
}: {
  row: DashboardFeedRow;
  onViewInsight: () => void;
}) {
  const insightLabel = useMemo(() => getMoveClassificationLabel(row), [row]);
  const summary = useMemo(() => getInsightSummary(row), [row]);
  const priceChange = useMemo(
    () => getFirstPriceChange(row.normalizedDiff),
    [row.normalizedDiff]
  );
  const colors = insightLabel
    ? (CLASSIFICATION_COLORS[insightLabel] ??
      CLASSIFICATION_COLORS["Analysis available"])
    : null;
  const hasInsight = !!insightLabel;

  return (
    <div
      className={`group relative px-4 py-4 transition-colors lg:px-6 ${
        hasInsight ? "cursor-pointer hover:bg-[#fafbfd]" : ""
      }`}
      onClick={hasInsight ? onViewInsight : undefined}
      role={hasInsight ? "button" : undefined}
      tabIndex={hasInsight ? 0 : undefined}
      onKeyDown={
        hasInsight
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onViewInsight();
              }
            }
          : undefined
      }
    >
      {/* Top row: company + time + classification badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-[#0f172a]">
                {row.company.name}
              </span>
              <a
                href={`https://${row.company.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-[#0f766e] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {row.company.domain}
                <ExternalLink className="size-3" />
              </a>
              {row.company.primaryPricingUrl && (
                <a
                  href={row.company.primaryPricingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-[#0f766e] hover:text-[#115e59] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Pricing source
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs whitespace-nowrap text-[#94a3b8]">
            {formatRelativeTime(row.detectedAt)}
          </span>
          {insightLabel && colors && (
            <Badge
              variant="outline"
              className={`text-xs ${colors.bg} ${colors.text} ${colors.border}`}
            >
              {insightLabel}
            </Badge>
          )}
        </div>
      </div>

      {/* Insight preview */}
      {hasInsight && (
        <div className="mt-3 flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Price change preview */}
            {priceChange && (
              <div>
                <PriceChangeInline change={priceChange} />
              </div>
            )}

            {/* AI summary snippet */}
            {summary && (
              <p className="line-clamp-2 text-sm leading-relaxed text-[#475569]">
                {summary}
              </p>
            )}
          </div>

          {/* View insight CTA */}
          <div className="shrink-0 self-center">
            <span className="inline-flex items-center gap-1 text-sm font-medium text-[#4338ca] opacity-60 transition-opacity group-hover:opacity-100">
              View insight
              <ChevronRight className="size-4" />
            </span>
          </div>
        </div>
      )}

      {/* No insight placeholder */}
      {!hasInsight && (
        <div className="mt-2">
          {priceChange ? (
            <PriceChangeInline change={priceChange} />
          ) : (
            <p className="text-sm text-[#94a3b8]">
              Pricing structure change detected
            </p>
          )}
        </div>
      )}
    </div>
  );
});

export function DataTable({
  rows,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
}: DataTableProps) {
  const [insightRow, setInsightRow] = useState<DashboardFeedRow | null>(null);

  return (
    <section id="feed" className="px-4 lg:px-6">
      <div className="overflow-hidden rounded-2xl border border-[#0f172a]/10 bg-white/95 shadow-[0_18px_30px_-24px_rgba(2,6,23,0.55)]">
        <div className="border-b border-[#0f172a]/10 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black tracking-tight text-[#0f172a]">
              Change feed
            </h2>
            <Sparkles className="size-4 text-[#4338ca]" />
          </div>
          <p className="text-sm text-[#475569]">
            Pricing changes with AI-powered strategic insights.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-[#475569]">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading change feed...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-[#475569]">
            No changes detected yet.
          </div>
        ) : (
          <div className="divide-y divide-[#0f172a]/[0.06]">
            {rows.map((row) => (
              <FeedCard
                key={row.diffId}
                row={row}
                onViewInsight={() => setInsightRow(row)}
              />
            ))}
          </div>
        )}

        <div className="flex justify-end border-t border-[#0f172a]/10 px-4 py-3 lg:px-6">
          <Button
            variant="outline"
            className="h-9 border-[#0f172a]/20 text-[#0f172a] hover:bg-[#f8fafc]"
            disabled={!hasMore || isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="mr-2 size-3.5 animate-spin" />
                Loading more
              </>
            ) : hasMore ? (
              "Load more"
            ) : (
              "No more rows"
            )}
          </Button>
        </div>
      </div>

      <InsightModal
        row={insightRow}
        open={insightRow !== null}
        onOpenChange={(open) => {
          if (!open) setInsightRow(null);
        }}
      />
    </section>
  );
}
