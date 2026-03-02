"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  createCompany,
  discoverPricingUrls,
  saveSelfPricingProfile,
} from "@/components/dashboard/setup/setup-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SetupSelfCompany } from "@/types/setup";
import type { SelfPricingProfileData } from "@/types/self-pricing";

interface SelfPricingSetupFormProps {
  existingProfile: SelfPricingProfileData | null;
  existingSelfCompany: SetupSelfCompany | null;
  mode?: "setup" | "settings";
}

interface PlanDraft {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
}

const toPlanDrafts = (profile: SelfPricingProfileData | null): PlanDraft[] => {
  if (!profile || profile.plans.length === 0) {
    return [
      {
        name: "Starter",
        monthlyPrice: "",
        annualPrice: "",
      },
    ];
  }

  return profile.plans.map((plan) => ({
    name: plan.name,
    monthlyPrice: typeof plan.monthlyPrice === "number" ? String(plan.monthlyPrice) : "",
    annualPrice: typeof plan.annualPrice === "number" ? String(plan.annualPrice) : "",
  }));
};

export default function SelfPricingSetupForm({
  existingProfile,
  existingSelfCompany,
  mode = "setup",
}: SelfPricingSetupFormProps) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState<string>(existingSelfCompany?.name ?? "");
  const [homepageUrl, setHomepageUrl] = useState<string>(existingSelfCompany?.homepageUrl ?? "");
  const [primaryPricingUrl, setPrimaryPricingUrl] = useState<string>(
    existingSelfCompany?.primaryPricingUrl ?? ""
  );
  const [currency, setCurrency] = useState<string>(existingProfile?.currency ?? "USD");
  const [positioningStatement, setPositioningStatement] = useState<string>(existingProfile?.notes ?? "");
  const [plans, setPlans] = useState<PlanDraft[]>(() => toPlanDrafts(existingProfile));
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const planCountLabel = useMemo(() => {
    return `${plans.length} plan${plans.length === 1 ? "" : "s"}`;
  }, [plans.length]);

  const updatePlan = (index: number, patch: Partial<PlanDraft>): void => {
    setPlans((current) =>
      current.map((plan, planIndex) => (planIndex === index ? { ...plan, ...patch } : plan))
    );
  };

  const addPlan = (): void => {
    setPlans((current) => [
      ...current,
      {
        name: "",
        monthlyPrice: "",
        annualPrice: "",
      },
    ]);
  };

  const removePlan = (index: number): void => {
    setPlans((current) => current.filter((_, planIndex) => planIndex !== index));
  };

  const onSubmit = async (): Promise<void> => {
    setError(null);

    const normalizedPlans = plans
      .map((plan) => ({
        name: plan.name.trim(),
        monthlyPrice: plan.monthlyPrice.trim(),
        annualPrice: plan.annualPrice.trim(),
      }))
      .filter((plan) => plan.name || plan.monthlyPrice || plan.annualPrice);

    if (normalizedPlans.length === 0) {
      setError("Add at least one pricing plan.");
      return;
    }

    let parsedPlans: SelfPricingProfileData["plans"];
    try {
      parsedPlans = normalizedPlans.map((plan) => {
        if (!plan.name) {
          throw new Error("Each plan needs a name.");
        }

        const monthlyPrice = plan.monthlyPrice ? Number(plan.monthlyPrice) : null;
        const annualPrice = plan.annualPrice ? Number(plan.annualPrice) : null;

        if (monthlyPrice !== null && (!Number.isFinite(monthlyPrice) || monthlyPrice < 0)) {
          throw new Error(`Plan "${plan.name}" has an invalid monthly price.`);
        }

        if (annualPrice !== null && (!Number.isFinite(annualPrice) || annualPrice < 0)) {
          throw new Error(`Plan "${plan.name}" has an invalid annual price.`);
        }

        if (monthlyPrice === null && annualPrice === null) {
          throw new Error(`Plan "${plan.name}" needs a monthly or annual price.`);
        }

        return {
          name: plan.name,
          monthlyPrice,
          annualPrice,
        };
      });
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Review your plan pricing and try again."
      );
      return;
    }

    if (!existingSelfCompany) {
      if (!companyName.trim()) {
        setError("Add your product name.");
        return;
      }

      if (!homepageUrl.trim()) {
        setError("Add your homepage URL.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      await saveSelfPricingProfile({
        currency: currency.trim().toUpperCase(),
        plans: parsedPlans,
        notes: positioningStatement.trim() || undefined,
      });

      if (!existingSelfCompany) {
        const selfCompany = await createCompany({
          name: companyName.trim(),
          type: "self",
          homepageUrl: homepageUrl.trim(),
          primaryPricingUrl: primaryPricingUrl.trim() || undefined,
        });

        if (!primaryPricingUrl.trim()) {
          const discovery = await discoverPricingUrls(selfCompany.id);
          if (discovery.primaryPricingUrl ?? discovery.recommendedPrimaryUrl) {
            toast.success("Pricing baseline saved. We also found your pricing page from the homepage.");
          }
        }
      }

      toast.success(mode === "settings" ? "Pricing baseline updated" : "Pricing setup saved");
      if (mode === "settings") {
        router.refresh();
      } else {
        router.push("/dashboard/setup");
        router.refresh();
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to save setup details";
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
              {mode === "settings" ? "Edit your pricing baseline" : "Set your product baseline"}
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
              {mode === "settings"
                ? "Update the pricing baseline used for comparison against competitors."
                : "Add your product, homepage, and plan pricing. If you leave the pricing URL blank, Price Tracker will try to find it from your homepage automatically."}
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-[#cbd5e1] bg-[#f8fafc] text-[#475569]">
            {planCountLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {existingSelfCompany ? (
          <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4">
            <p className="text-sm font-semibold text-[#0f172a]">Self company already linked</p>
            <p className="mt-2 text-sm text-[#475569]">
              {existingSelfCompany.name} · {existingSelfCompany.domain}
            </p>
            {existingSelfCompany.primaryPricingUrl ? (
              <p className="mt-1 text-sm text-[#64748b]">{existingSelfCompany.primaryPricingUrl}</p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="self-company-name">Product name</Label>
              <Input
                id="self-company-name"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Price Tracker"
                autoComplete="organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="self-homepage-url">Homepage URL</Label>
              <Input
                id="self-homepage-url"
                value={homepageUrl}
                onChange={(event) => setHomepageUrl(event.target.value)}
                placeholder="https://example.com"
                inputMode="url"
              />
              <p className="text-sm text-[#64748b]">
                Use the homepage only. Price Tracker derives the domain automatically.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="self-pricing-url">Pricing URL (optional)</Label>
              <Input
                id="self-pricing-url"
                value={primaryPricingUrl}
                onChange={(event) => setPrimaryPricingUrl(event.target.value)}
                placeholder="https://example.com/pricing"
                inputMode="url"
              />
              <p className="text-sm text-[#64748b]">
                Leave this blank if you want Price Tracker to try finding the pricing page from your homepage.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="self-currency">Currency</Label>
            <Input
              id="self-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
              placeholder="USD"
              maxLength={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="self-notes">Positioning statement (optional)</Label>
            <textarea
              id="self-notes"
              value={positioningStatement}
              onChange={(event) => setPositioningStatement(event.target.value)}
              placeholder="AI-first competitor pricing intelligence for lean SaaS teams."
              rows={4}
              className="flex min-h-[96px] w-full rounded-md border border-[#d5dbe3] bg-white px-3 py-2 text-sm text-[#0f172a] shadow-xs outline-none ring-0 transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            />
            <p className="text-sm text-[#64748b]">
              Keep it to one sentence. This gives the comparison layer context about how you position your product.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[#0f172a]/10 bg-[#f8fafc] p-4 text-sm leading-6 text-[#475569]">
          Add explicit monthly and annual prices where they exist. Leave a cadence blank if you do not offer it.
        </div>

        <div className="space-y-4">
          {plans.map((plan, index) => (
            <article
              key={`${index}-${plan.name}`}
              className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#64748b]">
                    Plan {index + 1}
                  </p>
                  <p className="mt-1 text-sm text-[#475569]">Name plus optional monthly and annual price points.</p>
                </div>
                {plans.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removePlan(index)}
                    className="bg-white"
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_160px_160px]">
                <div className="space-y-2">
                  <Label htmlFor={`plan-name-${index}`}>Plan name</Label>
                  <Input
                    id={`plan-name-${index}`}
                    value={plan.name}
                    onChange={(event) => updatePlan(index, { name: event.target.value })}
                    placeholder="Starter"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`plan-monthly-price-${index}`}>Monthly price</Label>
                  <Input
                    id={`plan-monthly-price-${index}`}
                    value={plan.monthlyPrice}
                    onChange={(event) => updatePlan(index, { monthlyPrice: event.target.value })}
                    placeholder="19"
                    inputMode="decimal"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`plan-annual-price-${index}`}>Annual price</Label>
                  <Input
                    id={`plan-annual-price-${index}`}
                    value={plan.annualPrice}
                    onChange={(event) => updatePlan(index, { annualPrice: event.target.value })}
                    placeholder="190"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={addPlan} className="bg-white">
            <Plus className="size-4" />
            Add another plan
          </Button>

          <Button
            type="button"
            onClick={() => {
              void onSubmit();
            }}
            disabled={isSubmitting}
            className="bg-[#0f766e] text-white hover:bg-[#115e59]"
          >
            {isSubmitting ? "Saving..." : mode === "settings" ? "Save pricing baseline" : "Save pricing and continue"}
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
