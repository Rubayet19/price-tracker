import type { SelfPricingPlan, SelfPricingProfileData } from "@/types/self-pricing";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toNonNegativeNumberOrNull = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
};

const toCurrency = (value: unknown): string => {
  if (typeof value !== "string") {
    return "USD";
  }

  const trimmed = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : "USD";
};

const normalizePlan = (
  value: unknown,
  legacyBillingPeriod: "month" | "year"
): SelfPricingPlan | null => {
  if (!isRecord(value) || typeof value.name !== "string") {
    return null;
  }

  const name = value.name.trim();
  if (!name) {
    return null;
  }

  const monthlyExplicit = toNonNegativeNumberOrNull(value.monthlyPrice);
  const annualExplicit = toNonNegativeNumberOrNull(value.annualPrice);
  const legacySinglePrice = toNonNegativeNumberOrNull(value.price);

  const monthlyPrice =
    monthlyExplicit ?? (annualExplicit === null && legacyBillingPeriod === "month" ? legacySinglePrice : null);
  const annualPrice =
    annualExplicit ?? (monthlyExplicit === null && legacyBillingPeriod === "year" ? legacySinglePrice : null);

  if (monthlyPrice === null && annualPrice === null) {
    return null;
  }

  return {
    name,
    monthlyPrice,
    annualPrice,
  };
};

export const normalizeSelfPricingProfile = (value: unknown): SelfPricingProfileData | null => {
  if (!isRecord(value)) {
    return null;
  }

  const legacyBillingPeriod = value.billingPeriod === "year" ? "year" : "month";
  const rawPlans = Array.isArray(value.plans) ? value.plans : [];
  const plans = rawPlans
    .map((plan) => normalizePlan(plan, legacyBillingPeriod))
    .filter((plan): plan is SelfPricingPlan => plan !== null);

  return {
    currency: toCurrency(value.currency),
    plans,
    notes: typeof value.notes === "string" && value.notes.trim() ? value.notes.trim() : null,
  };
};
