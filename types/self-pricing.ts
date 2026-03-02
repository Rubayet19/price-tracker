export interface SelfPricingPlan {
  name: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
}

export interface SelfPricingProfileData {
  currency: string;
  plans: SelfPricingPlan[];
  notes?: string | null;
}
