"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckSquare, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { DashboardFeedRow } from "@/types/dashboard";
import type {
  LlmInsightRecommendation,
  RulesInsightRecommendation,
  StrategicOption,
} from "@/types/insight";

interface PriceChange {
  label: string;
  planName?: string;
  type: "updated" | "added" | "removed";
  from?: number;
  to?: number;
  deltaPercent?: number;
  amount?: number;
}

const parsePriceChanges = (
  normalizedDiff: Record<string, unknown>
): PriceChange[] => {
  const result: PriceChange[] = [];

  // Prefer plan-level changes (include tier names)
  const planChangesRaw = normalizedDiff.planChanges;
  if (Array.isArray(planChangesRaw) && planChangesRaw.length > 0) {
    for (const entry of planChangesRaw) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry))
        continue;
      const pc = entry as Record<string, unknown>;
      const planName =
        typeof pc.planName === "string" ? pc.planName : undefined;
      const period = typeof pc.period === "string" ? pc.period : "";
      const type = typeof pc.type === "string" ? pc.type : "updated";
      const label = planName ? `${planName} (${period})` : period;

      if (type === "updated") {
        const prev =
          typeof pc.previousAmount === "number" ? pc.previousAmount : undefined;
        const curr =
          typeof pc.currentAmount === "number" ? pc.currentAmount : undefined;
        const delta =
          typeof pc.deltaPercent === "number" ? pc.deltaPercent : undefined;
        if (prev !== undefined && curr !== undefined) {
          result.push({
            label,
            planName,
            type: "updated",
            from: prev,
            to: curr,
            deltaPercent: delta,
          });
        }
      } else if (type === "added") {
        const amount =
          typeof pc.currentAmount === "number" ? pc.currentAmount : undefined;
        if (amount !== undefined)
          result.push({ label, planName, type: "added", amount });
      } else if (type === "removed") {
        const amount =
          typeof pc.previousAmount === "number" ? pc.previousAmount : undefined;
        if (amount !== undefined)
          result.push({ label, planName, type: "removed", amount });
      }
    }
    if (result.length > 0) return result;
  }

  // Fallback: bucket-level changes (no tier names)
  const priceChangesRaw = normalizedDiff.priceChanges;
  if (!Array.isArray(priceChangesRaw)) return [];

  for (const entry of priceChangesRaw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const bucket = entry as Record<string, unknown>;
    const currency =
      typeof bucket.currency === "string" ? bucket.currency : "USD";
    const period =
      typeof bucket.period === "string" ? bucket.period : "unknown";
    const label = `${currency} / ${period}`;

    const updated = Array.isArray(bucket.updatedAmounts)
      ? bucket.updatedAmounts
      : [];
    const added = Array.isArray(bucket.addedAmounts) ? bucket.addedAmounts : [];
    const removed = Array.isArray(bucket.removedAmounts)
      ? bucket.removedAmounts
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
        result.push({
          label,
          type: "updated",
          from: prev,
          to: curr,
          deltaPercent: delta,
        });
      }
    }
    for (const a of added) {
      if (typeof a === "number")
        result.push({ label, type: "added", amount: a });
    }
    for (const r of removed) {
      if (typeof r === "number")
        result.push({ label, type: "removed", amount: r });
    }
  }

  return result;
};

interface InsightModalProps {
  row: DashboardFeedRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const isLlmRecommendation = (r: Record<string, unknown>): boolean => {
  return (
    typeof r.summary === "string" &&
    typeof r.moveClassification === "object" &&
    r.moveClassification !== null &&
    Array.isArray(r.strategicOptions)
  );
};

const isRulesRecommendation = (r: Record<string, unknown>): boolean => {
  return typeof r.headline === "string" && Array.isArray(r.actionItems);
};

const STRATEGY_ICONS: Record<string, string> = {
  "Compete on price": "💰",
  "Compete on features": "🔧",
  "Compete on positioning": "📣",
};

const EFFORT_RISK_COLORS: Record<string, string> = {
  Low: "text-[#166534] bg-[#f0fdf4] border-[#16a34a]/30",
  Medium: "text-[#c2410c] bg-[#fff7ed] border-[#ea580c]/35",
  High: "text-[#b91c1c] bg-[#fef2f2] border-[#ef4444]/40",
};

const MOVE_CLASSIFICATION_COLORS: Record<string, string> = {
  "Monetization shift": "text-[#b45309] bg-[#fffbeb] border-[#f59e0b]/35",
  "Packaging shift": "text-[#6d28d9] bg-[#f5f3ff] border-[#7c3aed]/30",
  "Upmarket shift": "text-[#1d4ed8] bg-[#eff6ff] border-[#3b82f6]/30",
  "Land-and-expand shift": "text-[#166534] bg-[#f0fdf4] border-[#16a34a]/30",
  "Value framing shift": "text-[#0369a1] bg-[#f0f9ff] border-[#0284c7]/30",
  "Minor adjustment": "text-[#475569] bg-[#f8fafc] border-[#64748b]/30",
};

function WhatChanged({
  normalizedDiff,
}: {
  normalizedDiff: Record<string, unknown>;
}) {
  const changes = parsePriceChanges(normalizedDiff);
  if (changes.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
      <p className="text-xs font-semibold tracking-wide text-[#475569] uppercase">
        What changed
      </p>
      <ul className="space-y-2.5">
        {changes.map((c, i) => {
          if (
            c.type === "updated" &&
            c.from !== undefined &&
            c.to !== undefined
          ) {
            const up = c.to > c.from;
            const pct =
              c.deltaPercent !== undefined
                ? `${up ? "+" : "-"}${Math.abs(c.deltaPercent).toFixed(0)}%`
                : null;
            return (
              <li key={i} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {c.planName && (
                    <span className="shrink-0 text-sm font-semibold text-[#0f172a]">
                      {c.planName}
                    </span>
                  )}
                  {!c.planName && (
                    <span className="shrink-0 font-mono text-xs text-[#64748b]">
                      {c.label}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="font-mono text-sm text-[#64748b]">
                    ${c.from}
                  </span>
                  <span className="text-[#94a3b8]">→</span>
                  <span className="font-mono text-sm font-semibold text-[#0f172a]">
                    ${c.to}
                  </span>
                  {pct && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-semibold ${up ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {pct}
                    </span>
                  )}
                </div>
              </li>
            );
          }
          if (c.type === "added" && c.amount !== undefined) {
            return (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#0f172a]">
                  {c.planName ?? c.label}
                </span>
                <span className="text-sm font-medium text-emerald-700">
                  + ${c.amount} <span className="text-emerald-600/70">new</span>
                </span>
              </li>
            );
          }
          if (c.type === "removed" && c.amount !== undefined) {
            return (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[#0f172a]">
                  {c.planName ?? c.label}
                </span>
                <span className="text-sm font-medium text-red-600">
                  − ${c.amount} <span className="text-red-500/70">removed</span>
                </span>
              </li>
            );
          }
          return null;
        })}
      </ul>
    </div>
  );
}

function SectionLabel({
  icon,
  label,
  color,
}: {
  icon: ReactNode;
  label: string;
  color: string;
}) {
  return (
    <p
      className={`flex items-center gap-1 text-xs font-semibold tracking-wide uppercase ${color}`}
    >
      {icon}
      {label}
    </p>
  );
}

function StrategyCard({ option }: { option: StrategicOption }) {
  const icon = STRATEGY_ICONS[option.strategy] ?? "→";
  return (
    <div className="space-y-2 rounded-xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm font-semibold text-[#0f172a]">
            {option.strategy}
          </span>
        </div>
        <div className="flex gap-1.5">
          <Badge
            variant="outline"
            className={`text-xs ${EFFORT_RISK_COLORS[option.effort] ?? ""}`}
          >
            {option.effort} effort
          </Badge>
          <Badge
            variant="outline"
            className={`text-xs ${EFFORT_RISK_COLORS[option.risk] ?? ""}`}
          >
            {option.risk} risk
          </Badge>
        </div>
      </div>
      <p className="text-sm text-[#334155]">{option.action}</p>
      <p className="text-xs text-[#64748b]">Best when: {option.bestFor}</p>
    </div>
  );
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className={`flex gap-2 text-sm ${color}`}>
          <span className="mt-0.5 shrink-0">·</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function InsightModal({
  row,
  open,
  onOpenChange,
}: InsightModalProps) {
  if (!row?.latestInsight) return null;

  const rec = row.latestInsight.recommendation;

  if (isLlmRecommendation(rec)) {
    const llm = rec as unknown as LlmInsightRecommendation;
    const mc = llm.moveClassification;
    const mcColor =
      MOVE_CLASSIFICATION_COLORS[mc.label] ??
      "text-[#475569] bg-[#f8fafc] border-[#64748b]/30";

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] max-w-2xl space-y-5 overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[#64748b]">
                {row.company.name}
              </span>
              <Badge variant="outline" className={`text-xs ${mcColor}`}>
                {mc.label}
              </Badge>
            </div>
            <DialogTitle>Pricing intelligence</DialogTitle>
            <DialogDescription>{mc.description}</DialogDescription>
          </DialogHeader>

          <WhatChanged normalizedDiff={row.normalizedDiff} />

          <p className="text-sm leading-relaxed text-[#334155]">
            {llm.summary}
          </p>

          {/* Strategic options */}
          <div className="space-y-3">
            <SectionLabel
              icon={null}
              label="Your strategic options"
              color="text-[#64748b]"
            />
            {llm.strategicOptions.map((opt) => (
              <StrategyCard key={opt.strategy} option={opt} />
            ))}
          </div>

          {/* Things to check */}
          {llm.thingsToCheck && llm.thingsToCheck.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#0284c7]/20 bg-[#f0f9ff] p-4">
              <SectionLabel
                icon={<CheckSquare className="size-3.5" />}
                label="Things to check"
                color="text-[#0369a1]"
              />
              <BulletList items={llm.thingsToCheck} color="text-[#0c4a6e]" />
            </div>
          )}

          {/* Watch out for */}
          {llm.watchOutFor && llm.watchOutFor.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#ea580c]/20 bg-[#fff7ed] p-4">
              <SectionLabel
                icon={<AlertTriangle className="size-3.5" />}
                label="Watch out for"
                color="text-[#c2410c]"
              />
              <BulletList items={llm.watchOutFor} color="text-[#7c2d12]" />
            </div>
          )}

          {/* Watch list */}
          {llm.watchList.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
              <SectionLabel
                icon={<Eye className="size-3.5" />}
                label="Monitor over time"
                color="text-[#475569]"
              />
              <BulletList items={llm.watchList} color="text-[#334155]" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  if (isRulesRecommendation(rec)) {
    const rules = rec as unknown as RulesInsightRecommendation;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl space-y-4">
          <DialogHeader>
            <span className="text-sm font-semibold text-[#64748b]">
              {row.company.name}
            </span>
            <DialogTitle>{rules.headline}</DialogTitle>
          </DialogHeader>

          <WhatChanged normalizedDiff={row.normalizedDiff} />

          <p className="text-sm leading-relaxed text-[#334155]">
            {rules.summary}
          </p>

          {rules.actionItems.length > 0 && (
            <div className="space-y-2">
              <SectionLabel
                icon={null}
                label="Recommended actions"
                color="text-[#64748b]"
              />
              <ul className="space-y-2">
                {rules.actionItems.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[#334155]">
                    <span className="shrink-0 font-bold text-[#0f766e]">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return null;
}
