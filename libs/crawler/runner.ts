import type { FilterQuery, HydratedDocument, Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import {
  BLOCKED_BACKOFF_MS,
  CRAWL_BATCH_LIMIT,
  CRAWL_LEASE_MS,
  ERROR_BACKOFF_MS,
  MAX_CRAWL_BATCH_LIMIT,
  MANUAL_NEEDED_BACKOFF_MS,
  SUCCESS_CRAWL_DELAY_MS,
} from "@/libs/crawler/constants";
import { generatePricingDiff } from "@/libs/crawler/diff";
import { fetchAndExtractPricing } from "@/libs/crawler/extract";
import { buildInsightFromDiff, type InsightEligibleUser } from "@/libs/crawler/insight";
import {
  canonicalizePricingPayload,
  type NormalizedPricingPayload,
  type PricePeriod,
} from "@/libs/crawler/normalize";
import {
  discoverPricingUrlsFromHomepage,
  mergePricingUrlCandidates,
} from "@/libs/crawler/discovery";
import { createAuditEventSafe } from "@/libs/audit-events";
import { resolveEntitlements } from "@/libs/entitlements";
import Company, {
  type CompanyCrawlStatus,
  type ICompany,
  type IPricingUrlCandidate,
} from "@/models/Company";
import Diff from "@/models/Diff";
import Insight from "@/models/Insight";
import SnapshotModel, { type Snapshot } from "@/models/Snapshot";
import User from "@/models/User";

interface SnapshotRecord extends Snapshot {
  _id: Types.ObjectId;
}

interface RawPricePointRecord {
  amount: unknown;
  currency: unknown;
  period: unknown;
}

interface CrawlCompanyResult {
  companyId: string;
  status: CompanyCrawlStatus;
  changed: boolean;
  snapshotCreated: boolean;
  diffCreated: boolean;
  insightCreated: boolean;
  skippedByHash: boolean;
  reason?: string;
}

export interface CrawlBatchResult {
  startedAt: string;
  completedAt: string;
  limit: number;
  claimed: number;
  processed: number;
  changed: number;
  unchanged: number;
  snapshotsCreated: number;
  diffsCreated: number;
  insightsCreated: number;
  blocked: number;
  manualNeeded: number;
  errored: number;
  items: CrawlCompanyResult[];
}

interface RunCrawlBatchOptions {
  limit?: number;
  now?: Date;
}

type CrawlErrorAuditEventType = "crawl_blocked" | "crawl_manual_needed" | "crawl_error";

type ClaimedCompany = HydratedDocument<ICompany>;

const isAllowedPeriod = (period: string): period is PricePeriod => {
  return ["day", "week", "month", "year", "one_time", "unknown"].includes(period);
};

const toNormalizedPayload = (
  payload: Record<string, unknown> | null | undefined
): NormalizedPricingPayload | null => {
  if (!payload) {
    return null;
  }

  const sourceUrl = typeof payload.sourceUrl === "string" ? payload.sourceUrl : null;
  if (!sourceUrl) {
    return null;
  }

  const pageTitle = typeof payload.pageTitle === "string" ? payload.pageTitle : null;
  const pageDescription = typeof payload.pageDescription === "string" ? payload.pageDescription : null;

  const planNames = Array.isArray(payload.planNames)
    ? payload.planNames.filter((item): item is string => typeof item === "string")
    : [];

  const customPricingHints = Array.isArray(payload.customPricingHints)
    ? payload.customPricingHints.filter((item): item is string => typeof item === "string")
    : [];

  const rawPrices = Array.isArray(payload.priceMentions)
    ? (payload.priceMentions as RawPricePointRecord[])
    : [];

  const priceMentions = rawPrices
    .map((entry) => {
      const amount = typeof entry.amount === "number" ? entry.amount : Number(entry.amount);
      const currency = typeof entry.currency === "string" ? entry.currency : null;
      const period = typeof entry.period === "string" ? entry.period : null;

      if (!Number.isFinite(amount) || amount <= 0 || !currency || !period || !isAllowedPeriod(period)) {
        return null;
      }

      return {
        amount,
        currency,
        period,
      };
    })
    .filter((entry): entry is { amount: number; currency: string; period: PricePeriod } => !!entry);

  return canonicalizePricingPayload({
    sourceUrl,
    pageTitle,
    pageDescription,
    planNames,
    priceMentions,
    customPricingHints,
  });
};

const clampBatchLimit = (value: number | undefined): number => {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return CRAWL_BATCH_LIMIT;
  }

  return Math.min(Math.floor(value), MAX_CRAWL_BATCH_LIMIT);
};

const leaseFilter = (now: Date): FilterQuery<ICompany> => {
  return {
    type: "competitor",
    $and: [
      {
        $or: [{ nextCrawlAt: { $exists: false } }, { nextCrawlAt: { $lte: now } }],
      },
      {
        $or: [
          { crawlLeaseUntil: { $exists: false } },
          { crawlLeaseUntil: null },
          { crawlLeaseUntil: { $lte: now } },
        ],
      },
    ],
  };
};

const claimCompanies = async (limit: number, now: Date): Promise<ClaimedCompany[]> => {
  const claimed: ClaimedCompany[] = [];
  const leaseUntil = new Date(now.getTime() + CRAWL_LEASE_MS);

  for (let index = 0; index < limit; index += 1) {
    const company = await Company.findOneAndUpdate(
      leaseFilter(now),
      {
        $set: {
          crawlLeaseUntil: leaseUntil,
        },
      },
      {
        sort: { nextCrawlAt: 1, updatedAt: 1 },
        new: true,
      }
    ).exec();

    if (!company) {
      break;
    }

    claimed.push(company);
  }

  return claimed;
};

const statusToNextDelayMs = (status: CompanyCrawlStatus): number => {
  if (status === "blocked") {
    return BLOCKED_BACKOFF_MS;
  }

  if (status === "manual_needed") {
    return MANUAL_NEEDED_BACKOFF_MS;
  }

  if (status === "error") {
    return ERROR_BACKOFF_MS;
  }

  return SUCCESS_CRAWL_DELAY_MS;
};

const truncateError = (value: string): string => {
  if (value.length <= 400) {
    return value;
  }

  return `${value.slice(0, 397)}...`;
};

const getCompanyId = (company: ClaimedCompany): Types.ObjectId => {
  return company._id as Types.ObjectId;
};

const processCompany = async (company: ClaimedCompany, now: Date): Promise<CrawlCompanyResult> => {
  const companyId = getCompanyId(company);

  let finalStatus: CompanyCrawlStatus = "error";
  let finalErrorMessage: string | null = "Crawler failed before execution";
  let latestContentHash: string | null = null;
  let latestConfidence: number | null = null;
  let discoveredPrimaryPricingUrl: string | null = null;
  let discoveredCandidates: IPricingUrlCandidate[] | null = null;
  let attemptedDiscovery = false;

  let changed = false;
  let snapshotCreated = false;
  let diffCreated = false;
  let insightCreated = false;
  let skippedByHash = false;

  try {
    let sourceUrl = company.primaryPricingUrl ?? null;

    if (!sourceUrl && company.homepageUrl) {
      attemptedDiscovery = true;

      const discovery = await discoverPricingUrlsFromHomepage({
        homepageUrl: company.homepageUrl,
        allowedDomain: company.domain,
      });

      discoveredCandidates = mergePricingUrlCandidates(company.pricingUrlCandidates, discovery.candidates);
      discoveredPrimaryPricingUrl = discovery.recommendedPrimaryUrl;

      if (discoveredPrimaryPricingUrl) {
        sourceUrl = discoveredPrimaryPricingUrl;
      }
    }

    if (!sourceUrl) {
      finalStatus = "manual_needed";
      finalErrorMessage = "No crawl URL is available";
      return {
        companyId: companyId.toString(),
        status: finalStatus,
        changed,
        snapshotCreated,
        diffCreated,
        insightCreated,
        skippedByHash,
        reason: finalErrorMessage,
      };
    }

    const user = await User.findById(company.userId)
      .select({
        hasAccess: 1,
        priceId: 1,
        trialStatus: 1,
        trialStartedAt: 1,
        trialEndsAt: 1,
      })
      .lean<InsightEligibleUser>()
      .exec();

    if (!user) {
      finalStatus = "error";
      finalErrorMessage = "User not found for company";
      return {
        companyId: companyId.toString(),
        status: finalStatus,
        changed,
        snapshotCreated,
        diffCreated,
        insightCreated,
        skippedByHash,
        reason: finalErrorMessage,
      };
    }

    const entitlements = resolveEntitlements(user, now);
    if (!entitlements.hasAccess) {
      finalStatus = "idle";
      finalErrorMessage = "User is not eligible for competitor crawling";
      return {
        companyId: companyId.toString(),
        status: finalStatus,
        changed,
        snapshotCreated,
        diffCreated,
        insightCreated,
        skippedByHash,
        reason: finalErrorMessage,
      };
    }

    const extraction = await fetchAndExtractPricing(sourceUrl);

    if (extraction.status !== "ok") {
      finalStatus = extraction.status;
      finalErrorMessage = extraction.error;

      return {
        companyId: companyId.toString(),
        status: finalStatus,
        changed,
        snapshotCreated,
        diffCreated,
        insightCreated,
        skippedByHash,
        reason: finalErrorMessage,
      };
    }

    latestContentHash = extraction.contentHash;
    latestConfidence = extraction.confidence;

    if (company.latestContentHash && company.latestContentHash === extraction.contentHash) {
      finalStatus = "ok";
      finalErrorMessage = null;
      skippedByHash = true;

      return {
        companyId: companyId.toString(),
        status: finalStatus,
        changed,
        snapshotCreated,
        diffCreated,
        insightCreated,
        skippedByHash,
      };
    }

    const previousSnapshot = await SnapshotModel.findOne({ companyId })
      .sort({ capturedAt: -1 })
      .lean<SnapshotRecord>()
      .exec();

    const currentSnapshot = await SnapshotModel.create({
      userId: company.userId,
      companyId,
      capturedAt: now,
      captureMethod: extraction.captureMethod,
      confidence: extraction.confidence,
      contentHash: extraction.contentHash,
      pricingPayload: extraction.pricingPayload,
      isVerified: extraction.isVerified,
    });

    snapshotCreated = true;
    changed = true;

    const previousPayload = toNormalizedPayload(previousSnapshot?.pricingPayload);
    if (previousSnapshot && previousPayload) {
      const diff = generatePricingDiff(previousPayload, extraction.pricingPayload, extraction.isVerified);

      if (diff) {
        const diffRecord = await Diff.create({
          userId: company.userId,
          companyId,
          previousSnapshotId: previousSnapshot._id,
          currentSnapshotId: currentSnapshot._id,
          normalizedDiff: diff.normalizedDiff,
          severity: diff.severity,
          verificationState: diff.verificationState,
          detectedAt: now,
        });

        diffCreated = true;

        const insight = buildInsightFromDiff({
          user,
          companyId,
          diffId: diffRecord._id as Types.ObjectId,
          severity: diff.severity,
          verificationState: diff.verificationState,
          normalizedDiff: diff.normalizedDiff,
          now,
        });

        if (insight.shouldCreate && insight.createInput) {
          await Insight.create(insight.createInput);
          insightCreated = true;
        }
      }
    }

    finalStatus = "ok";
    finalErrorMessage = null;

    return {
      companyId: companyId.toString(),
      status: finalStatus,
      changed,
      snapshotCreated,
      diffCreated,
      insightCreated,
      skippedByHash,
    };
  } catch (error) {
    finalStatus = "error";
    finalErrorMessage = error instanceof Error ? error.message : "Unexpected crawler error";

    return {
      companyId: companyId.toString(),
      status: finalStatus,
      changed,
      snapshotCreated,
      diffCreated,
      insightCreated,
      skippedByHash,
      reason: finalErrorMessage,
    };
  } finally {
    const nextCrawlAt = new Date(now.getTime() + statusToNextDelayMs(finalStatus));

    const setPayload: Record<string, unknown> = {
      crawlLeaseUntil: null,
      nextCrawlAt,
      lastCrawlAt: now,
      lastCrawlStatus: finalStatus,
    };

    if (typeof latestContentHash === "string") {
      setPayload.latestContentHash = latestContentHash;
    }

    if (typeof latestConfidence === "number") {
      setPayload.latestConfidence = latestConfidence;
    }

    if (attemptedDiscovery) {
      setPayload.pricingUrlCandidates = discoveredCandidates ?? company.pricingUrlCandidates;
    }

    if (!company.primaryPricingUrl && discoveredPrimaryPricingUrl) {
      setPayload.primaryPricingUrl = discoveredPrimaryPricingUrl;
    }

    if (finalErrorMessage) {
      setPayload.lastCrawlError = truncateError(finalErrorMessage);
    }

    const unsetPayload: Record<string, 1> = {};
    if (!finalErrorMessage) {
      unsetPayload.lastCrawlError = 1;
    }

    const updatePayload: {
      $set: Record<string, unknown>;
      $unset?: Record<string, 1>;
    } = {
      $set: setPayload,
    };

    if (Object.keys(unsetPayload).length > 0) {
      updatePayload.$unset = unsetPayload;
    }

    await Company.updateOne({ _id: companyId }, updatePayload).exec();

    const auditEventTypeByStatus: Partial<Record<CompanyCrawlStatus, CrawlErrorAuditEventType>> = {
      blocked: "crawl_blocked",
      manual_needed: "crawl_manual_needed",
      error: "crawl_error",
    };
    const auditEventType = auditEventTypeByStatus[finalStatus];
    if (auditEventType) {
      await createAuditEventSafe({
        eventType: auditEventType,
        source: "crawler:runner",
        userId: company.userId,
        companyId,
        metadata: {
          status: finalStatus,
          reason: finalErrorMessage,
          nextCrawlAt,
        },
      });
    }
  }
};

export const runCrawlBatch = async (options: RunCrawlBatchOptions = {}): Promise<CrawlBatchResult> => {
  await connectMongo();

  const startedAtDate = options.now ?? new Date();
  const limit = clampBatchLimit(options.limit);
  const claimedCompanies = await claimCompanies(limit, startedAtDate);

  const items: CrawlCompanyResult[] = [];
  let changed = 0;
  let unchanged = 0;
  let snapshotsCreated = 0;
  let diffsCreated = 0;
  let insightsCreated = 0;
  let blocked = 0;
  let manualNeeded = 0;
  let errored = 0;

  for (const company of claimedCompanies) {
    const result = await processCompany(company, new Date());
    items.push(result);

    if (result.changed) {
      changed += 1;
    } else {
      unchanged += 1;
    }

    if (result.snapshotCreated) {
      snapshotsCreated += 1;
    }

    if (result.diffCreated) {
      diffsCreated += 1;
    }

    if (result.insightCreated) {
      insightsCreated += 1;
    }

    if (result.status === "blocked") {
      blocked += 1;
    }

    if (result.status === "manual_needed") {
      manualNeeded += 1;
    }

    if (result.status === "error") {
      errored += 1;
    }
  }

  return {
    startedAt: startedAtDate.toISOString(),
    completedAt: new Date().toISOString(),
    limit,
    claimed: claimedCompanies.length,
    processed: items.length,
    changed,
    unchanged,
    snapshotsCreated,
    diffsCreated,
    insightsCreated,
    blocked,
    manualNeeded,
    errored,
    items,
  };
};
