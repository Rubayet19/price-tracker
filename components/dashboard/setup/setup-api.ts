"use client";

import type { PricingUrlCandidate } from "@/types/companies";
import type { DashboardCrawlStatus } from "@/types/dashboard";
import type { ResolvedEntitlements } from "@/types/entitlements";
import type { SelfPricingProfileData } from "@/types/self-pricing";

interface JsonErrorPayload {
  error?: unknown;
}

export interface TrialStartApiResponse {
  trial: {
    userId: string;
    started: boolean;
    changed: boolean;
    reason: string;
    trialStatus: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
  };
  entitlements: ResolvedEntitlements;
}

export interface CompanyApiResponse {
  company: {
    id: string;
    name: string;
    domain: string;
    type: "self" | "competitor";
    homepageUrl?: string;
    primaryPricingUrl?: string;
  };
}

export interface PricingDiscoveryApiResponse {
  companyId: string;
  candidates: PricingUrlCandidate[];
  primaryPricingUrl: string | null;
  recommendedPrimaryUrl: string | null;
}

export interface PrimaryPricingApiResponse {
  companyId: string;
  domain: string;
  primaryPricingUrl: string | null;
  pricingUrlCandidates: PricingUrlCandidate[];
}

export interface CrawlCompanyApiResponse {
  companyId: string;
  completed: boolean;
  result: {
    companyId: string;
    status: DashboardCrawlStatus;
    changed: boolean;
    snapshotCreated: boolean;
    diffCreated: boolean;
    insightCreated: boolean;
    skippedByHash: boolean;
    reason?: string;
  };
}

const toErrorMessage = async (
  response: Response,
  fallbackMessage: string
): Promise<string> => {
  try {
    const payload = (await response.json()) as JsonErrorPayload;
    if (typeof payload.error === "string" && payload.error.trim().length > 0) {
      return payload.error;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
};

const createJsonOptions = (method: string, body?: unknown) => {
  return {
    method,
    cache: "no-store" as const,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  };
};

export const saveSelfPricingProfile = async (
  payload: SelfPricingProfileData
): Promise<SelfPricingProfileData> => {
  const response = await fetch(
    "/api/self-pricing",
    createJsonOptions("PUT", payload)
  );

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to save self pricing profile")
    );
  }

  const data = (await response.json()) as { profile: SelfPricingProfileData };
  return data.profile;
};

export const createCompany = async (payload: {
  name: string;
  type: "self" | "competitor";
  domain?: string;
  homepageUrl?: string;
  primaryPricingUrl?: string;
}): Promise<CompanyApiResponse["company"]> => {
  const response = await fetch(
    "/api/companies",
    createJsonOptions("POST", payload)
  );

  if (!response.ok) {
    throw new Error(await toErrorMessage(response, "Failed to create company"));
  }

  const data = (await response.json()) as CompanyApiResponse;
  return data.company;
};

export const startTrial = async (): Promise<{
  status: number;
  data: TrialStartApiResponse | null;
  error: string | null;
}> => {
  const response = await fetch("/api/trial/start", createJsonOptions("POST"));

  if (response.ok) {
    return {
      status: response.status,
      data: (await response.json()) as TrialStartApiResponse,
      error: null,
    };
  }

  if (response.status === 409) {
    const data = (await response.json()) as TrialStartApiResponse;
    return {
      status: response.status,
      data,
      error: null,
    };
  }

  return {
    status: response.status,
    data: null,
    error: await toErrorMessage(response, "Failed to start trial"),
  };
};

export const discoverPricingUrls = async (
  companyId: string
): Promise<PricingDiscoveryApiResponse> => {
  const response = await fetch(
    `/api/companies/${companyId}/discover-pricing`,
    createJsonOptions("POST")
  );

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to discover pricing URLs")
    );
  }

  return (await response.json()) as PricingDiscoveryApiResponse;
};

export const updatePrimaryPricingUrl = async (
  companyId: string,
  payload: { candidateUrl?: string; url?: string }
): Promise<PrimaryPricingApiResponse> => {
  const response = await fetch(
    `/api/companies/${companyId}/primary-pricing`,
    createJsonOptions("PATCH", payload)
  );

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to save the pricing URL")
    );
  }

  return (await response.json()) as PrimaryPricingApiResponse;
};

export const crawlCompanyNow = async (
  companyId: string
): Promise<CrawlCompanyApiResponse> => {
  const response = await fetch(
    `/api/companies/${companyId}/crawl-now`,
    createJsonOptions("POST")
  );

  if (!response.ok) {
    throw new Error(
      await toErrorMessage(response, "Failed to run the first crawl")
    );
  }

  return (await response.json()) as CrawlCompanyApiResponse;
};
