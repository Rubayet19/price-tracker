export type SelfPricingBillingPeriod = "month" | "year" | "custom";

export interface SelfPricingPlan {
  name: string;
  price: number;
  priceAnchor?: number;
  highlights: string[];
}

export interface SelfPricingProfileData {
  currency: string;
  billingPeriod: SelfPricingBillingPeriod;
  plans: SelfPricingPlan[];
  notes?: string | null;
}
