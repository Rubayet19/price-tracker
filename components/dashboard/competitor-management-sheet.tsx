"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import {
  discoverCompetitorPricing,
  runCompetitorCrawl,
  updateCompetitorPrimaryPricing,
} from "@/components/dashboard/dashboard-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DashboardComparisonCompetitor } from "@/types/dashboard";

interface CompetitorManagementSheetProps {
  competitor: DashboardComparisonCompetitor | null;
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  onUpdated: () => Promise<void>;
}

const formatDate = (value: string | null): string => {
  if (!value) {
    return "Not checked yet";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function CompetitorManagementSheet({
  competitor,
  open,
  onOpenChange,
  onUpdated,
}: CompetitorManagementSheetProps) {
  const [manualUrl, setManualUrl] = useState<string>("");
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);
  const [candidates, setCandidates] = useState(
    competitor?.pricingUrlCandidates ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!competitor) {
      return;
    }

    setCandidates(competitor.pricingUrlCandidates);
    setManualUrl(competitor.primaryPricingUrl ?? "");
    setSelectedCandidateUrl(
      competitor.pricingUrlCandidates.find((candidate) => candidate.selectedByUser)?.url ?? null
    );
    setError(null);
  }, [competitor]);

  const hasHomepageUrl = Boolean(competitor?.homepageUrl);

  const currentSelection = useMemo(() => {
    return selectedCandidateUrl ?? manualUrl.trim() ?? "";
  }, [manualUrl, selectedCandidateUrl]);

  const savePricingSource = async (scheduleCrawl: boolean): Promise<void> => {
    if (!competitor) {
      return;
    }

    if (!currentSelection) {
      setError("Enter a pricing URL or pick one of the discovered candidates.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateCompetitorPrimaryPricing(
        competitor.companyId,
        selectedCandidateUrl ? { candidateUrl: selectedCandidateUrl } : { url: manualUrl.trim() }
      );

      if (scheduleCrawl) {
        await runCompetitorCrawl(competitor.companyId);
      }

      await onUpdated();
      toast.success(scheduleCrawl ? "Pricing source saved and crawl scheduled" : "Pricing source updated");
      onOpenChange(false);
    } catch (saveError) {
      const message =
        saveError instanceof Error ? saveError.message : "Failed to update pricing source";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscover = async (): Promise<void> => {
    if (!competitor) {
      return;
    }

    setIsDiscovering(true);
    setError(null);

    try {
      const response = await discoverCompetitorPricing(competitor.companyId);
      setCandidates(response.candidates);
      if (response.recommendedPrimaryUrl) {
        setManualUrl(response.recommendedPrimaryUrl);
        setSelectedCandidateUrl(response.recommendedPrimaryUrl);
      } else if (response.primaryPricingUrl) {
        setManualUrl(response.primaryPricingUrl);
      }
      await onUpdated();
      toast.success("Pricing discovery refreshed");
    } catch (discoverError) {
      const message =
        discoverError instanceof Error ? discoverError.message : "Failed to discover pricing URLs";
      setError(message);
    } finally {
      setIsDiscovering(false);
    }
  };

  if (!competitor) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Manage pricing source</SheetTitle>
          <SheetDescription>
            Review the current source, refresh discovery, and confirm the URL you want Price Tracker to trust.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-2">
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[#0f172a]">{competitor.name}</p>
                <p className="text-sm text-[#64748b]">{competitor.domain}</p>
              </div>
              <Badge
                variant="outline"
                className={
                  competitor.trust.lastCrawlStatus === "error" ||
                  competitor.trust.blockedOrManualNeeded
                    ? "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]"
                    : "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]"
                }
              >
                {competitor.trust.lastCrawlStatus.replaceAll("_", " ")}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-[#475569]">
              Last checked: {formatDate(competitor.trust.lastCrawlAt)}
            </p>
            {competitor.primaryPricingUrl ? (
              <a
                href={competitor.primaryPricingUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#0f766e] hover:underline"
              >
                Current pricing source
                <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <p className="mt-2 text-sm font-medium text-[#c2410c]">No pricing source confirmed yet.</p>
            )}
            {competitor.trust.lastCrawlError ? (
              <p className="mt-3 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
                {competitor.trust.lastCrawlError}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
            <div>
              <p className="text-sm font-semibold text-[#0f172a]">Discovery candidates</p>
              <p className="text-sm text-[#64748b]">
                {candidates.length > 0
                  ? `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} available`
                  : "No candidates loaded yet"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void handleDiscover();
              }}
              disabled={isDiscovering || !hasHomepageUrl}
              className="bg-white"
            >
              <RefreshCw className={isDiscovering ? "size-4 animate-spin" : "size-4"} />
              {isDiscovering ? "Refreshing..." : "Refresh discovery"}
            </Button>
          </div>

          {candidates.length > 0 ? (
            <div className="space-y-2">
              {candidates.map((candidate) => {
                const isSelected = currentSelection === candidate.url;

                return (
                  <button
                    key={candidate.url}
                    type="button"
                    onClick={() => {
                      setSelectedCandidateUrl(candidate.url);
                      setManualUrl(candidate.url);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-[#0f766e] bg-[#ecfeff]"
                        : "border-[#e2e8f0] bg-[#f8fafc] hover:border-[#0f766e]/35"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 break-all font-medium text-[#0f172a]">{candidate.url}</p>
                      <Badge
                        variant="outline"
                        className="border-[#cbd5e1] bg-white text-[#475569]"
                      >
                        {Math.round(candidate.confidence * 100)}%
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="competitor-manual-pricing-url">Manual pricing URL</Label>
            <Input
              id="competitor-manual-pricing-url"
              value={manualUrl}
              onChange={(event) => {
                setManualUrl(event.target.value);
                setSelectedCandidateUrl(null);
              }}
              placeholder="https://competitor.com/pricing"
              inputMode="url"
            />
            <p className="text-sm text-[#64748b]">
              Use manual entry when discovery is blocked or the exact pricing page is not in the candidate list.
            </p>
          </div>

          {error ? (
            <p className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter className="border-t border-[#e2e8f0]">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void savePricingSource(false);
            }}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save pricing source"}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void savePricingSource(true);
            }}
            disabled={isSaving}
            className="bg-[#0f766e] text-white hover:bg-[#115e59]"
          >
            {isSaving ? "Saving..." : "Save and crawl now"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
