"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Lock, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { loadDashboardOverview } from "@/components/dashboard/dashboard-api";
import { createCompany } from "@/components/dashboard/setup/setup-api";
import {
  canAddCompetitorFromOverview,
  getDashboardAccessNotice,
} from "@/libs/dashboard-entitlement-state";
import type { DashboardOverviewResponse } from "@/types/dashboard";
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
  SheetTrigger,
} from "@/components/ui/sheet";

interface AddCompetitorForm {
  name: string;
  homepageUrl: string;
}

const INITIAL_FORM: AddCompetitorForm = {
  name: "",
  homepageUrl: "",
};

export default function AddCompetitorSheet() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [form, setForm] = useState<AddCompetitorForm>(INITIAL_FORM);
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(
    null
  );
  const [isLoadingOverview, setIsLoadingOverview] = useState<boolean>(true);

  const loadOverview = useCallback(async (): Promise<void> => {
    try {
      const response = await loadDashboardOverview();
      setOverview(response);
    } catch {
      setOverview(null);
    } finally {
      setIsLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    const onCompetitorAdded = (): void => {
      void loadOverview();
    };

    window.addEventListener("competitor:added", onCompetitorAdded);
    window.addEventListener("competitor:deleted", onCompetitorAdded);

    return () => {
      window.removeEventListener("competitor:added", onCompetitorAdded);
      window.removeEventListener("competitor:deleted", onCompetitorAdded);
    };
  }, [loadOverview]);

  const accessNotice = useMemo(
    () => getDashboardAccessNotice(overview),
    [overview]
  );
  const canAddCompetitor = canAddCompetitorFromOverview(overview);

  const onSubmit = async (): Promise<void> => {
    if (!canAddCompetitor) {
      setIsOpen(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const company = await createCompany({
        name: form.name.trim(),
        type: "competitor",
        homepageUrl: form.homepageUrl.trim(),
      });

      toast.success("Competitor added");
      setForm(INITIAL_FORM);
      setIsOpen(false);
      window.dispatchEvent(new Event("competitor:added"));
      router.push(`/dashboard/competitors/${company.id}`);
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add competitor";
      toast.error(message);
      await loadOverview();
    } finally {
      setIsSubmitting(false);
    }
  };

  const buttonLabel = (() => {
    if (isLoadingOverview) {
      return "Add Competitor";
    }

    if (!accessNotice) {
      return "Add Competitor";
    }

    return "Competitor Limit Reached";
  })();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button className="bg-[#0f172a] text-white hover:bg-[#1e293b]">
          {accessNotice ? (
            <Lock className="size-4" />
          ) : (
            <Plus className="size-4" />
          )}
          {buttonLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {accessNotice ? (
          <>
            <SheetHeader>
              <SheetTitle>{accessNotice.title}</SheetTitle>
              <SheetDescription>{accessNotice.description}</SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4">
              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4">
                <p className="text-xs font-semibold tracking-[0.2em] text-[#64748b] uppercase">
                  Current workspace
                </p>
                <p className="mt-3 text-sm text-[#475569]">
                  {overview
                    ? `${overview.companyCounts.competitor} of ${overview.entitlements.competitorLimit} competitor slots in use`
                    : "Refresh the dashboard state to confirm plan limits."}
                </p>
                {overview?.trial.endsAt ? (
                  <p className="mt-2 text-sm text-[#475569]">
                    Trial end:{" "}
                    {new Date(overview.trial.endsAt).toLocaleDateString(
                      "en-US"
                    )}
                  </p>
                ) : null}
              </div>
            </div>

            <SheetFooter className="mt-4 border-t border-[#e2e8f0]">
              <Button asChild variant="outline">
                <Link href="/dashboard/competitors">Review competitors</Link>
              </Button>
              <Button
                asChild
                className="bg-[#0f172a] text-white hover:bg-[#1e293b]"
              >
                <Link href={accessNotice.ctaHref}>
                  {accessNotice.ctaLabel}
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Add competitor</SheetTitle>
              <SheetDescription>
                Add a competitor homepage to discover the pricing page and start
                daily monitoring.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4 px-4">
              <div className="space-y-2">
                <Label htmlFor="competitor-name">Name</Label>
                <Input
                  id="competitor-name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Competitor name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="competitor-homepage">Homepage URL</Label>
                <Input
                  id="competitor-homepage"
                  value={form.homepageUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      homepageUrl: event.target.value,
                    }))
                  }
                  placeholder="https://example.com"
                  inputMode="url"
                />
                <p className="text-sm text-[#64748b]">
                  Use the homepage only. Pricing Pulse derives the domain
                  automatically, discovers likely pricing pages, and checks the
                  saved source daily.
                </p>
              </div>
            </div>

            <SheetFooter className="mt-4 border-t border-[#e2e8f0]">
              <Button
                onClick={() => {
                  void onSubmit();
                }}
                disabled={
                  isSubmitting || !form.name.trim() || !form.homepageUrl.trim()
                }
                className="bg-[#0f766e] text-white hover:bg-[#115e59]"
              >
                {isSubmitting ? "Adding..." : "Add competitor and continue"}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
