import { NextResponse } from "next/server";
import { Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { isTrialActive, resolveEntitlements } from "@/libs/entitlements";
import { refreshTrialStatusIfExpired } from "@/libs/trial";
import Company, { type CompanyCrawlStatus } from "@/models/Company";
import DiffModel, { type DiffSeverity } from "@/models/Diff";
import User from "@/models/User";

interface CompanyStatusCountRow {
  _id: CompanyCrawlStatus;
  count: number;
}

interface VerifiedDiffCountRow {
  _id: DiffSeverity;
  count: number;
}

const CRAWL_STATUS_KEYS: CompanyCrawlStatus[] = ["idle", "ok", "blocked", "manual_needed", "error"];
const DIFF_SEVERITY_KEYS: DiffSeverity[] = ["low", "medium", "high"];

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    await connectMongo();

    const user = await User.findById(String(userId)).select({
      hasAccess: 1,
      priceId: 1,
      trialStatus: 1,
      trialStartedAt: 1,
      trialEndsAt: 1,
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    await refreshTrialStatusIfExpired(user, now);
    const entitlements = resolveEntitlements(user, now);
    const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const userObjectId = new Types.ObjectId(String(userId));

    const [selfCount, competitorCount, competitorStatusRows, verifiedDiffRows] = await Promise.all([
      Company.countDocuments({ userId: userObjectId, type: "self" }),
      Company.countDocuments({ userId: userObjectId, type: "competitor" }),
      Company.aggregate<CompanyStatusCountRow>([
        {
          $match: {
            userId: userObjectId,
            type: "competitor",
          },
        },
        {
          $group: {
            _id: "$lastCrawlStatus",
            count: { $sum: 1 },
          },
        },
      ]),
      DiffModel.aggregate<VerifiedDiffCountRow>([
        {
          $match: {
            userId: userObjectId,
            verificationState: "verified",
            detectedAt: { $gte: windowStart },
          },
        },
        {
          $group: {
            _id: "$severity",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const competitorStatusCounts: Record<CompanyCrawlStatus, number> = {
      idle: 0,
      ok: 0,
      blocked: 0,
      manual_needed: 0,
      error: 0,
    };

    for (const statusKey of CRAWL_STATUS_KEYS) {
      const statusRow = competitorStatusRows.find((row) => row._id === statusKey);
      competitorStatusCounts[statusKey] = statusRow?.count ?? 0;
    }

    const verifiedCountsBySeverity: Record<DiffSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    for (const severityKey of DIFF_SEVERITY_KEYS) {
      const severityRow = verifiedDiffRows.find((row) => row._id === severityKey);
      verifiedCountsBySeverity[severityKey] = severityRow?.count ?? 0;
    }

    const verifiedTotal =
      verifiedCountsBySeverity.low + verifiedCountsBySeverity.medium + verifiedCountsBySeverity.high;

    return NextResponse.json({
      entitlements,
      trial: {
        status: user.trialStatus,
        startedAt: user.trialStartedAt,
        endsAt: user.trialEndsAt,
        isActive: isTrialActive(user, now),
      },
      companyCounts: {
        self: selfCount,
        competitor: competitorCount,
        total: selfCount + competitorCount,
      },
      competitorStatusCounts,
      recentVerifiedChanges7d: {
        windowStart,
        countsBySeverity: verifiedCountsBySeverity,
        total: verifiedTotal,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load dashboard overview" }, { status: 500 });
  }
}
