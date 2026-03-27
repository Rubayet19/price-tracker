import type { ReactNode } from "react";
import Link from "next/link";
import { CircleAlert, ShieldCheck } from "lucide-react";
import SetupProgress from "@/components/dashboard/setup/setup-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SetupStatus, SetupStep } from "@/types/setup";

interface SetupFrameProps {
  title: string;
  description: string;
  currentStep: SetupStep;
  status: SetupStatus;
  children: ReactNode;
}

const formatDate = (value: string | null): string => {
  if (!value) {
    return "Not started";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function SetupFrame({
  title,
  description,
  currentStep,
  status,
  children,
}: SetupFrameProps) {
  return (
    <section className="space-y-6 px-4 py-5 lg:px-6">
      <div className="space-y-2">
        <Badge
          variant="outline"
          className="border-[#0f766e]/25 bg-[#ccfbf1] text-[#115e59]"
        >
          Setup
        </Badge>
        <h1 className="text-4xl font-black tracking-tight text-[#0f172a]">
          {title}
        </h1>
        <p className="max-w-3xl text-base leading-7 text-[#475569]">
          {description}
        </p>
      </div>

      <SetupProgress currentStep={currentStep} status={status} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{children}</div>

        <aside className="space-y-4">
          <Card className="border-[#0f172a]/10 bg-white/95">
            <CardHeader>
              <CardTitle className="text-lg font-black tracking-tight text-[#0f172a]">
                Access summary
              </CardTitle>
              <CardDescription>
                Setup is gated by explicit trial or paid access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-[#475569]">
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <p className="font-semibold text-[#0f172a]">Current access</p>
                <p className="mt-1 capitalize">
                  {status.entitlements.accessState.replaceAll("_", " ")}
                </p>
              </div>
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <p className="font-semibold text-[#0f172a]">Competitor limit</p>
                <p className="mt-1">
                  {status.competitorCount} of{" "}
                  {status.entitlements.competitorLimit} competitors configured
                </p>
              </div>
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <p className="font-semibold text-[#0f172a]">Trial window</p>
                <p className="mt-1">
                  {status.trial.isActive
                    ? `Ends ${formatDate(status.trial.endsAt)}`
                    : `Status: ${status.trial.status.replaceAll("_", " ")}`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#0f172a]/10 bg-white/95">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-lg font-black tracking-tight text-[#0f172a]">
                <ShieldCheck className="size-4 text-[#0f766e]" />
                Trust cues stay visible
              </CardTitle>
              <CardDescription>
                Pricing Pulse keeps verification state, confidence, and crawl
                health attached to every competitor.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-[#475569]">
              <p>
                Manual confirmation is required when discovery is ambiguous or a
                site is blocked.
              </p>
              <p>This keeps your dashboard accurate and low-noise by design.</p>
            </CardContent>
          </Card>

          {!status.trial.canStartTrial && !status.entitlements.hasAccess ? (
            <Card className="border-[#f59e0b]/25 bg-[#fffbeb]">
              <CardHeader>
                <CardTitle className="inline-flex items-center gap-2 text-lg font-black tracking-tight text-[#92400e]">
                  <CircleAlert className="size-4" />
                  Access required
                </CardTitle>
                <CardDescription className="text-[#a16207]">
                  Trial access is no longer available on this account.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  asChild
                  className="w-full bg-[#0f172a] text-white hover:bg-[#1e293b]"
                >
                  <Link href="/#pricing">View plans</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
