import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { acquireCronLock, releaseCronLock } from "@/libs/cron-lock";
import { requireCronAuth } from "@/libs/cron-auth";
import { canReceiveWeeklyDigest, resolveEntitlements } from "@/libs/entitlements";
import connectMongo from "@/libs/mongoose";
import Company from "@/models/Company";
import Diff from "@/models/Diff";
import User from "@/models/User";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIGEST_LOOKBACK_DAYS = 7;
const MAX_DIFFS_PER_USER = 30;
const DIGEST_CRON_LOCK_KEY = "cron:digest";
const DIGEST_CRON_LOCK_TTL_MS = 45 * 60 * 1000;

interface DigestEligibleUser {
  _id: Types.ObjectId;
  email?: string;
  hasAccess: boolean;
  priceId?: string | null;
  trialStatus: "not_started" | "active" | "expired" | "converted";
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  lastDigestSentAt: Date | null;
}

interface VerifiedDiffRecord {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  severity: "low" | "medium" | "high";
  detectedAt: Date;
}

interface CompanyNameRecord {
  _id: Types.ObjectId;
  name: string;
}

interface SendDigestResult {
  ok: boolean;
  error?: string;
}

const getLookbackStart = (now: Date): Date => {
  return new Date(now.getTime() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
};

const formatDateTime = (value: Date): string => {
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
};

const buildDigestEmail = (
  diffs: VerifiedDiffRecord[],
  companyNameById: Map<string, string>,
  lookbackStart: Date,
  now: Date
): { subject: string; text: string; html: string } => {
  const severityCounts = {
    high: diffs.filter((diff) => diff.severity === "high").length,
    medium: diffs.filter((diff) => diff.severity === "medium").length,
    low: diffs.filter((diff) => diff.severity === "low").length,
  };

  const lines = diffs.map((diff) => {
    const companyName = companyNameById.get(diff.companyId.toString()) ?? "Unknown company";
    return `- [${diff.severity.toUpperCase()}] ${companyName} at ${formatDateTime(diff.detectedAt)}`;
  });

  const subject = `Weekly pricing digest: ${diffs.length} verified change${diffs.length === 1 ? "" : "s"}`;
  const text = [
    `Verified pricing changes from ${formatDateTime(lookbackStart)} to ${formatDateTime(now)}:`,
    `High: ${severityCounts.high}, Medium: ${severityCounts.medium}, Low: ${severityCounts.low}`,
    "",
    ...lines,
  ].join("\n");

  const htmlItems = diffs
    .map((diff) => {
      const companyName = companyNameById.get(diff.companyId.toString()) ?? "Unknown company";
      return `<li><strong>${diff.severity.toUpperCase()}</strong> - ${companyName} at ${formatDateTime(diff.detectedAt)}</li>`;
    })
    .join("");

  const html = `
    <div>
      <p>Verified pricing changes from <strong>${formatDateTime(lookbackStart)}</strong> to <strong>${formatDateTime(now)}</strong>.</p>
      <p>High: ${severityCounts.high}, Medium: ${severityCounts.medium}, Low: ${severityCounts.low}</p>
      <ul>${htmlItems}</ul>
    </div>
  `;

  return {
    subject,
    text,
    html,
  };
};

const sendDigestEmail = async (args: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendDigestResult> => {
  try {
    const resend = await import("@/libs/resend");
    await resend.sendEmail(args);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Digest email send failed";
    return {
      ok: false,
      error: message,
    };
  }
};

const handleDigest = async (): Promise<NextResponse> => {
  const now = new Date();
  const lookbackStart = getLookbackStart(now);

  await connectMongo();

  const users = await User.find({ email: { $exists: true, $ne: null } })
    .select({
      email: 1,
      hasAccess: 1,
      priceId: 1,
      trialStatus: 1,
      trialStartedAt: 1,
      trialEndsAt: 1,
      lastDigestSentAt: 1,
    })
    .lean<DigestEligibleUser[]>()
    .exec();

  let usersScanned = 0;
  let eligibleUsers = 0;
  let usersWithVerifiedDiffs = 0;
  let emailsSent = 0;
  let usersSkippedRecentlySent = 0;
  let usersSkippedNoDiffs = 0;
  let usersSkippedNoEmail = 0;
  let usersSkippedNotEligible = 0;
  let sendErrors = 0;

  const errors: Array<{ userId: string; error: string }> = [];

  for (const user of users) {
    usersScanned += 1;

    if (!user.email) {
      usersSkippedNoEmail += 1;
      continue;
    }

    const entitlements = resolveEntitlements(user, now);
    if (!canReceiveWeeklyDigest(entitlements)) {
      usersSkippedNotEligible += 1;
      continue;
    }

    eligibleUsers += 1;

    if (user.lastDigestSentAt && user.lastDigestSentAt.getTime() >= lookbackStart.getTime()) {
      usersSkippedRecentlySent += 1;
      continue;
    }

    const verifiedDiffs = await Diff.find({
      userId: user._id,
      verificationState: "verified",
      detectedAt: { $gte: lookbackStart, $lte: now },
    })
      .sort({ detectedAt: -1 })
      .limit(MAX_DIFFS_PER_USER)
      .select({ companyId: 1, severity: 1, detectedAt: 1 })
      .lean<VerifiedDiffRecord[]>()
      .exec();

    if (verifiedDiffs.length === 0) {
      usersSkippedNoDiffs += 1;
      continue;
    }

    usersWithVerifiedDiffs += 1;

    const companyIds = [...new Set(verifiedDiffs.map((diff) => diff.companyId.toString()))];
    const companies = await Company.find({ _id: { $in: companyIds } })
      .select({ name: 1 })
      .lean<CompanyNameRecord[]>()
      .exec();

    const companyNameById = new Map<string, string>();
    for (const company of companies) {
      companyNameById.set(company._id.toString(), company.name);
    }

    const digestEmail = buildDigestEmail(verifiedDiffs, companyNameById, lookbackStart, now);
    const sendResult = await sendDigestEmail({
      to: user.email,
      subject: digestEmail.subject,
      text: digestEmail.text,
      html: digestEmail.html,
    });

    if (!sendResult.ok) {
      sendErrors += 1;
      errors.push({
        userId: user._id.toString(),
        error: sendResult.error ?? "Unknown email error",
      });
      continue;
    }

    emailsSent += 1;
    await User.updateOne({ _id: user._id }, { $set: { lastDigestSentAt: now } }).exec();
  }

  return NextResponse.json(
    {
      ok: true,
      lookbackDays: DIGEST_LOOKBACK_DAYS,
      lookbackStart: lookbackStart.toISOString(),
      now: now.toISOString(),
      summary: {
        usersScanned,
        eligibleUsers,
        usersWithVerifiedDiffs,
        emailsSent,
        usersSkippedRecentlySent,
        usersSkippedNoDiffs,
        usersSkippedNoEmail,
        usersSkippedNotEligible,
        sendErrors,
      },
      errors,
    },
    { status: 200 }
  );
};

const handle = async (request: NextRequest): Promise<NextResponse> => {
  const unauthorizedResponse = requireCronAuth(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    await connectMongo();
    const lock = await acquireCronLock({
      key: DIGEST_CRON_LOCK_KEY,
      ttlMs: DIGEST_CRON_LOCK_TTL_MS,
    });

    if (!lock.acquired) {
      return NextResponse.json(
        {
          ok: true,
          skipped: true,
          reason: "lock_active",
          retryAfterSeconds: lock.retryAfterSeconds,
          lockUntil: lock.lockUntil.toISOString(),
        },
        { status: 202 }
      );
    }

    try {
      const response = await handleDigest();
      return response;
    } finally {
      await releaseCronLock(DIGEST_CRON_LOCK_KEY, lock.ownerId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run weekly digest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
