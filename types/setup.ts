import type { PricingUrlCandidate } from "@/types/companies";
import type { DashboardCrawlStatus } from "@/types/dashboard";
import type { ResolvedEntitlements, TrialStatus } from "@/types/entitlements";
import type { SelfPricingProfileData } from "@/types/self-pricing";

export type SetupStep =
  | "self_pricing"
  | "trial"
  | "competitors"
  | "competitor_pricing"
  | "done";

export interface SetupStepTarget {
  step: SetupStep;
  href: string;
  companyId?: string;
}

export interface SetupSelfCompany {
  companyId: string;
  name: string;
  domain: string;
  homepageUrl: string | null;
  primaryPricingUrl: string | null;
}

export interface SetupCompetitor {
  companyId: string;
  name: string;
  domain: string;
  homepageUrl: string | null;
  primaryPricingUrl: string | null;
  pricingUrlCandidates: PricingUrlCandidate[];
  lastCrawlStatus: DashboardCrawlStatus;
  lastCrawlAt: string | null;
  lastCrawlError: string | null;
  latestConfidence: number | null;
  hasUserSelectedPrimaryPricing: boolean;
}

export interface SetupTrialState {
  status: TrialStatus;
  startedAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  canStartTrial: boolean;
  needsTrialAccess: boolean;
}

export interface SetupStatus {
  userId: string;
  now: string;
  entitlements: ResolvedEntitlements;
  trial: SetupTrialState;
  selfPricingProfile: SelfPricingProfileData | null;
  selfCompany: SetupSelfCompany | null;
  hasSelfPricing: boolean;
  hasSelfCompany: boolean;
  competitorCount: number;
  hasCompetitors: boolean;
  competitors: SetupCompetitor[];
  hasSelectedPrimaryPricing: boolean;
  nextStep: SetupStepTarget;
  isSetupComplete: boolean;
}
