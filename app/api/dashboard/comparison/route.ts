import { NextResponse } from "next/server";
import { type Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import Company, { type CompanyCrawlStatus } from "@/models/Company";
import SelfPricingProfile from "@/models/SelfPricingProfile";
import SnapshotModel from "@/models/Snapshot";

interface CompanyLean {
  _id: Types.ObjectId;
  name: string;
  domain: string;
  type: "self" | "competitor";
  primaryPricingUrl?: string;
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
  period: string;
}

interface PricePointBucket {
  currency: string;
  period: string;
  count: number;
  minAmount: number;
  maxAmount: number;
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

    pricePoints.push({
      amount,
      currency: currency.trim().toUpperCase(),
      period: period.trim().toLowerCase(),
    });
  }

  return pricePoints;
};

const toPricePointBuckets = (pricePoints: ReadonlyArray<PricePoint>): PricePointBucket[] => {
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

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    await connectMongo();

    const [selfPricingProfile, competitorCompanies] = await Promise.all([
      SelfPricingProfile.findOne({ userId: String(userId) }),
      Company.find({ userId: String(userId), type: "competitor" })
        .sort({ name: 1 })
        .lean<CompanyLean[]>()
        .exec(),
    ]);

    const competitorCompanyIds = competitorCompanies.map((company) => company._id);
    const competitorSnapshots =
      competitorCompanyIds.length > 0
        ? await SnapshotModel.find({ companyId: { $in: competitorCompanyIds } })
            .sort({ capturedAt: -1 })
            .lean<SnapshotLean[]>()
            .exec()
        : [];

    const latestSnapshotByCompanyId = new Map<string, SnapshotLean>();

    for (const snapshot of competitorSnapshots) {
      const companyId = snapshot.companyId.toString();
      if (!latestSnapshotByCompanyId.has(companyId)) {
        latestSnapshotByCompanyId.set(companyId, snapshot);
      }
    }

    const competitors = competitorCompanies.map((company) => {
      const latestSnapshot = latestSnapshotByCompanyId.get(company._id.toString());
      const pricePoints = latestSnapshot ? toPricePoints(latestSnapshot.pricingPayload) : [];
      const pricePointBuckets = toPricePointBuckets(pricePoints);
      const blockedOrManualNeeded =
        company.lastCrawlStatus === "blocked" || company.lastCrawlStatus === "manual_needed";

      return {
        companyId: company._id.toString(),
        name: company.name,
        domain: company.domain,
        primaryPricingUrl: company.primaryPricingUrl ?? null,
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
              pricePoints,
              pricePointBuckets,
            }
          : null,
      };
    });

    return NextResponse.json({
      selfPricingProfile: selfPricingProfile ?? null,
      competitors,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load dashboard comparison" }, { status: 500 });
  }
}
