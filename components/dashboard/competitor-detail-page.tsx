"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  deleteCompetitor,
  discoverCompetitorPricing,
  loadDashboardComparison,
  runCompetitorCrawl,
  updateCompetitorDetails,
  updateCompetitorPrimaryPricing,
} from "@/components/dashboard/dashboard-api";
import type { DashboardComparisonCompetitor } from "@/types/dashboard";
import type { PricingUrlCandidate } from "@/types/companies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CompetitorDetailPageProps {
  companyId: string;
}

const formatDate = (value: string | null): string => {
  if (!value) return "Not checked yet";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const deriveDomain = (homepageUrl: string): string | null => {
  try {
    const url = new URL(homepageUrl.includes("://") ? homepageUrl : `https://${homepageUrl}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

export default function CompetitorDetailPage({ companyId }: CompetitorDetailPageProps) {
  const router = useRouter();

  const [competitor, setCompetitor] = useState<DashboardComparisonCompetitor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Company details form
  const [editName, setEditName] = useState("");
  const [editHomepageUrl, setEditHomepageUrl] = useState("");
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Pricing source form
  const [candidates, setCandidates] = useState<PricingUrlCandidate[]>([]);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadCompetitor = useCallback(async () => {
    try {
      const data = await loadDashboardComparison();
      const match = data.competitors.find((c) => c.companyId === companyId);
      if (!match) {
        setLoadError("Competitor not found");
        return;
      }
      setCompetitor(match);
      setEditName(match.name);
      setEditHomepageUrl(match.homepageUrl ?? "");
      setCandidates(match.pricingUrlCandidates);
      setManualUrl(match.primaryPricingUrl ?? "");
      setSelectedCandidateUrl(
        match.pricingUrlCandidates.find((c) => c.selectedByUser)?.url ?? null
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load competitor");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadCompetitor();
  }, [loadCompetitor]);

  const derivedDomain = useMemo(() => deriveDomain(editHomepageUrl), [editHomepageUrl]);
  const domainWillChange = competitor ? derivedDomain !== null && derivedDomain !== competitor.domain : false;

  const hasDetailsChanges =
    competitor !== null &&
    (editName.trim() !== competitor.name ||
      editHomepageUrl.trim() !== (competitor.homepageUrl ?? ""));

  const currentPricingSelection = selectedCandidateUrl ?? manualUrl.trim() ?? "";

  const onSaveDetails = async () => {
    if (!competitor) return;
    setIsSavingDetails(true);
    setDetailsError(null);

    try {
      const payload: { name?: string; homepageUrl?: string } = {};
      if (editName.trim() !== competitor.name) payload.name = editName.trim();
      if (editHomepageUrl.trim() !== (competitor.homepageUrl ?? "")) payload.homepageUrl = editHomepageUrl.trim();

      const result = await updateCompetitorDetails(companyId, payload);
      toast.success(result.domainChanged ? "Details saved — domain changed, pricing source reset" : "Details saved");
      window.dispatchEvent(new Event("competitor:added"));
      await loadCompetitor();
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Failed to save details");
    } finally {
      setIsSavingDetails(false);
    }
  };

  const onDiscover = async () => {
    if (!competitor) return;
    setIsDiscovering(true);
    setPricingError(null);

    try {
      const response = await discoverCompetitorPricing(companyId);
      setCandidates(response.candidates);
      if (response.recommendedPrimaryUrl) {
        setManualUrl(response.recommendedPrimaryUrl);
        setSelectedCandidateUrl(response.recommendedPrimaryUrl);
      } else if (response.primaryPricingUrl) {
        setManualUrl(response.primaryPricingUrl);
      }
      toast.success("Pricing discovery refreshed");
    } catch (error) {
      setPricingError(error instanceof Error ? error.message : "Failed to discover pricing URLs");
    } finally {
      setIsDiscovering(false);
    }
  };

  const onSavePricing = async (scheduleCrawl: boolean) => {
    if (!competitor || !currentPricingSelection) {
      setPricingError("Enter a pricing URL or pick a discovered candidate.");
      return;
    }
    setIsSavingPricing(true);
    setPricingError(null);

    try {
      await updateCompetitorPrimaryPricing(
        companyId,
        selectedCandidateUrl ? { candidateUrl: selectedCandidateUrl } : { url: manualUrl.trim() }
      );

      if (scheduleCrawl) {
        const crawlResponse = await runCompetitorCrawl(companyId);
        toast.success(
          crawlResponse.result.status === "ok"
            ? "Pricing source saved and crawl completed"
            : `Pricing source saved — crawl finished with status: ${crawlResponse.result.status.replaceAll("_", " ")}`
        );
        window.dispatchEvent(new Event("competitor:added"));
        router.push("/dashboard");
        router.refresh();
        return;
      } else {
        toast.success("Pricing source updated");
      }

      window.dispatchEvent(new Event("competitor:added"));
      await loadCompetitor();
    } catch (error) {
      setPricingError(error instanceof Error ? error.message : "Failed to save pricing source");
    } finally {
      setIsSavingPricing(false);
    }
  };

  const onDelete = async () => {
    if (!competitor) return;
    setIsDeleting(true);

    try {
      await deleteCompetitor(companyId);
      window.dispatchEvent(new Event("competitor:deleted"));
      toast.success("Competitor deleted");
      router.push("/dashboard/competitors");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete competitor");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-[#e2e8f0]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[#f1f5f9]" />
      </div>
    );
  }

  if (loadError || !competitor) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/competitors">
            <ArrowLeft className="size-4" />
            Back to competitors
          </Link>
        </Button>
        <Card className="border-[#fecaca] bg-[#fef2f2]">
          <CardContent className="py-8 text-center text-sm text-[#991b1b]">
            {loadError ?? "Competitor not found"}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/competitors">
            <ArrowLeft className="size-4" />
            Back to competitors
          </Link>
        </Button>
      </div>

      {/* Section A: Company Details */}
      <Card className="border-[#0f172a]/10 bg-white/95">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xl font-bold tracking-tight text-[#0f172a]">
                Competitor details
              </CardTitle>
              <CardDescription className="mt-1 text-sm text-[#475569]">
                Edit the competitor name and homepage. Domain is derived from the homepage URL.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
              {competitor.domain}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="detail-name">Name</Label>
            <Input
              id="detail-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Competitor name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="detail-homepage">Homepage URL</Label>
            <Input
              id="detail-homepage"
              value={editHomepageUrl}
              onChange={(e) => setEditHomepageUrl(e.target.value)}
              placeholder="https://example.com"
              inputMode="url"
            />
            {derivedDomain && (
              <p className="text-sm text-[#64748b]">
                Domain: <span className="font-medium">{derivedDomain}</span>
              </p>
            )}
          </div>

          {domainWillChange && (
            <div className="flex items-start gap-3 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#d97706]" />
              <p className="text-sm text-[#92400e]">
                Changing the domain will reset the pricing source and require a new crawl.
                Existing snapshots and diffs will remain but new data will come from the updated domain.
              </p>
            </div>
          )}

          {detailsError && (
            <p className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
              {detailsError}
            </p>
          )}

          <Button
            onClick={() => { void onSaveDetails(); }}
            disabled={isSavingDetails || !hasDetailsChanges || !editName.trim()}
            className="bg-[#0f172a] text-white hover:bg-[#1e293b]"
          >
            {isSavingDetails ? "Saving..." : "Save changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Section B: Pricing Source */}
      <Card className="border-[#0f172a]/10 bg-white/95">
        <CardHeader>
          <CardTitle className="text-xl font-bold tracking-tight text-[#0f172a]">
            Pricing source
          </CardTitle>
          <CardDescription className="mt-1 text-sm text-[#475569]">
            Confirm the exact pricing page to monitor. Price Tracker will check this URL daily.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Current source */}
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">Current source</p>
                {competitor.primaryPricingUrl ? (
                  <a
                    href={competitor.primaryPricingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-[#0f766e] hover:underline"
                  >
                    {competitor.primaryPricingUrl}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-[#c2410c]">No pricing source confirmed yet.</p>
                )}
              </div>
              <Badge
                variant="outline"
                className={
                  competitor.trust.lastCrawlStatus === "error" || competitor.trust.blockedOrManualNeeded
                    ? "border-[#ea580c]/35 bg-[#fff7ed] text-[#c2410c]"
                    : "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]"
                }
              >
                {competitor.trust.lastCrawlStatus.replaceAll("_", " ")}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-[#475569]">
              Last checked: {formatDate(competitor.trust.lastCrawlAt)}
            </p>
            {competitor.trust.lastCrawlError && (
              <p className="mt-2 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-3 py-2 text-sm text-[#92400e]">
                {competitor.trust.lastCrawlError}
              </p>
            )}
          </div>

          {/* Discovery */}
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
              onClick={() => { void onDiscover(); }}
              disabled={isDiscovering || !competitor.homepageUrl}
              className="bg-white"
            >
              <RefreshCw className={isDiscovering ? "size-4 animate-spin" : "size-4"} />
              {isDiscovering ? "Refreshing..." : "Refresh discovery"}
            </Button>
          </div>

          {/* Candidate list */}
          {candidates.length > 0 && (
            <div role="radiogroup" aria-label="Discovered pricing URL candidates" className="space-y-2">
              {candidates.map((candidate) => {
                const isSelected = currentPricingSelection === candidate.url;

                return (
                  <button
                    key={candidate.url}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setSelectedCandidateUrl(candidate.url);
                      setManualUrl(candidate.url);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-[#0f766e] bg-[#ecfeff] shadow-sm"
                        : "border-[#e2e8f0] bg-[#f8fafc] hover:border-[#0f766e]/35"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 text-[#0f766e]">
                          {isSelected ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                        </span>
                        <p className="min-w-0 break-all font-medium text-[#0f172a]">{candidate.url}</p>
                      </div>
                      <Badge variant="outline" className="border-[#cbd5e1] bg-white text-[#475569]">
                        {Math.round(candidate.confidence * 100)}%
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Manual URL */}
          <div className="space-y-2">
            <Label htmlFor="detail-manual-pricing-url">Manual pricing URL</Label>
            <Input
              id="detail-manual-pricing-url"
              value={manualUrl}
              onChange={(e) => {
                setManualUrl(e.target.value);
                setSelectedCandidateUrl(null);
              }}
              placeholder="https://competitor.com/pricing"
              inputMode="url"
            />
            <p className="text-sm text-[#64748b]">
              Use manual entry when discovery is blocked or the exact pricing page is not in the candidate list.
            </p>
          </div>

          {pricingError && (
            <p className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
              {pricingError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => { void onSavePricing(false); }}
              disabled={isSavingPricing || !currentPricingSelection}
            >
              {isSavingPricing ? "Saving..." : "Save pricing source"}
            </Button>
            <Button
              type="button"
              onClick={() => { void onSavePricing(true); }}
              disabled={isSavingPricing || !currentPricingSelection}
              className="bg-[#0f766e] text-white hover:bg-[#115e59]"
            >
              {isSavingPricing ? "Saving..." : "Save and crawl now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section C: Danger Zone */}
      <Card className="border-[#fecaca] bg-white/95">
        <CardHeader>
          <CardTitle className="text-lg font-bold text-[#991b1b]">Danger zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[#7f1d1d]">
            Deleting this competitor removes all stored snapshots, diffs, and insights permanently.
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
                  onClick={() => { void onDelete(); }}
                  disabled={isDeleting}
                >
                  <Trash2 className="size-4" />
                  {isDeleting ? "Deleting..." : "Confirm delete"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
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
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-4"
            >
              <Trash2 className="size-4" />
              Delete competitor
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
