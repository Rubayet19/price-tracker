"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { ExternalLink, Pencil, RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  deleteCompetitor,
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
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<
    string | null
  >(null);
  const [candidates, setCandidates] = useState(
    competitor?.pricingUrlCandidates ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  useEffect(() => {
    if (!competitor) {
      return;
    }

    setCandidates(competitor.pricingUrlCandidates);
    setManualUrl(competitor.primaryPricingUrl ?? "");
    setSelectedCandidateUrl(
      competitor.pricingUrlCandidates.find(
        (candidate) => candidate.selectedByUser
      )?.url ?? null
    );
    setError(null);
    setShowDeleteConfirm(false);
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
        selectedCandidateUrl
          ? { candidateUrl: selectedCandidateUrl }
          : { url: manualUrl.trim() }
      );

      if (scheduleCrawl) {
        const crawlResponse = await runCompetitorCrawl(competitor.companyId);
        toast.success(
          crawlResponse.result.status === "ok"
            ? "Pricing source saved and crawl completed"
            : `Pricing source saved and crawl finished with status: ${crawlResponse.result.status.replaceAll("_", " ")}`
        );
      } else {
        toast.success("Pricing source updated");
      }

      await onUpdated();
      onOpenChange(false);
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to update pricing source";
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
        discoverError instanceof Error
          ? discoverError.message
          : "Failed to discover pricing URLs";
      setError(message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!competitor) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await deleteCompetitor(competitor.companyId);
      await onUpdated();
      window.dispatchEvent(new Event("competitor:deleted"));
      toast.success("Competitor deleted");
      onOpenChange(false);
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete competitor";
      setError(message);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!competitor) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-hidden p-0 sm:max-w-xl"
      >
        <SheetHeader className="shrink-0 pr-12">
          <SheetTitle>Manage pricing source</SheetTitle>
          <SheetDescription>
            Review the current source, refresh discovery, and confirm the URL
            you want Pricing Pulse to trust.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          <div className="space-y-5">
            <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[#0f172a]">
                    {competitor.name}
                  </p>
                  <p className="text-sm text-[#64748b]">{competitor.domain}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/dashboard/competitors/${competitor.companyId}`}
                      prefetch={false}
                    >
                      <Pencil className="size-3.5" />
                      Edit details
                    </Link>
                  </Button>
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
                <p className="mt-2 text-sm font-medium text-[#c2410c]">
                  No pricing source confirmed yet.
                </p>
              )}
              {competitor.trust.lastCrawlError ? (
                <p className="mt-3 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
                  {competitor.trust.lastCrawlError}
                </p>
              ) : null}
            </div>

            {competitor.latestSnapshot ? (
              <div className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
                <p className="text-sm font-semibold text-[#0f172a]">
                  Latest extracted context
                </p>
                {competitor.latestSnapshot.pageDescription ? (
                  <p className="mt-2 text-sm leading-6 text-[#475569]">
                    {competitor.latestSnapshot.pageDescription}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[#64748b]">
                    No page description captured on the latest snapshot.
                  </p>
                )}

                {competitor.latestSnapshot.extractionDebug ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {competitor.latestSnapshot.extractionDebug.scopeStrategy ? (
                      <Badge variant="outline" className="bg-[#f8fafc]">
                        Scope:{" "}
                        {competitor.latestSnapshot.extractionDebug.scopeStrategy.replaceAll(
                          "_",
                          " "
                        )}
                      </Badge>
                    ) : null}
                    {(
                      competitor.latestSnapshot.extractionDebug
                        .enrichmentSources ?? []
                    ).map((source) => (
                      <Badge
                        key={source}
                        variant="outline"
                        className="bg-[#f0fdfa] text-[#115e59]"
                      >
                        Enriched: {source}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {competitor.latestSnapshot.extractedPlans.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {competitor.latestSnapshot.extractedPlans.map((plan) => (
                      <div
                        key={`${plan.name}-${plan.monthlyPrice ?? "na"}-${plan.annualPrice ?? "na"}`}
                        className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-3"
                      >
                        <p className="font-medium text-[#0f172a]">
                          {plan.name}
                        </p>
                        {plan.description ? (
                          <p className="mt-1 text-sm leading-6 text-[#64748b]">
                            {plan.description}
                          </p>
                        ) : null}
                        {plan.trialDetails ? (
                          <p className="mt-1 text-sm font-medium text-[#0f766e]">
                            {plan.trialDetails}
                          </p>
                        ) : null}
                        {plan.features && plan.features.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {plan.features.slice(0, 4).map((feature) => (
                              <Badge
                                key={`${plan.name}-${feature}`}
                                variant="outline"
                                className="bg-white text-[#334155]"
                              >
                                {feature}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">
                  Discovery candidates
                </p>
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
                <RefreshCw
                  className={isDiscovering ? "size-4 animate-spin" : "size-4"}
                />
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
                        <p className="min-w-0 font-medium break-all text-[#0f172a]">
                          {candidate.url}
                        </p>
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
              <Label htmlFor="competitor-manual-pricing-url">
                Manual pricing URL
              </Label>
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
                Use manual entry when discovery is blocked or the exact pricing
                page is not in the candidate list.
              </p>
            </div>

            {error ? (
              <p className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
                {error}
              </p>
            ) : null}

            <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4">
              <p className="text-sm font-semibold text-[#991b1b]">
                Remove competitor
              </p>
              <p className="mt-1 text-sm text-[#7f1d1d]">
                This deletes the competitor and its stored snapshots, diffs, and
                insights.
              </p>
              {showDeleteConfirm ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-[#7f1d1d]">
                    Delete {competitor.name}? This cannot be undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => {
                        void handleDelete();
                      }}
                      disabled={isDeleting}
                    >
                      <Trash2 className="size-4" />
                      {isDeleting ? "Deleting..." : "Confirm delete"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                      }}
                      disabled={isDeleting}
                      className="bg-white"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    setShowDeleteConfirm(true);
                  }}
                  disabled={isDeleting}
                  className="mt-4"
                >
                  <Trash2 className="size-4" />
                  Delete competitor
                </Button>
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="shrink-0 border-t border-[#e2e8f0] bg-white">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void savePricingSource(false);
            }}
            disabled={isSaving || isDeleting}
          >
            {isSaving ? "Saving..." : "Save pricing source"}
          </Button>
          <Button
            type="button"
            onClick={() => {
              void savePricingSource(true);
            }}
            disabled={isSaving || isDeleting}
            className="bg-[#0f766e] text-white hover:bg-[#115e59]"
          >
            {isSaving ? "Saving..." : "Save and crawl now"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
