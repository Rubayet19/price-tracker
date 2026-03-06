import { Clock3, ShieldAlert, ShieldCheck, Waypoints } from "lucide-react";
import type {
  DashboardFeedRow,
  DashboardOverviewResponse,
} from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ChartAreaInteractiveProps {
  overview: DashboardOverviewResponse | null;
  rows: DashboardFeedRow[];
  isLoading: boolean;
}

const formatRelativeTime = (value: string): string => {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
};

const toConfidenceText = (rows: DashboardFeedRow[]): string => {
  const confidenceValues = rows
    .map((row) => row.company.latestConfidence)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    );

  if (confidenceValues.length === 0) {
    return "No confidence samples yet";
  }

  const average =
    confidenceValues.reduce((total, value) => total + value, 0) /
    confidenceValues.length;
  return `${Math.round(average * 100)}% avg confidence`;
};

const toVerificationRate = (rows: DashboardFeedRow[]): string => {
  if (rows.length === 0) {
    return "No recent feed rows";
  }

  const verifiedCount = rows.filter(
    (row) => row.verificationState === "verified"
  ).length;
  return `${Math.round((verifiedCount / rows.length) * 100)}% verified in feed`;
};

export function ChartAreaInteractive({
  overview,
  rows,
  isLoading,
}: ChartAreaInteractiveProps) {
  const latestDetectedAt = rows[0]?.detectedAt ?? null;
  const blockedSources =
    (overview?.competitorStatusCounts.blocked ?? 0) +
    (overview?.competitorStatusCounts.manual_needed ?? 0);
  const totalCompetitors = overview?.companyCounts.competitor ?? 0;

  return (
    <Card className="border-[#0f172a]/10 bg-white/90 shadow-[0_18px_35px_-28px_rgba(2,6,23,0.7)]">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <CardTitle className="text-xl font-black tracking-tight text-[#0f172a]">
            Trust signal overview
          </CardTitle>
          <CardDescription className="mt-1 text-[#475569]">
            Confidence, verification, and crawl health are visible before acting
            on a pricing change.
          </CardDescription>
        </div>
        <Badge
          variant="outline"
          className={
            blockedSources > 0
              ? "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]"
              : "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]"
          }
        >
          {blockedSources > 0 ? (
            <ShieldAlert className="size-3.5" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          {blockedSources > 0
            ? `${blockedSources} sources need review`
            : "All sources healthy"}
        </Badge>
      </CardHeader>

      <CardContent className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#0f766e] uppercase">
            Latest feed update
          </p>
          <p className="mt-2 text-lg font-bold text-[#0f172a]">
            {isLoading
              ? "Loading..."
              : latestDetectedAt
                ? formatRelativeTime(latestDetectedAt)
                : "No changes yet"}
          </p>
          <p className="mt-1 text-sm text-[#475569]">
            {latestDetectedAt
              ? new Date(latestDetectedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "Waiting for first verified or unverified diff."}
          </p>
        </article>

        <article className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#0f766e] uppercase">
            Confidence
          </p>
          <p className="mt-2 text-lg font-bold text-[#0f172a]">
            {isLoading ? "Loading..." : toConfidenceText(rows)}
          </p>
          <p className="mt-1 text-sm text-[#475569]">
            {isLoading
              ? "Fetching sample confidence scores..."
              : "Average confidence from currently loaded feed rows."}
          </p>
        </article>

        <article className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#0f766e] uppercase">
            Verification mix
          </p>
          <p className="mt-2 text-lg font-bold text-[#0f172a]">
            {isLoading ? "Loading..." : toVerificationRate(rows)}
          </p>
          <p className="mt-1 text-sm text-[#475569]">
            Verified and unverified rows remain explicitly separated.
          </p>
        </article>

        <div className="md:col-span-3">
          <Separator className="bg-[#0f172a]/10" />
          <div className="mt-4 grid gap-3 text-sm text-[#334155] md:grid-cols-3">
            <p className="inline-flex items-center gap-2">
              <Clock3 className="size-4 text-[#0f766e]" />
              Crawl statuses update from frequent short batch runs.
            </p>
            <p className="inline-flex items-center gap-2">
              <Waypoints className="size-4 text-[#0f766e]" />
              {totalCompetitors > 0
                ? `${totalCompetitors} competitor${totalCompetitors === 1 ? "" : "s"} monitored in this workspace.`
                : "No competitors added yet. Start by adding your first competitor."}
            </p>
            <p className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-[#0f766e]" />
              Filters in the feed keep verification state and severity explicit.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
