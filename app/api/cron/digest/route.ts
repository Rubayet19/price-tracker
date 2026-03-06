import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { acquireCronLock, releaseCronLock } from "@/libs/cron-lock";
import { requireCronAuth } from "@/libs/cron-auth";
import {
  canReceiveWeeklyDigest,
  resolveEntitlements,
} from "@/libs/entitlements";
import connectMongo from "@/libs/mongoose";
import Company from "@/models/Company";
import Diff from "@/models/Diff";
import Insight from "@/models/Insight";
import User from "@/models/User";
import config from "@/config";

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
  normalizedDiff?: Record<string, unknown>;
}

interface CompanyNameRecord {
  _id: Types.ObjectId;
  name: string;
}

interface InsightRecord {
  _id: Types.ObjectId;
  diffId: Types.ObjectId;
  recommendation: Record<string, unknown>;
}

interface SendDigestResult {
  ok: boolean;
  error?: string;
}

interface PlanChangeEntry {
  planName?: string;
  type: string;
  previousAmount?: number;
  currentAmount?: number;
  deltaPercent?: number;
  period?: string;
}

const getLookbackStart = (now: Date): Date => {
  return new Date(now.getTime() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
};

const formatDateTime = (value: Date): string => {
  return value.toISOString().replace("T", " ").slice(0, 16) + " UTC";
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: "#fef2f2", text: "#b91c1c" },
  medium: { bg: "#fff7ed", text: "#c2410c" },
  low: { bg: "#f8fafc", text: "#475569" },
};

const BRAND_COLOR = config.colors.main;

const formatPlanChanges = (
  normalizedDiff: Record<string, unknown> | undefined
): string[] => {
  if (!normalizedDiff) return [];
  const planChangesRaw = normalizedDiff.planChanges;
  if (!Array.isArray(planChangesRaw)) return [];

  const lines: string[] = [];
  for (const entry of planChangesRaw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      continue;
    const pc = entry as PlanChangeEntry;
    const name = typeof pc.planName === "string" ? pc.planName : "Plan";
    const type = typeof pc.type === "string" ? pc.type : "updated";
    const period = typeof pc.period === "string" ? `/${pc.period}` : "/mo";

    if (
      type === "updated" &&
      typeof pc.previousAmount === "number" &&
      typeof pc.currentAmount === "number"
    ) {
      const delta =
        typeof pc.deltaPercent === "number"
          ? ` (${pc.deltaPercent > 0 ? "+" : ""}${pc.deltaPercent.toFixed(1)}%)`
          : "";
      lines.push(
        `${name}: $${pc.previousAmount}${period} \u2192 $${pc.currentAmount}${period}${delta}`
      );
    } else if (type === "added" && typeof pc.currentAmount === "number") {
      lines.push(`${name}: added at $${pc.currentAmount}${period}`);
    } else if (type === "removed") {
      lines.push(`${name}: removed`);
    }
  }
  return lines;
};

const getInsightSummary = (
  recommendation: Record<string, unknown> | undefined
): string | null => {
  if (!recommendation) return null;
  if (typeof recommendation.summary === "string" && recommendation.summary) {
    return recommendation.summary;
  }
  if (typeof recommendation.headline === "string" && recommendation.headline) {
    return recommendation.headline;
  }
  return null;
};

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

const buildDigestEmail = (
  diffs: VerifiedDiffRecord[],
  companyNameById: Map<string, string>,
  insightByDiffId: Map<string, Record<string, unknown>>,
  lookbackStart: Date,
  now: Date
): { subject: string; text: string; html: string } => {
  const severityCounts = {
    high: diffs.filter((d) => d.severity === "high").length,
    medium: diffs.filter((d) => d.severity === "medium").length,
    low: diffs.filter((d) => d.severity === "low").length,
  };

  const subject = `Weekly pricing digest: ${diffs.length} verified change${diffs.length === 1 ? "" : "s"}`;
  const dashboardUrl = `https://${config.domainName}/dashboard`;

  // --- Plain text version ---
  const textLines: string[] = [
    `Verified pricing changes (${formatDateTime(lookbackStart)} \u2013 ${formatDateTime(now)})`,
    `High: ${severityCounts.high} | Medium: ${severityCounts.medium} | Low: ${severityCounts.low}`,
    "",
  ];

  for (const diff of diffs) {
    const companyName =
      companyNameById.get(diff.companyId.toString()) ?? "Unknown company";
    textLines.push(
      `[${diff.severity.toUpperCase()}] ${companyName} \u2014 ${formatDateTime(diff.detectedAt)}`
    );
    const planLines = formatPlanChanges(diff.normalizedDiff);
    for (const line of planLines) {
      textLines.push(`  ${line}`);
    }
    const insight = insightByDiffId.get(diff._id.toString());
    const summary = getInsightSummary(insight);
    if (summary) {
      textLines.push(`  AI: ${summary}`);
    }
    textLines.push("");
  }

  textLines.push(`View dashboard: ${dashboardUrl}`);
  textLines.push("");
  textLines.push("You're receiving this as a Pro subscriber.");

  const text = textLines.join("\n");

  // --- HTML version (table-based, inline CSS, email-safe) ---
  const changeCards = diffs
    .map((diff) => {
      const companyName = escapeHtml(
        companyNameById.get(diff.companyId.toString()) ?? "Unknown company"
      );
      const sev = SEVERITY_COLORS[diff.severity] ?? SEVERITY_COLORS.low;
      const planLines = formatPlanChanges(diff.normalizedDiff);
      const insight = insightByDiffId.get(diff._id.toString());
      const summary = getInsightSummary(insight);

      const planHtml =
        planLines.length > 0
          ? `<div style="margin-top:8px;font-family:monospace;font-size:13px;color:#334155;line-height:1.6;">${planLines.map((l) => escapeHtml(l)).join("<br/>")}</div>`
          : "";

      const summaryHtml = summary
        ? `<div style="margin-top:8px;padding:8px 12px;background:#f0f9ff;border-left:3px solid #0284c7;border-radius:4px;font-size:13px;color:#0c4a6e;line-height:1.5;">${escapeHtml(summary)}</div>`
        : "";

      return `<tr><td style="padding:0 0 16px 0;">
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
<tr><td style="padding:16px;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="font-size:15px;font-weight:600;color:#0f172a;">${companyName}</td>
<td align="right"><span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;background:${sev.bg};color:${sev.text};">${diff.severity}</span></td>
</tr>
</table>
<div style="margin-top:4px;font-size:12px;color:#94a3b8;">${formatDateTime(diff.detectedAt)}</div>
${planHtml}
${summaryHtml}
</td></tr>
</table>
</td></tr>`;
    })
    .join("");

  const statsRow = (
    [
      ["High", severityCounts.high, "#b91c1c"],
      ["Medium", severityCounts.medium, "#c2410c"],
      ["Low", severityCounts.low, "#475569"],
    ] as const
  )
    .map(
      ([label, count, color]) =>
        `<td align="center" style="padding:8px 16px;">
<div style="font-size:24px;font-weight:700;color:${color};">${count}</div>
<div style="font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:0.5px;">${label}</div>
</td>`
    )
    .join("");

  const html = [
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>',
    '<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;">',
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">',
    '<tr><td align="center">',
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">',
    // Header
    `<tr><td style="background:${BRAND_COLOR};padding:24px 32px;border-radius:8px 8px 0 0;">`,
    '<table width="100%" cellpadding="0" cellspacing="0">',
    `<tr><td style="font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(config.appName)}</td>`,
    '<td align="right" style="font-size:13px;color:rgba(255,255,255,0.8);">Weekly Digest</td></tr>',
    "</table></td></tr>",
    // Body
    '<tr><td style="background:#ffffff;padding:32px;border-radius:0 0 8px 8px;">',
    `<div style="font-size:13px;color:#64748b;margin-bottom:20px;">${formatDateTime(lookbackStart)} \u2013 ${formatDateTime(now)}</div>`,
    // Stats row
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">',
    `<tr>${statsRow}</tr></table>`,
    // Change cards
    '<table width="100%" cellpadding="0" cellspacing="0">',
    changeCards,
    "</table>",
    // CTA button
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">',
    "<tr><td align=\"center\">",
    `<a href="${dashboardUrl}" style="display:inline-block;padding:12px 32px;background:${BRAND_COLOR};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">View Dashboard</a>`,
    "</td></tr></table>",
    // Footer
    `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">You're receiving this as a Pro subscriber of ${escapeHtml(config.appName)}.</div>`,
    "</td></tr></table>",
    "</td></tr></table>",
    "</body></html>",
  ].join("\n");

  return { subject, text, html };
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
    const message =
      error instanceof Error ? error.message : "Digest email send failed";
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

    if (
      user.lastDigestSentAt &&
      user.lastDigestSentAt.getTime() >= lookbackStart.getTime()
    ) {
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
      .select({ companyId: 1, severity: 1, detectedAt: 1, normalizedDiff: 1 })
      .lean<VerifiedDiffRecord[]>()
      .exec();

    if (verifiedDiffs.length === 0) {
      usersSkippedNoDiffs += 1;
      continue;
    }

    usersWithVerifiedDiffs += 1;

    const companyIds = [
      ...new Set(verifiedDiffs.map((diff) => diff.companyId.toString())),
    ];
    const companies = await Company.find({ _id: { $in: companyIds } })
      .select({ name: 1 })
      .lean<CompanyNameRecord[]>()
      .exec();

    const companyNameById = new Map<string, string>();
    for (const company of companies) {
      companyNameById.set(company._id.toString(), company.name);
    }

    // Fetch insight summaries for these diffs
    const diffIds = verifiedDiffs.map((d) => d._id);
    const insights = await Insight.find({ diffId: { $in: diffIds } })
      .select({ diffId: 1, recommendation: 1 })
      .lean<InsightRecord[]>()
      .exec();

    const insightByDiffId = new Map<string, Record<string, unknown>>();
    for (const insight of insights) {
      insightByDiffId.set(
        insight.diffId.toString(),
        insight.recommendation as Record<string, unknown>
      );
    }

    const digestEmail = buildDigestEmail(
      verifiedDiffs,
      companyNameById,
      insightByDiffId,
      lookbackStart,
      now
    );
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
    await User.updateOne(
      { _id: user._id },
      { $set: { lastDigestSentAt: now } }
    ).exec();
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
    const message =
      error instanceof Error ? error.message : "Failed to run weekly digest";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
