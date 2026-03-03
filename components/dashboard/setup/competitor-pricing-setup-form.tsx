"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import {
  crawlCompanyNow,
  discoverPricingUrls,
  updatePrimaryPricingUrl,
} from "@/components/dashboard/setup/setup-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SetupCompetitor } from "@/types/setup";

interface CompetitorPricingSetupFormProps {
  competitor: SetupCompetitor;
}

const formatConfidence = (value: number | null): string => {
  if (typeof value !== "number") {
    return "No score yet";
  }

  return `${Math.round(value * 100)}% confidence`;
};

const formatDateTime = (value: string | null): string => {
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

export default function CompetitorPricingSetupForm({
  competitor,
}: CompetitorPricingSetupFormProps) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(competitor.pricingUrlCandidates);
  const [suggestedUrl, setSuggestedUrl] = useState<string | null>(competitor.primaryPricingUrl);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(
    competitor.primaryPricingUrl ??
      competitor.pricingUrlCandidates.find((candidate) => candidate.selectedByUser)?.url ??
      null
  );
  const [manualUrl, setManualUrl] = useState<string>("");
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const hasHomepageUrl = Boolean(competitor.homepageUrl);
  const activeSelection = selectedCandidateUrl || manualUrl.trim() || null;

  const discoverySummary = useMemo(() => {
    if (candidates.length === 0) {
      return "No pricing candidates found yet.";
    }

    return `${candidates.length} candidate${candidates.length === 1 ? "" : "s"} available`;
  }, [candidates.length]);

  const onDiscover = async (): Promise<void> => {
    setIsDiscovering(true);
    setError(null);

    try {
      const response = await discoverPricingUrls(competitor.companyId);
      setCandidates(response.candidates);
      setSuggestedUrl(response.primaryPricingUrl ?? response.recommendedPrimaryUrl ?? null);
      setSelectedCandidateUrl(
        response.primaryPricingUrl ??
          response.recommendedPrimaryUrl ??
          response.candidates.find((candidate) => candidate.selectedByUser)?.url ??
          null
      );
      toast.success("Pricing discovery refreshed");
    } catch (discoverError) {
      const message =
        discoverError instanceof Error ? discoverError.message : "Failed to discover pricing URLs";
      setError(message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const onSubmit = async (): Promise<void> => {
    if (!activeSelection) {
      setError("Choose a discovered candidate or enter a manual pricing URL.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updatePrimaryPricingUrl(
        competitor.companyId,
        selectedCandidateUrl ? { candidateUrl: selectedCandidateUrl } : { url: manualUrl.trim() }
      );
      const crawlResponse = await crawlCompanyNow(competitor.companyId);

      if (crawlResponse.result.status === "ok") {
        toast.success("Pricing URL confirmed and first crawl completed");
      } else {
        toast.error(
          crawlResponse.result.reason
            ? `First crawl finished with status: ${crawlResponse.result.reason}`
            : "First crawl did not complete successfully"
        );
      }

      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to save the pricing URL";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-[#0f172a]/10 bg-white/95">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl font-black tracking-tight text-[#0f172a]">
              Confirm the primary pricing page
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
              Discovery is conservative by design. Confirm the exact URL you want monitored before
              Price Tracker runs the first crawl and starts trusting changes from this competitor.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
            {competitor.domain}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Crawl status</p>
            <p className="mt-2 text-sm capitalize text-[#475569]">
              {competitor.lastCrawlStatus.replaceAll("_", " ")}
            </p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Last checked</p>
            <p className="mt-2 text-sm text-[#475569]">{formatDateTime(competitor.lastCrawlAt)}</p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Confidence</p>
            <p className="mt-2 text-sm text-[#475569]">{formatConfidence(competitor.latestConfidence)}</p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4 md:col-span-3">
            <p className="text-sm font-semibold text-[#0f172a]">Monitoring cadence</p>
            <p className="mt-2 text-sm text-[#475569]">
              Daily. This is fixed in the MVP once you confirm the pricing source below.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
          <div>
            <p className="text-sm font-semibold text-[#0f172a]">Discovery status</p>
            <p className="mt-1 text-sm text-[#475569]">{discoverySummary}</p>
            {suggestedUrl ? (
              <p className="mt-2 text-sm text-[#64748b]">Suggested: {suggestedUrl}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void onDiscover();
            }}
            disabled={isDiscovering || !hasHomepageUrl}
            className="bg-white"
          >
            <RefreshCw className={isDiscovering ? "size-4 animate-spin" : "size-4"} />
            {isDiscovering ? "Refreshing..." : "Refresh discovery"}
          </Button>
        </div>

        {candidates.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#0f172a]">Step 1: choose one pricing source</p>
              <p className="text-sm text-[#64748b]">
                Click a candidate below to select it, or paste a manual URL instead.
              </p>
            </div>
            <div role="radiogroup" aria-label="Discovered pricing URL candidates" className="space-y-3">
              {candidates.map((candidate) => {
                const isSelected = selectedCandidateUrl === candidate.url;
                const isSuggested = suggestedUrl === candidate.url;

                return (
                  <button
                    key={candidate.url}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => {
                      setSelectedCandidateUrl(candidate.url);
                      setManualUrl("");
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-[#0f766e] bg-[#ecfeff] shadow-sm"
                        : "border-[#e2e8f0] bg-[#f8fafc] hover:border-[#0f766e]/35"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 text-[#0f766e]">
                          {isSelected ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[#0f172a]">{candidate.url}</p>
                          <p className="mt-2 text-sm text-[#64748b]">
                            {Math.round(candidate.confidence * 100)}% discovery confidence
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isSelected ? (
                          <Badge
                            variant="outline"
                            className="border-[#0f766e]/25 bg-[#ccfbf1] text-[#115e59]"
                          >
                            Selected
                          </Badge>
                        ) : null}
                        {candidate.selectedByUser ? (
                          <Badge
                            variant="outline"
                            className="border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]"
                          >
                            Confirmed before
                          </Badge>
                        ) : null}
                        {isSuggested ? (
                          <Badge
                            variant="outline"
                            className="border-[#0f766e]/25 bg-[#ccfbf1] text-[#115e59]"
                          >
                            Suggested
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="manual-pricing-url">Step 2: or paste a manual pricing URL</Label>
          <Input
            id="manual-pricing-url"
            value={manualUrl}
            onChange={(event) => {
              setManualUrl(event.target.value);
              setSelectedCandidateUrl(null);
            }}
            placeholder="https://competitor.com/pricing"
            inputMode="url"
          />
          <p className="text-sm text-[#64748b]">
            Use this when the discovered candidates miss the exact pricing page you want.
          </p>
        </div>

        {competitor.lastCrawlError ? (
          <p className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
            Latest crawl note: {competitor.lastCrawlError}
          </p>
        ) : null}

        {!hasHomepageUrl ? (
          <p className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]">
            This competitor does not have a homepage URL saved yet, so discovery is disabled. Enter
            the pricing URL manually for now.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              void onSubmit();
            }}
            disabled={isSubmitting || !activeSelection}
            className="bg-[#0f766e] text-white hover:bg-[#115e59]"
          >
            {isSubmitting ? "Confirming and crawling..." : "Confirm URL and run first crawl"}
          </Button>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-sm text-[#92400e]"
          >
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
