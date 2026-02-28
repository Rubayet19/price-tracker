import "server-only";

import { redirect } from "next/navigation";
import config from "@/config";
import connectMongo from "@/libs/mongoose";
import { isTrialActive, resolveEntitlements } from "@/libs/entitlements";
import { refreshTrialStatusIfExpired } from "@/libs/trial";
import Company from "@/models/Company";
import SelfPricingProfile from "@/models/SelfPricingProfile";
import User from "@/models/User";
import type { PricingUrlCandidate } from "@/types/companies";
import type { DashboardCrawlStatus } from "@/types/dashboard";
import type { SetupStatus, SetupStepTarget } from "@/types/setup";

interface CompanyLean {
  _id: string;
  name: string;
  domain: string;
  type: "self" | "competitor";
  homepageUrl?: string;
  primaryPricingUrl?: string;
  pricingUrlCandidates: PricingUrlCandidate[];
  lastCrawlStatus: DashboardCrawlStatus;
  lastCrawlAt?: Date;
  lastCrawlError?: string;
  latestConfidence?: number;
}

interface SelfPricingProfileLean {
  currency: string;
  billingPeriod: "month" | "year" | "custom";
  plans: Array<{
    name: string;
    price: number;
    priceAnchor?: number;
    highlights?: string[];
  }>;
  notes?: string;
}

const getSetupStepHref = (step: SetupStepTarget["step"], companyId?: string): string => {
  switch (step) {
    case "self_pricing":
      return "/dashboard/setup/self-pricing";
    case "trial":
      return "/dashboard/setup/trial";
    case "competitors":
      return "/dashboard/setup/competitors";
    case "competitor_pricing":
      return companyId ? `/dashboard/setup/competitors/${companyId}/pricing` : "/dashboard/setup";
    case "done":
      return "/dashboard";
    default:
      return "/dashboard/setup";
  }
};

const hasUserSelectedPrimaryPricing = (company: CompanyLean): boolean => {
  return Boolean(company.primaryPricingUrl);
};

export const getSetupStatus = async (userId: string): Promise<SetupStatus> => {
  await connectMongo();

  const [user, selfPricingProfile, companies] = await Promise.all([
    User.findById(userId).select({
      hasAccess: 1,
      priceId: 1,
      trialStatus: 1,
      trialStartedAt: 1,
      trialEndsAt: 1,
    }),
    SelfPricingProfile.findOne({ userId }).lean<SelfPricingProfileLean | null>().exec(),
    Company.find({ userId })
      .sort({ createdAt: 1, name: 1 })
      .lean<CompanyLean[]>()
      .exec(),
  ]);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const now = new Date();
  await refreshTrialStatusIfExpired(user, now);

  const entitlements = resolveEntitlements(user, now);
  const selfCompanyRecord = companies.find((company) => company.type === "self") ?? null;
  const competitorRecords = companies.filter((company) => company.type === "competitor");

  const competitors = competitorRecords.map((company) => ({
    companyId: String(company._id),
    name: company.name,
    domain: company.domain,
    homepageUrl: company.homepageUrl ?? null,
    primaryPricingUrl: company.primaryPricingUrl ?? null,
    pricingUrlCandidates: company.pricingUrlCandidates ?? [],
    lastCrawlStatus: company.lastCrawlStatus,
    lastCrawlAt: company.lastCrawlAt ? company.lastCrawlAt.toISOString() : null,
    lastCrawlError: company.lastCrawlError ?? null,
    latestConfidence: company.latestConfidence ?? null,
    hasUserSelectedPrimaryPricing: hasUserSelectedPrimaryPricing(company),
  }));

  const hasSelfPricing = Boolean(selfPricingProfile && selfPricingProfile.plans.length > 0);
  const hasSelfCompany = Boolean(selfCompanyRecord);
  const hasCompetitors = competitors.length > 0;
  const competitorMissingPricing = competitors.find(
    (competitor) => !competitor.hasUserSelectedPrimaryPricing
  );
  const hasSelectedPrimaryPricing = competitors.every(
    (competitor) => competitor.hasUserSelectedPrimaryPricing
  );

  const hasHistoricallyCompletedSetup =
    hasSelfPricing && hasSelfCompany && hasCompetitors && hasSelectedPrimaryPricing;

  let nextStep: SetupStepTarget;
  if (!hasSelfPricing || !hasSelfCompany) {
    nextStep = {
      step: "self_pricing",
      href: getSetupStepHref("self_pricing"),
    };
  } else if (!entitlements.hasAccess) {
    nextStep = {
      step: "trial",
      href: getSetupStepHref("trial"),
    };
  } else if (!hasCompetitors) {
    nextStep = {
      step: "competitors",
      href: getSetupStepHref("competitors"),
    };
  } else if (competitorMissingPricing) {
    nextStep = {
      step: "competitor_pricing",
      href: getSetupStepHref("competitor_pricing", competitorMissingPricing.companyId),
      companyId: competitorMissingPricing.companyId,
    };
  } else {
    nextStep = {
      step: "done",
      href: getSetupStepHref("done"),
    };
  }

  return {
    userId,
    now: now.toISOString(),
    entitlements,
    trial: {
      status: user.trialStatus,
      startedAt: user.trialStartedAt ? user.trialStartedAt.toISOString() : null,
      endsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
      isActive: isTrialActive(user, now),
      canStartTrial:
        user.trialStatus === "not_started" && !user.trialStartedAt && !user.trialEndsAt && !user.hasAccess,
      needsTrialAccess: !entitlements.hasAccess,
    },
    selfPricingProfile: selfPricingProfile
      ? {
          currency: selfPricingProfile.currency,
          billingPeriod: selfPricingProfile.billingPeriod,
          plans: selfPricingProfile.plans.map((plan) => ({
            name: plan.name,
            price: plan.price,
            priceAnchor: plan.priceAnchor,
            highlights: plan.highlights ?? [],
          })),
          notes: selfPricingProfile.notes ?? null,
        }
      : null,
    selfCompany: selfCompanyRecord
      ? {
          companyId: String(selfCompanyRecord._id),
          name: selfCompanyRecord.name,
          domain: selfCompanyRecord.domain,
          homepageUrl: selfCompanyRecord.homepageUrl ?? null,
          primaryPricingUrl: selfCompanyRecord.primaryPricingUrl ?? null,
        }
      : null,
    hasSelfPricing,
    hasSelfCompany,
    competitorCount: competitors.length,
    hasCompetitors,
    competitors,
    hasSelectedPrimaryPricing,
    nextStep,
    isSetupComplete: hasHistoricallyCompletedSetup && entitlements.hasAccess,
  };
};

interface RequireCompletedSetupOptions {
  requireAccess?: boolean;
}

export const requireCompletedSetup = async (
  userId: string,
  options?: RequireCompletedSetupOptions
): Promise<SetupStatus> => {
  const status = await getSetupStatus(userId);
  const requireAccess = options?.requireAccess ?? true;

  const hasCompletedSetupWithoutAccess =
    status.hasSelfPricing &&
    status.hasSelfCompany &&
    status.hasCompetitors &&
    status.hasSelectedPrimaryPricing;

  if (!hasCompletedSetupWithoutAccess || (requireAccess && !status.entitlements.hasAccess)) {
    redirect(status.nextStep.href);
  }

  return status;
};

export const requireAuthenticatedDashboardUserId = (userId: string | null | undefined): string => {
  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  return String(userId);
};
