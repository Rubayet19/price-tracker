"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import config from "@/config";
import { createCheckoutSession } from "@/components/dashboard/dashboard-api";
import { startTrial } from "@/components/dashboard/setup/setup-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SetupStatus } from "@/types/setup";

interface PlansSetupCardProps {
  status: SetupStatus;
}

const toBlockedReason = (reason: string): string => {
  switch (reason) {
    case "already_active":
      return "This account already has an active trial.";
    case "already_expired":
      return "This account already used its one-time trial.";
    case "already_converted":
      return "This account already converted to paid access.";
    case "paid_user":
      return "This account already has paid access.";
    default:
      return "Trial access is not available for this account.";
  }
};

export default function PlansSetupCard({ status }: PlansSetupCardProps) {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<
    "trial" | "starter" | "pro" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async (
    priceId: string,
    action: "starter" | "pro"
  ): Promise<void> => {
    setActiveAction(action);
    setError(null);

    try {
      const url = await createCheckoutSession({
        priceId,
        mode: "subscription",
        successUrl: `${window.location.origin}/dashboard`,
        cancelUrl: window.location.href,
      });
      window.location.href = url;
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error
          ? checkoutError.message
          : "Failed to start checkout";
      setError(message);
    } finally {
      setActiveAction(null);
    }
  };

  const handleStartTrial = async (): Promise<void> => {
    setActiveAction("trial");
    setError(null);

    try {
      const response = await startTrial();

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.status === 409 && response.data) {
        setError(toBlockedReason(response.data.trial.reason));
        return;
      }

      toast.success("Trial started — welcome to Pricing Pulse!");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setActiveAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-[#0f172a]/10 bg-white/95">
        <CardHeader>
          <CardTitle className="text-2xl font-black tracking-tight text-[#0f172a]">
            Choose your plan
          </CardTitle>
          <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
            Pick the plan that fits your monitoring needs. You can change plans
            anytime from Settings.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {config.stripe.plans.map((plan) => {
              const action =
                plan.tier === "pro" ? ("pro" as const) : ("starter" as const);

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
                      <p className="text-lg font-black text-[#0f172a]">
                        {plan.name}
                      </p>
                      <p className="mt-1 text-sm text-[#475569]">
                        {plan.description}
                      </p>
                    </div>
                    {plan.isFeatured ? (
                      <Badge
                        variant="outline"
                        className="border-[#0f766e]/30 bg-[#ccfbf1] text-[#115e59]"
                      >
                        Recommended
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-5">
                    <p className="text-3xl font-black text-[#0f172a]">
                      ${plan.price}
                    </p>
                    <p className="mt-1 text-sm text-[#64748b]">per month</p>
                  </div>

                  <ul className="mt-5 space-y-2 text-sm text-[#334155]">
                    {plan.features.map((feature) => (
                      <li
                        key={feature.name}
                        className="inline-flex items-start gap-2"
                      >
                        <ShieldCheck className="mt-0.5 size-4 text-[#0f766e]" />
                        <span>{feature.name}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <Button
                      type="button"
                      className={`w-full ${
                        plan.isFeatured
                          ? "bg-[#0f766e] text-white hover:bg-[#115e59]"
                          : "bg-[#0f172a] text-white hover:bg-[#1e293b]"
                      }`}
                      disabled={activeAction !== null}
                      onClick={() => void handleCheckout(plan.priceId, action)}
                    >
                      {activeAction === action
                        ? "Opening checkout..."
                        : `Choose ${plan.name}`}
                      <ArrowUpRight className="size-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          {status.trial.canStartTrial ? (
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-[#cbd5e1] bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-[#0f172a]">
                  Not ready to commit?
                </p>
                <p className="mt-1 text-sm text-[#64748b]">
                  Start a free {status.entitlements.trialDays}-day trial with
                  Starter limits. No credit card required.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 bg-white"
                disabled={activeAction !== null}
                onClick={() => void handleStartTrial()}
              >
                {activeAction === "trial" ? "Starting..." : "Start free trial"}
              </Button>
            </div>
          ) : null}

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
    </div>
  );
}
