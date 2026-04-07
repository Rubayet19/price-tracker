import { NextResponse } from "next/server";
import { type Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/auth";
import {
  classifyPricingModel,
  getComparisonCadences,
  type PricePeriod,
  type PricingModel,
} from "@/libs/crawler/normalize";
import { normalizeSelfPricingProfile } from "@/libs/self-pricing";
import Company, { type CompanyCrawlStatus } from "@/models/Company";
import SelfPricingProfile from "@/models/SelfPricingProfile";
import SnapshotModel from "@/models/Snapshot";
import type { PricingUrlCandidate } from "@/types/companies";

interface CompanyLean {
  _id: Types.ObjectId;
  name: string;
  domain: string;
  type: "self" | "competitor";
  homepageUrl?: string;
  primaryPricingUrl?: string;
  pricingUrlCandidates: PricingUrlCandidate[];
  lastCrawlStatus: CompanyCrawlStatus;
  lastCrawlAt?: Date;
  lastCrawlError?: string;
  latestConfidence?: number;
}

interface SnapshotLean {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  capturedAt: Date;
  confidence: number;
  isVerified: boolean;
  pricingPayload: Record<string, unknown>;
}

interface PricePoint {
  amount: number;
  currency: string;
  period: PricePeriod;
}

interface PricePointBucket {
  currency: string;
  period: string;
  count: number;
  minAmount: number;
  maxAmount: number;
}

interface ExtractedPlan {
  name: string;
  currency: string | null;
  monthlyPrice: number | null;
  annualPrice: number | null;
  annualPriceIsPerMonth: boolean;
  description: string | null;
  features: string[];
  hasFreeTrial: boolean | null;
  trialDetails: string | null;
}

interface ExtractionDebug {
  scopeStrategy?: "full_page" | "pricing_section" | "anchored_segment" | "playwright";
  enrichmentSources?: Array<"jsonld" | "script" | "llm">;
  candidateCount?: number;
  selectedCandidateLabel?: string | null;
  selectedCandidateScore?: number;
  selectedPlanTexts?: string[];
  toggleLabels?: string[];
  clickedCadences?: Array<"month" | "year">;
  failureReason?: string | null;
}

const isPricePeriod = (value: string): value is PricePeriod => {
  return ["day", "week", "month", "year", "one_time", "unknown"].includes(
    value
  );
};

interface ComparisonClassification {
  pricingModel: PricingModel;
  comparisonCadences: Array<"month" | "year">;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toPricePoints = (payload: Record<string, unknown>): PricePoint[] => {
  const rawPriceMentions = payload.priceMentions;
  if (!Array.isArray(rawPriceMentions)) {
    return [];
  }

  const pricePoints: PricePoint[] = [];

  for (const entry of rawPriceMentions) {
    if (!isRecord(entry)) {
      continue;
    }

    const amount = entry.amount;
    const currency = entry.currency;
    const period = entry.period;

    if (typeof amount !== "number" || !Number.isFinite(amount)) {
      continue;
    }

    if (typeof currency !== "string" || !currency.trim()) {
      continue;
    }

    if (typeof period !== "string" || !period.trim()) {
      continue;
    }

    const normalizedPeriod = period.trim().toLowerCase();
    if (!isPricePeriod(normalizedPeriod)) {
      continue;
    }

    pricePoints.push({
      amount,
      currency: currency.trim().toUpperCase(),
      period: normalizedPeriod,
    });
  }

  return pricePoints;
};

const toPricePointBuckets = (
  pricePoints: ReadonlyArray<PricePoint>
): PricePointBucket[] => {
  const bucketMap = new Map<string, PricePointBucket>();

  for (const point of pricePoints) {
    const key = `${point.currency}|${point.period}`;
    const existingBucket = bucketMap.get(key);

    if (!existingBucket) {
      bucketMap.set(key, {
        currency: point.currency,
        period: point.period,
        count: 1,
        minAmount: point.amount,
        maxAmount: point.amount,
      });
      continue;
    }

    existingBucket.count += 1;
    existingBucket.minAmount = Math.min(existingBucket.minAmount, point.amount);
    existingBucket.maxAmount = Math.max(existingBucket.maxAmount, point.amount);
  }

  return [...bucketMap.values()].sort((left, right) => {
    if (left.currency !== right.currency) {
      return left.currency.localeCompare(right.currency);
    }

    return left.period.localeCompare(right.period);
  });
};

const toExtractedPlans = (
  payload: Record<string, unknown>
): ExtractedPlan[] => {
  const rawExtractedPlans = payload.extractedPlans;
  if (!Array.isArray(rawExtractedPlans)) {
    return [];
  }

  return rawExtractedPlans
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const currency =
        typeof entry.currency === "string" && entry.currency.trim().length > 0
          ? entry.currency.trim().toUpperCase()
          : null;
      const monthlyPrice =
        typeof entry.monthlyPrice === "number" &&
        Number.isFinite(entry.monthlyPrice)
          ? entry.monthlyPrice
          : null;
      const annualPrice =
        typeof entry.annualPrice === "number" &&
        Number.isFinite(entry.annualPrice)
          ? entry.annualPrice
          : null;

      if (!name || (monthlyPrice === null && annualPrice === null)) {
        return null;
      }

      return {
        name,
        currency,
        monthlyPrice,
        annualPrice,
        annualPriceIsPerMonth: entry.annualPriceIsPerMonth === true,
        description:
          typeof entry.description === "string" && entry.description.trim()
            ? entry.description.trim()
            : null,
        features: Array.isArray(entry.features)
          ? entry.features.filter(
              (feature): feature is string => typeof feature === "string"
            )
          : [],
        hasFreeTrial:
          typeof entry.hasFreeTrial === "boolean" ? entry.hasFreeTrial : null,
        trialDetails:
          typeof entry.trialDetails === "string" && entry.trialDetails.trim()
            ? entry.trialDetails.trim()
            : null,
      };
    })
    .filter((plan): plan is ExtractedPlan => plan !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
};

const toExtractionDebug = (
  payload: Record<string, unknown>
): ExtractionDebug | null => {
  const rawDebug = payload.extractionDebug;
  if (!isRecord(rawDebug)) {
    return null;
  }

  const debug: ExtractionDebug = {};

  if (
    rawDebug.scopeStrategy === "full_page" ||
    rawDebug.scopeStrategy === "pricing_section" ||
    rawDebug.scopeStrategy === "anchored_segment" ||
    rawDebug.scopeStrategy === "playwright"
  ) {
    debug.scopeStrategy = rawDebug.scopeStrategy;
  }

  if (Array.isArray(rawDebug.enrichmentSources)) {
    debug.enrichmentSources = rawDebug.enrichmentSources.filter(
      (entry): entry is "jsonld" | "script" | "llm" =>
        entry === "jsonld" || entry === "script" || entry === "llm"
    );
  }

  if (typeof rawDebug.candidateCount === "number") {
    debug.candidateCount = rawDebug.candidateCount;
  }

  if (
    typeof rawDebug.selectedCandidateLabel === "string" ||
    rawDebug.selectedCandidateLabel === null
  ) {
    debug.selectedCandidateLabel = rawDebug.selectedCandidateLabel as
      | string
      | null;
  }

  if (typeof rawDebug.selectedCandidateScore === "number") {
    debug.selectedCandidateScore = rawDebug.selectedCandidateScore;
  }

  if (Array.isArray(rawDebug.selectedPlanTexts)) {
    debug.selectedPlanTexts = rawDebug.selectedPlanTexts.filter(
      (entry): entry is string => typeof entry === "string"
    );
  }

  if (Array.isArray(rawDebug.toggleLabels)) {
    debug.toggleLabels = rawDebug.toggleLabels.filter(
      (entry): entry is string => typeof entry === "string"
    );
  }

  if (Array.isArray(rawDebug.clickedCadences)) {
    debug.clickedCadences = rawDebug.clickedCadences.filter(
      (entry): entry is "month" | "year" =>
        entry === "month" || entry === "year"
    );
  }

  if (
    typeof rawDebug.failureReason === "string" ||
    rawDebug.failureReason === null
  ) {
    debug.failureReason = rawDebug.failureReason as string | null;
  }

  return Object.keys(debug).length > 0 ? debug : null;
};

const toComparisonClassification = (
  payload: Record<string, unknown>,
  pricePoints: ReadonlyArray<PricePoint>,
  extractedPlans: ReadonlyArray<ExtractedPlan>
): ComparisonClassification => {
  const customPricingHints = Array.isArray(payload.customPricingHints)
    ? payload.customPricingHints.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];
  const oneTimePricingHints = Array.isArray(payload.oneTimePricingHints)
    ? payload.oneTimePricingHints.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : [];

  const rawPricingModel =
    typeof payload.pricingModel === "string" ? payload.pricingModel : null;
  const pricingModel =
    rawPricingModel === "monthly_only" ||
    rawPricingModel === "annual_only" ||
    rawPricingModel === "mixed_recurring" ||
    rawPricingModel === "one_time" ||
    rawPricingModel === "custom_only" ||
    rawPricingModel === "unknown"
      ? rawPricingModel
      : classifyPricingModel({
          priceMentions: pricePoints,
          extractedPlans,
          customPricingHints,
          oneTimePricingHints,
        });

  const rawComparisonCadences = Array.isArray(payload.comparisonCadences)
    ? payload.comparisonCadences.filter(
        (entry): entry is "month" | "year" =>
          entry === "month" || entry === "year"
      )
    : [];

  return {
    pricingModel,
    comparisonCadences:
      rawComparisonCadences.length > 0
        ? rawComparisonCadences
        : getComparisonCadences({
            priceMentions: pricePoints,
            extractedPlans,
          }),
  };
};

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    await connectMongo();

    const [selfPricingProfile, competitorCompanies] = await Promise.all([
      SelfPricingProfile.findOne({ userId: String(userId) })
        .lean<Record<string, unknown> | null>()
        .exec(),
      Company.find({ userId: String(userId), type: "competitor" })
        .sort({ name: 1 })
        .lean<CompanyLean[]>()
        .exec(),
    ]);

    const competitorCompanyIds = competitorCompanies.map(
      (company) => company._id
    );

    const latestSnapshotByCompanyId = new Map<string, SnapshotLean>();

    if (competitorCompanyIds.length > 0) {
      const latestSnapshots = await SnapshotModel.aggregate<
        SnapshotLean & { _id: Types.ObjectId }
      >([
        { $match: { companyId: { $in: competitorCompanyIds } } },
        { $sort: { companyId: 1, capturedAt: -1 } },
        {
          $group: {
            _id: "$companyId",
            snapshotId: { $first: "$_id" },
            companyId: { $first: "$companyId" },
            capturedAt: { $first: "$capturedAt" },
            confidence: { $first: "$confidence" },
            isVerified: { $first: "$isVerified" },
            pricingPayload: { $first: "$pricingPayload" },
          },
        },
        {
          $addFields: {
            _id: "$snapshotId",
          },
        },
      ]).exec();

      for (const snapshot of latestSnapshots) {
        latestSnapshotByCompanyId.set(snapshot.companyId.toString(), snapshot);
      }
    }

    const competitors = competitorCompanies.map((company) => {
      const latestSnapshot = latestSnapshotByCompanyId.get(
        company._id.toString()
      );
      const pricePoints = latestSnapshot
        ? toPricePoints(latestSnapshot.pricingPayload)
        : [];
      const pricePointBuckets = toPricePointBuckets(pricePoints);
      const extractedPlans = latestSnapshot
        ? toExtractedPlans(latestSnapshot.pricingPayload)
        : [];
      const comparisonClassification = latestSnapshot
        ? toComparisonClassification(
            latestSnapshot.pricingPayload,
            pricePoints,
            extractedPlans
          )
        : { pricingModel: "unknown" as const, comparisonCadences: [] };
      const blockedOrManualNeeded =
        company.lastCrawlStatus === "blocked" ||
        company.lastCrawlStatus === "manual_needed";

      return {
        companyId: company._id.toString(),
        name: company.name,
        domain: company.domain,
        homepageUrl: company.homepageUrl ?? null,
        primaryPricingUrl: company.primaryPricingUrl ?? null,
        pricingUrlCandidates: company.pricingUrlCandidates ?? [],
        trust: {
          blockedOrManualNeeded,
          lastCrawlStatus: company.lastCrawlStatus,
          lastCrawlAt: company.lastCrawlAt ?? null,
          lastCrawlError: company.lastCrawlError ?? null,
          latestConfidence: company.latestConfidence ?? null,
        },
        latestSnapshot: latestSnapshot
          ? {
              snapshotId: latestSnapshot._id.toString(),
              capturedAt: latestSnapshot.capturedAt,
              confidence: latestSnapshot.confidence,
              isVerified: latestSnapshot.isVerified,
              pageDescription:
                typeof latestSnapshot.pricingPayload.pageDescription === "string"
                  ? latestSnapshot.pricingPayload.pageDescription
                  : null,
              pricingModel: comparisonClassification.pricingModel,
              comparisonCadences: comparisonClassification.comparisonCadences,
              pricePoints,
              pricePointBuckets,
              extractedPlans,
              extractionDebug: toExtractionDebug(latestSnapshot.pricingPayload),
            }
          : null,
      };
    });

    return NextResponse.json({
      selfPricingProfile: normalizeSelfPricingProfile(selfPricingProfile),
      competitors,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to load dashboard comparison" },
      { status: 500 }
    );
  }
}
