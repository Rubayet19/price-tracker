"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { createCompany, saveSelfPricingProfile } from "@/components/dashboard/setup/setup-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SetupSelfCompany } from "@/types/setup";
import type { SelfPricingBillingPeriod, SelfPricingProfileData } from "@/types/self-pricing";

interface SelfPricingSetupFormProps {
  existingProfile: SelfPricingProfileData | null;
  existingSelfCompany: SetupSelfCompany | null;
}

interface PlanDraft {
  name: string;
  price: string;
  priceAnchor: string;
  highlights: string;
}

const toPlanDrafts = (profile: SelfPricingProfileData | null): PlanDraft[] => {
  if (!profile || profile.plans.length === 0) {
    return [
      {
        name: "Starter",
        price: "",
        priceAnchor: "",
        highlights: "",
      },
    ];
  }

  return profile.plans.map((plan) => ({
    name: plan.name,
    price: String(plan.price),
    priceAnchor: typeof plan.priceAnchor === "number" ? String(plan.priceAnchor) : "",
    highlights: plan.highlights.join("\n"),
  }));
};

export default function SelfPricingSetupForm({
  existingProfile,
  existingSelfCompany,
}: SelfPricingSetupFormProps) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState<string>(existingSelfCompany?.name ?? "");
  const [companyDomain, setCompanyDomain] = useState<string>(existingSelfCompany?.domain ?? "");
  const [homepageUrl, setHomepageUrl] = useState<string>(existingSelfCompany?.homepageUrl ?? "");
  const [primaryPricingUrl, setPrimaryPricingUrl] = useState<string>(
    existingSelfCompany?.primaryPricingUrl ?? ""
  );
  const [currency, setCurrency] = useState<string>(existingProfile?.currency ?? "USD");
  const [billingPeriod, setBillingPeriod] = useState<SelfPricingBillingPeriod>(
    existingProfile?.billingPeriod ?? "month"
  );
  const [notes, setNotes] = useState<string>(existingProfile?.notes ?? "");
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
        price: "",
        priceAnchor: "",
        highlights: "",
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
        price: plan.price.trim(),
        priceAnchor: plan.priceAnchor.trim(),
        highlights: plan.highlights
          .split("\n")
          .map((highlight) => highlight.trim())
          .filter(Boolean),
      }))
      .filter((plan) => plan.name || plan.price || plan.priceAnchor || plan.highlights.length > 0);

    if (normalizedPlans.length === 0) {
      setError("Add at least one pricing plan.");
      return;
    }

    let parsedPlans: SelfPricingProfileData["plans"];
    try {
      parsedPlans = normalizedPlans.map((plan) => {
        const price = Number(plan.price);
        const priceAnchor = plan.priceAnchor ? Number(plan.priceAnchor) : undefined;

        if (!plan.name) {
          throw new Error("Each plan needs a name.");
        }

        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`Plan "${plan.name}" needs a valid non-negative price.`);
        }

        if (
          typeof priceAnchor !== "undefined" &&
          (!Number.isFinite(priceAnchor) || priceAnchor < 0)
        ) {
          throw new Error(`Plan "${plan.name}" has an invalid anchor price.`);
        }

        return {
          name: plan.name,
          price,
          priceAnchor,
          highlights: plan.highlights,
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

      if (!companyDomain.trim()) {
        setError("Add your product domain.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      await saveSelfPricingProfile({
        currency: currency.trim().toUpperCase(),
        billingPeriod,
        plans: parsedPlans,
        notes: notes.trim() || undefined,
      });

      if (!existingSelfCompany) {
        await createCompany({
          name: companyName.trim(),
          type: "self",
          domain: companyDomain.trim(),
          homepageUrl: homepageUrl.trim() || undefined,
          primaryPricingUrl: primaryPricingUrl.trim() || undefined,
        });
      }

      toast.success("Pricing setup saved");
      router.push("/dashboard/setup");
      router.refresh();
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
              Enter your pricing context
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-[#475569]">
              This step seeds the comparison engine with your current offer. Keep it simple and
              explicit so the dashboard can compare you against competitors cleanly.
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
              <Label htmlFor="self-company-domain">Primary domain</Label>
              <Input
                id="self-company-domain"
                value={companyDomain}
                onChange={(event) => setCompanyDomain(event.target.value)}
                placeholder="example.com"
                autoCapitalize="none"
                autoCorrect="off"
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="self-pricing-url">Pricing URL</Label>
              <Input
                id="self-pricing-url"
                value={primaryPricingUrl}
                onChange={(event) => setPrimaryPricingUrl(event.target.value)}
                placeholder="https://example.com/pricing"
                inputMode="url"
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[180px_220px_minmax(0,1fr)]">
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
            <Label htmlFor="self-billing-period">Billing period</Label>
            <Select
              value={billingPeriod}
              onValueChange={(value) => setBillingPeriod(value as SelfPricingBillingPeriod)}
            >
              <SelectTrigger id="self-billing-period" className="w-full bg-white">
                <SelectValue placeholder="Select a billing period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="self-notes">Notes</Label>
            <textarea
              id="self-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything a competitor comparison should know about packaging or pricing."
              rows={3}
              className="flex min-h-[96px] w-full rounded-md border border-[#d5dbe3] bg-white px-3 py-2 text-sm text-[#0f172a] shadow-xs outline-none ring-0 transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            />
          </div>
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
                  <p className="mt-1 text-sm text-[#475569]">Name, price, and optional highlights.</p>
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

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_140px_140px]">
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
                  <Label htmlFor={`plan-price-${index}`}>Price</Label>
                  <Input
                    id={`plan-price-${index}`}
                    value={plan.price}
                    onChange={(event) => updatePlan(index, { price: event.target.value })}
                    placeholder="19"
                    inputMode="decimal"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`plan-anchor-${index}`}>Anchor price</Label>
                  <Input
                    id={`plan-anchor-${index}`}
                    value={plan.priceAnchor}
                    onChange={(event) => updatePlan(index, { priceAnchor: event.target.value })}
                    placeholder="29"
                    inputMode="decimal"
                  />
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <Label htmlFor={`plan-highlights-${index}`}>Highlights (one per line)</Label>
                <textarea
                  id={`plan-highlights-${index}`}
                  value={plan.highlights}
                  onChange={(event) => updatePlan(index, { highlights: event.target.value })}
                  placeholder={"Track up to 3 competitors\nHigh-severity insights"}
                  rows={4}
                  className="flex min-h-[112px] w-full rounded-md border border-[#d5dbe3] bg-white px-3 py-2 text-sm text-[#0f172a] shadow-xs outline-none ring-0 transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
                />
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
            {isSubmitting ? "Saving..." : "Save pricing and continue"}
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
