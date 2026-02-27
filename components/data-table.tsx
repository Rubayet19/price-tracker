import type { Dispatch, SetStateAction } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { DashboardFeedRow, FeedFilters } from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps {
  rows: DashboardFeedRow[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  filters: FeedFilters;
  onFiltersChange: Dispatch<SetStateAction<FeedFilters>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const countArrayLength = (value: unknown): number => {
  return Array.isArray(value) ? value.length : 0;
};

const summarizeDiff = (normalizedDiff: Record<string, unknown>): string => {
  const priceChangesRaw = normalizedDiff.priceChanges;
  const priceChanges = Array.isArray(priceChangesRaw) ? priceChangesRaw : [];

  let updateCount = 0;

  for (const change of priceChanges) {
    if (!isRecord(change)) {
      continue;
    }

    updateCount += countArrayLength(change.addedAmounts);
    updateCount += countArrayLength(change.removedAmounts);
    updateCount += countArrayLength(change.updatedAmounts);
  }

  if (updateCount > 0) {
    return `${updateCount} pricing deltas across ${priceChanges.length} bucket${
      priceChanges.length === 1 ? "" : "s"
    }`;
  }

  const hintChanges = isRecord(normalizedDiff.customPricingHintChanges)
    ? normalizedDiff.customPricingHintChanges
    : null;

  if (hintChanges) {
    const added = countArrayLength(hintChanges.added);
    const removed = countArrayLength(hintChanges.removed);
    const totalHintChanges = added + removed;

    if (totalHintChanges > 0) {
      return `${totalHintChanges} custom-pricing hint update${
        totalHintChanges === 1 ? "" : "s"
      }`;
    }
  }

  return "Pricing structure changed";
};

const formatRelativeTime = (value: string): string => {
  const date = new Date(value);
  const timestamp = date.getTime();

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

const toSeverityClass = (severity: DashboardFeedRow["severity"]): string => {
  if (severity === "high") {
    return "border-[#ef4444]/40 bg-[#fef2f2] text-[#b91c1c]";
  }

  if (severity === "medium") {
    return "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]";
  }

  return "border-[#0f766e]/30 bg-[#f0fdfa] text-[#115e59]";
};

const toVerificationClass = (state: DashboardFeedRow["verificationState"]): string => {
  if (state === "verified") {
    return "border-[#16a34a]/30 bg-[#f0fdf4] text-[#166534]";
  }

  return "border-[#64748b]/30 bg-[#f8fafc] text-[#475569]";
};

export function DataTable({
  rows,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  filters,
  onFiltersChange,
}: DataTableProps) {
  return (
    <section id="feed" className="px-4 lg:px-6">
      <div className="overflow-hidden rounded-2xl border border-[#0f172a]/10 bg-white/95 shadow-[0_18px_30px_-24px_rgba(2,6,23,0.55)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#0f172a]/10 px-4 py-3 lg:px-6">
          <div>
            <h2 className="text-lg font-black tracking-tight text-[#0f172a]">Verified changes feed</h2>
            <p className="text-sm text-[#475569]">Filter by severity and verification state.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={filters.severity}
              onValueChange={(value) =>
                onFiltersChange({ ...filters, severity: value as FeedFilters["severity"] })
              }
            >
              <SelectTrigger className="h-9 w-[160px] border-[#0f172a]/15 bg-[#f8fafc]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.verificationState}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  verificationState: value as FeedFilters["verificationState"],
                })
              }
            >
              <SelectTrigger className="h-9 w-[170px] border-[#0f172a]/15 bg-[#f8fafc]">
                <SelectValue placeholder="Verification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verification</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="border-[#0f172a]/10">
              <TableHead>Competitor</TableHead>
              <TableHead>Change summary</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Trust cues</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-[#475569]">
                  Loading change feed...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-[#475569]">
                  No changes found for current filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.diffId} className="border-[#0f172a]/10">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-[#0f172a]">{row.company.name}</span>
                      <span className="text-xs text-[#64748b]">{row.company.domain}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[420px] text-sm text-[#334155]">
                    {summarizeDiff(row.normalizedDiff)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={toSeverityClass(row.severity)}>
                      {row.severity.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={toVerificationClass(row.verificationState)}>
                      {row.verificationState}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-[#334155]">
                    <div className="flex flex-col gap-0.5">
                      <span>Detected {formatRelativeTime(row.detectedAt)}</span>
                      <span>
                        Crawl: {row.company.lastCrawlStatus.replace("_", " ")}
                        {typeof row.company.latestConfidence === "number"
                          ? ` • ${Math.round(row.company.latestConfidence * 100)}% confidence`
                          : ""}
                      </span>
                      <a
                        href={`https://${row.company.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#0f766e] hover:text-[#115e59]"
                      >
                        Open source page
                        <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

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
    </section>
  );
}
