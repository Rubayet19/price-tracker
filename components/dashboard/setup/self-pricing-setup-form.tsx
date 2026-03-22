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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    monthlyPrice:
      typeof plan.monthlyPrice === "number" ? String(plan.monthlyPrice) : "",
    annualPrice:
      typeof plan.annualPrice === "number" ? String(plan.annualPrice) : "",
  }));
};

const updateSelfCompanyDetails = async (
  companyId: string,
  data: { name?: string; homepageUrl?: string }
): Promise<void> => {
  const response = await fetch(`/api/companies/${companyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "Failed to update company details"
    );
  }
};

export default function SelfPricingSetupForm({
  existingProfile,
  existingSelfCompany,
  mode = "setup",
}: SelfPricingSetupFormProps) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState<string>(
    existingSelfCompany?.name ?? ""
  );
  const [homepageUrl, setHomepageUrl] = useState<string>(
    existingSelfCompany?.homepageUrl ?? ""
  );
  const [primaryPricingUrl, setPrimaryPricingUrl] = useState<string>(
    existingSelfCompany?.primaryPricingUrl ?? ""
  );
  const [currency, setCurrency] = useState<string>(
    existingProfile?.currency ?? "USD"
  );
  const [plans, setPlans] = useState<PlanDraft[]>(() =>
    toPlanDrafts(existingProfile)
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const planCountLabel = useMemo(() => {
    return `${plans.length} plan${plans.length === 1 ? "" : "s"}`;
  }, [plans.length]);

  const updatePlan = (index: number, patch: Partial<PlanDraft>): void => {
    setPlans((current) =>
      current.map((plan, planIndex) =>
        planIndex === index ? { ...plan, ...patch } : plan
      )
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
    setPlans((current) =>
      current.filter((_, planIndex) => planIndex !== index)
    );
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

        const monthlyPrice = plan.monthlyPrice
          ? Number(plan.monthlyPrice)
          : null;
        const annualPrice = plan.annualPrice ? Number(plan.annualPrice) : null;

        if (
          monthlyPrice !== null &&
          (!Number.isFinite(monthlyPrice) || monthlyPrice < 0)
        ) {
          throw new Error(`Plan "${plan.name}" has an invalid monthly price.`);
        }

        if (
          annualPrice !== null &&
          (!Number.isFinite(annualPrice) || annualPrice < 0)
        ) {
          throw new Error(`Plan "${plan.name}" has an invalid annual price.`);
        }

        if (monthlyPrice === null && annualPrice === null) {
          throw new Error(
            `Plan "${plan.name}" needs a monthly or annual price.`
          );
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

    if (!companyName.trim()) {
      setError("Add your product name.");
      return;
    }

    if (!homepageUrl.trim()) {
      setError("Add your homepage URL.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Save pricing profile
      await saveSelfPricingProfile({
        currency: currency.trim().toUpperCase(),
        plans: parsedPlans,
      });

      if (existingSelfCompany) {
        // Update existing company details if name or homepage changed
        const nameChanged = companyName.trim() !== existingSelfCompany.name;
        const urlChanged =
          homepageUrl.trim() !== (existingSelfCompany.homepageUrl ?? "");

        if (nameChanged || urlChanged) {
          const patch: { name?: string; homepageUrl?: string } = {};
          if (nameChanged) patch.name = companyName.trim();
          if (urlChanged) patch.homepageUrl = homepageUrl.trim();
          await updateSelfCompanyDetails(existingSelfCompany.companyId, patch);
        }
      } else {
        // Create new self company
        const selfCompany = await createCompany({
          name: companyName.trim(),
          type: "self",
          homepageUrl: homepageUrl.trim(),
          primaryPricingUrl: primaryPricingUrl.trim() || undefined,
        });

        if (!primaryPricingUrl.trim()) {
          const discovery = await discoverPricingUrls(selfCompany.id);
          if (discovery.primaryPricingUrl ?? discovery.recommendedPrimaryUrl) {
            toast.success(
              "Pricing baseline saved. We also found your pricing page from the homepage."
            );
          }
        }
      }

      toast.success(
        mode === "settings" ? "Pricing baseline updated" : "Pricing setup saved"
      );
      if (mode === "settings") {
        router.refresh();
      } else {
        router.push("/dashboard/setup");
        router.refresh();
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Failed to save setup details";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSettings = mode === "settings";

  return (
    <Card className="border-[#0f172a]/10 bg-white/95">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-2xl font-black tracking-tight text-[#0f172a]">
              {isSettings
                ? "Your pricing baseline"
                : "Set your product baseline"}
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl text-sm text-[#475569]">
              {isSettings
                ? "This is compared against your competitors to generate insights."
                : "Add your product and plan pricing. We'll use this as the baseline for competitor comparisons."}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="border-[#cbd5e1] bg-[#f8fafc] text-[#475569]"
          >
            {planCountLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Company details + currency — single grid */}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px]">
          <div className="space-y-1.5">
            <Label htmlFor="self-company-name">Product name</Label>
            <Input
              id="self-company-name"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Acme Inc"
              autoComplete="organization"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="self-homepage-url">Homepage URL</Label>
            <Input
              id="self-homepage-url"
              value={homepageUrl}
              onChange={(event) => setHomepageUrl(event.target.value)}
              placeholder="https://example.com"
              inputMode="url"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="self-currency">Currency</Label>
            <Input
              id="self-currency"
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              placeholder="USD"
              maxLength={3}
            />
          </div>

          {!existingSelfCompany && (
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="self-pricing-url">
                Pricing page URL (optional)
              </Label>
              <Input
                id="self-pricing-url"
                value={primaryPricingUrl}
                onChange={(event) => setPrimaryPricingUrl(event.target.value)}
                placeholder="https://example.com/pricing"
                inputMode="url"
              />
              <p className="text-xs text-[#94a3b8]">
                Leave blank to auto-detect from your homepage.
              </p>
            </div>
          )}
        </div>

        {/* Plans */}
        <div className="space-y-3">
          {plans.map((plan, index) => (
            <div
              key={index}
              className="rounded-xl border border-[#e2e8f0] bg-[#fafbfc] p-4"
            >
              <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_140px_140px_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor={`plan-name-${index}`}>Plan name</Label>
                  <Input
                    id={`plan-name-${index}`}
                    value={plan.name}
                    onChange={(event) =>
                      updatePlan(index, { name: event.target.value })
                    }
                    placeholder="Starter"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`plan-monthly-price-${index}`}>Monthly</Label>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-[#94a3b8]">
                      $
                    </span>
                    <Input
                      id={`plan-monthly-price-${index}`}
                      value={plan.monthlyPrice}
                      onChange={(event) =>
                        updatePlan(index, { monthlyPrice: event.target.value })
                      }
                      placeholder="—"
                      inputMode="decimal"
                      className="pl-7"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`plan-annual-price-${index}`}>Annual</Label>
                  <div className="relative">
                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-[#94a3b8]">
                      $
                    </span>
                    <Input
                      id={`plan-annual-price-${index}`}
                      value={plan.annualPrice}
                      onChange={(event) =>
                        updatePlan(index, { annualPrice: event.target.value })
                      }
                      placeholder="—"
                      inputMode="decimal"
                      className="pl-7"
                    />
                  </div>
                </div>

                <div className="flex items-end pb-[2px]">
                  {plans.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removePlan(index)}
                      className="size-9 text-[#94a3b8] hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : (
                    <div className="size-9" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={addPlan}>
            <Plus className="size-3.5" />
            Add plan
          </Button>

          <Button
            type="button"
            onClick={() => {
              void onSubmit();
            }}
            disabled={isSubmitting}
            className="bg-[#0f766e] text-white hover:bg-[#115e59]"
          >
            {isSubmitting
              ? "Saving..."
              : isSettings
                ? "Save changes"
                : "Save and continue"}
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
