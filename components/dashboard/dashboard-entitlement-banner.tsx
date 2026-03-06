"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Lock } from "lucide-react";
import { getDashboardAccessNotice } from "@/libs/dashboard-entitlement-state";
import type { DashboardOverviewResponse } from "@/types/dashboard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DashboardEntitlementBannerProps {
  overview: DashboardOverviewResponse | null;
  className?: string;
}

export default function DashboardEntitlementBanner({
  overview,
  className,
}: DashboardEntitlementBannerProps) {
  const notice = getDashboardAccessNotice(overview);

  if (!notice) {
    return null;
  }

  const isWarning = notice.kind === "inactive" || notice.kind === "upgrade";

  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-2xl border px-4 py-4 shadow-[0_18px_35px_-28px_rgba(2,6,23,0.35)] md:flex-row md:items-center md:justify-between",
        isWarning
          ? "border-[#f59e0b]/35 bg-[#fffbeb]"
          : "border-[#0f172a]/10 bg-white/95",
        className
      )}
    >
      <div className="space-y-1">
        <p
          className={cn(
            "inline-flex items-center gap-2 text-sm font-semibold",
            isWarning ? "text-[#b45309]" : "text-[#0f172a]"
          )}
        >
          {notice.kind === "limit" ? (
            <Lock className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          {notice.title}
        </p>
        <p className="text-sm text-[#475569]">{notice.description}</p>
      </div>

      <Button
        asChild
        variant={notice.kind === "limit" ? "outline" : "default"}
        className={cn(
          "shrink-0",
          notice.kind === "limit"
            ? "border-[#0f172a]/15 bg-white text-[#0f172a] hover:bg-[#f8fafc]"
            : "bg-[#0f172a] text-white hover:bg-[#1e293b]"
        )}
      >
        <Link href={notice.ctaHref}>
          {notice.ctaLabel}
          <ArrowUpRight className="size-4" />
        </Link>
      </Button>
    </section>
  );
}
