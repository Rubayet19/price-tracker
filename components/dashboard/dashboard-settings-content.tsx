"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CreditCard, LifeBuoy, RefreshCw, ShieldCheck } from "lucide-react";
import config from "@/config";
import {
  createBillingPortalSession,
  createCheckoutSession,
  loadDashboardOverview,
} from "@/components/dashboard/dashboard-api";
import type { DashboardOverviewResponse } from "@/types/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function DashboardSettingsContent() {
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeAction, setActiveAction] = useState<"portal" | "starter" | "pro" | null>(null);

  const loadSettings = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await loadDashboardOverview();
      setOverview(response);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load settings";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const currentTier = overview?.entitlements.planTier ?? null;
  const currentPriceId = overview?.billing.priceId ?? null;

  const currentPlanLabel = useMemo(() => {
    if (!overview) {
      return "Loading...";
    }

    if (overview.entitlements.accessSource === "trial") {
      return "Starter trial";
    }

    if (overview.entitlements.accessSource === "paid" && overview.entitlements.planTier) {
      return `${overview.entitlements.planTier[0].toUpperCase()}${overview.entitlements.planTier.slice(1)} plan`;
    }

    return "No active plan";
  }, [overview]);

  const handleManageBilling = async (): Promise<void> => {
    setActiveAction("portal");

    try {
      const url = await createBillingPortalSession(window.location.href);
      window.location.href = url;
    } catch (portalError) {
      const message = portalError instanceof Error ? portalError.message : "Failed to open billing portal";
      setError(message);
    } finally {
      setActiveAction(null);
    }
  };

  const handleCheckout = async (priceId: string, action: "starter" | "pro"): Promise<void> => {
    setActiveAction(action);
    setError(null);

    try {
      const url = await createCheckoutSession({
        priceId,
        mode: "subscription",
        successUrl: window.location.href,
        cancelUrl: window.location.href,
      });
      window.location.href = url;
    } catch (checkoutError) {
      const message = checkoutError instanceof Error ? checkoutError.message : "Failed to start checkout";
      setError(message);
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <section className="space-y-6 px-4 py-5 lg:px-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black tracking-tight text-[#0f172a]">Settings & Billing</h1>
        <p className="text-sm text-[#475569]">
          Manage plan access, billing actions, and the entitlement state used across the dashboard.
        </p>
      </header>

      {error ? (
        <div className="flex items-center justify-between rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3 text-[#92400e]">
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void loadSettings()}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardTitle className="text-xl font-black tracking-tight text-[#0f172a]">Current access</CardTitle>
            <CardDescription>The current plan, trial state, and billing account readiness.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Plan status</p>
              <p className="mt-2 text-xl font-black text-[#0f172a]">{isLoading ? "—" : currentPlanLabel}</p>
              <p className="mt-1 text-sm text-[#64748b]">
                {overview
                  ? `${overview.companyCounts.competitor}/${overview.entitlements.competitorLimit} competitor slots used`
                  : "Loading current plan usage..."}
              </p>
            </div>

            <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Trial end</p>
              <p className="mt-2 text-xl font-black text-[#0f172a]">
                {isLoading ? "—" : formatDate(overview?.trial.endsAt ?? null)}
              </p>
              <p className="mt-1 text-sm text-[#64748b]">
                {overview?.trial.status === "active"
                  ? "Trial access is currently active."
                  : "No active trial countdown."}
              </p>
            </div>

            <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Billing account</p>
              <p className="mt-2 text-xl font-black text-[#0f172a]">
                {isLoading ? "—" : overview?.billing.hasCustomerId ? "Ready" : "Not created"}
              </p>
              <p className="mt-1 text-sm text-[#64748b]">
                {overview?.billing.hasCustomerId
                  ? "Stripe billing portal is available for this account."
                  : "The billing portal becomes available after the first successful checkout."}
              </p>
            </div>

            <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">Digest eligibility</p>
              <p className="mt-2 text-xl font-black text-[#0f172a]">
                {isLoading ? "—" : overview?.entitlements.canReceiveWeeklyDigest ? "Enabled" : "Not included"}
              </p>
              <p className="mt-1 text-sm text-[#64748b]">
                Weekly digest remains a paid-only feature for the MVP.
              </p>
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={!overview?.billing.hasCustomerId || activeAction !== null}
                onClick={() => void handleManageBilling()}
                className="bg-white"
              >
                <CreditCard className="size-4" />
                {activeAction === "portal" ? "Opening..." : "Open billing portal"}
              </Button>
              <Button asChild variant="outline" className="bg-white">
                <a href={`mailto:${config.resend.supportEmail ?? "support@example.com"}`}>
                  <LifeBuoy className="size-4" />
                  Contact support
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#0f172a]/10 bg-white/95">
          <CardHeader>
            <CardTitle className="text-xl font-black tracking-tight text-[#0f172a]">Plans</CardTitle>
            <CardDescription>Upgrade or start a paid plan without leaving the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {config.stripe.plans.map((plan) => {
              const isCurrentPrice = currentPriceId === plan.priceId;
              const isCurrentTier = currentTier === plan.tier;
              const isTrialTier = overview?.entitlements.accessSource === "trial" && plan.tier === "starter";
              const action = plan.tier === "pro" ? "pro" : "starter";

              return (
                <article
                  key={plan.priceId}
                  className={`rounded-2xl border p-5 ${
                    plan.isFeatured
                      ? "border-[#0f766e]/30 bg-[#f0fdfa]"
                      : "border-[#e2e8f0] bg-[#f8fafc]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black text-[#0f172a]">{plan.name}</p>
                      <p className="mt-1 text-sm text-[#475569]">{plan.description}</p>
                    </div>
                    {isCurrentPrice || isTrialTier ? (
                      <Badge
                        variant="outline"
                        className="border-[#0f766e]/30 bg-white text-[#0f766e]"
                      >
                        {isTrialTier ? "Current trial" : "Current plan"}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-5">
                    <p className="text-3xl font-black text-[#0f172a]">${plan.price}</p>
                    <p className="mt-1 text-sm text-[#64748b]">per month</p>
                  </div>

                  <ul className="mt-5 space-y-2 text-sm text-[#334155]">
                    {plan.features.map((feature) => (
                      <li key={feature.name} className="inline-flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 size-4 text-[#0f766e]" />
                        <span>{feature.name}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    {isCurrentPrice ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={activeAction !== null || !overview?.billing.hasCustomerId}
                        onClick={() => void handleManageBilling()}
                        className="w-full bg-white"
                      >
                        {activeAction === "portal" ? "Opening..." : "Manage billing"}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="w-full bg-[#0f172a] text-white hover:bg-[#1e293b]"
                        disabled={activeAction !== null || (isCurrentTier && overview?.entitlements.accessSource === "paid")}
                        onClick={() => void handleCheckout(plan.priceId, action)}
                      >
                        {activeAction === action ? "Opening checkout..." : isCurrentTier ? "Current plan" : `Choose ${plan.name}`}
                        {!isCurrentTier ? <ArrowUpRight className="size-4" /> : null}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
