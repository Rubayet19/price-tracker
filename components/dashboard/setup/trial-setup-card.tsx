"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { startTrial } from "@/components/dashboard/setup/setup-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SetupStatus } from "@/types/setup";

interface TrialSetupCardProps {
  status: SetupStatus;
}

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

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

export default function TrialSetupCard({ status }: TrialSetupCardProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onStartTrial = async (): Promise<void> => {
    setIsSubmitting(true);
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

      toast.success("Trial started");
      router.push("/dashboard/setup");
      router.refresh();
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
              Start access explicitly
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
              Start your free trial to begin tracking competitors. No credit card required —
              you get Starter-tier access for seven days.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="border-[#0f766e]/25 bg-[#ccfbf1] text-[#115e59]"
          >
            7-day trial
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Competitor cap</p>
            <p className="mt-2 text-sm text-[#475569]">{status.entitlements.trialDays} days, up to 3 competitors</p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Current trial status</p>
            <p className="mt-2 text-sm capitalize text-[#475569]">
              {status.trial.status.replaceAll("_", " ")}
            </p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Trial ends</p>
            <p className="mt-2 text-sm text-[#475569]">{formatDate(status.trial.endsAt)}</p>
          </div>
        </div>

        {status.trial.canStartTrial ? (
          <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-5">
            <p className="text-sm leading-6 text-[#475569]">
              Starting the trial unlocks competitor setup and monitoring immediately. You can upgrade
              later without losing any configured competitors.
            </p>
            <div className="mt-4">
              <Button
                type="button"
                onClick={() => {
                  void onStartTrial();
                }}
                disabled={isSubmitting}
                className="bg-[#0f766e] text-white hover:bg-[#115e59]"
              >
                {isSubmitting ? "Starting..." : "Start trial"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#f59e0b]/30 bg-[#fffbeb] p-5">
            <p className="text-sm leading-6 text-[#92400e]">
              This account cannot start a new trial. Continue with a paid plan to finish setup and
              start tracking competitors.
            </p>
            <div className="mt-4">
              <Button asChild className="bg-[#0f172a] text-white hover:bg-[#1e293b]">
                <Link href="/#pricing">View plans</Link>
              </Button>
            </div>
          </div>
        )}

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
