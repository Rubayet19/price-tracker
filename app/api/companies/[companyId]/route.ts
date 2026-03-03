import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit";
import { createAuditEventSafe } from "@/libs/audit-events";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import Company from "@/models/Company";
import Diff from "@/models/Diff";
import Insight from "@/models/Insight";
import Snapshot from "@/models/Snapshot";

interface RouteContext {
  params: Promise<{
    companyId: string;
  }>;
}

const normalizeHostname = (hostname: string): string => {
  return hostname.toLowerCase().replace(/^www\./, "");
};

const isValidDomain = (domain: string): boolean => {
  return /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain);
};

const normalizeUrlInput = (value?: string): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const input = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const url = new URL(input);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.hostname = normalizeHostname(url.hostname);
    url.pathname = url.pathname.replace(/\/{2,}/g, "/") || "/";
    return url.toString();
  } catch {
    return null;
  }
};

const updateCompanySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  homepageUrl: z.string().trim().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { companyId } = await context.params;
  if (!Types.ObjectId.isValid(companyId)) {
    return NextResponse.json({ error: "Invalid companyId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, homepageUrl: rawHomepageUrl } = parsed.data;
  if (!name && !rawHomepageUrl) {
    return NextResponse.json({ error: "Provide at least one of: name, homepageUrl" }, { status: 400 });
  }

  const normalizedHomepageUrl = rawHomepageUrl ? normalizeUrlInput(rawHomepageUrl) : undefined;
  if (rawHomepageUrl && !normalizedHomepageUrl) {
    return NextResponse.json({ error: "Invalid homepageUrl" }, { status: 400 });
  }

  try {
    await connectMongo();
    const rateLimit = await enforceWriteRateLimit({
      key: `write:company-update:${userId}:${companyId}`,
      maxRequests: 12,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many update requests", retryAfterSeconds: rateLimit.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const company = await Company.findOne({ _id: companyId, userId: String(userId) });
    if (!company) {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "company.update",
        resourceType: "company",
        resourceId: companyId,
        status: "failure",
        metadata: { reason: "company_not_found" },
      });
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (company.type !== "competitor") {
      return NextResponse.json({ error: "Only competitors can be updated" }, { status: 400 });
    }

    const previousDomain = company.domain;
    let domainChanged = false;

    if (normalizedHomepageUrl) {
      const newDomain = normalizeHostname(new URL(normalizedHomepageUrl).hostname);
      if (!isValidDomain(newDomain)) {
        return NextResponse.json({ error: "Invalid domain from homepageUrl" }, { status: 400 });
      }

      if (newDomain !== previousDomain) {
        const existingWithDomain = await Company.findOne({
          userId: String(userId),
          type: "competitor",
          domain: newDomain,
          _id: { $ne: company._id },
        });
        if (existingWithDomain) {
          return NextResponse.json(
            { error: "Another competitor with this domain already exists" },
            { status: 409 }
          );
        }

        company.domain = newDomain;
        company.primaryPricingUrl = undefined;
        company.pricingUrlCandidates = [];
        company.latestContentHash = undefined;
        company.lastCrawlStatus = "idle";
        company.lastCrawlAt = undefined;
        company.lastCrawlError = undefined;
        company.latestConfidence = undefined;
        domainChanged = true;
      }

      company.homepageUrl = normalizedHomepageUrl;
    }

    if (name) {
      company.name = name;
    }

    await company.save();

    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.update",
      resourceType: "company",
      resourceId: String(company.id),
      status: "success",
      metadata: {
        domainChanged,
        previousDomain: domainChanged ? previousDomain : undefined,
        newDomain: domainChanged ? company.domain : undefined,
      },
    });

    if (domainChanged) {
      await createAuditEventSafe({
        eventType: "company_domain_changed",
        source: "api:companies.[companyId].patch",
        userId: String(userId),
        companyId: String(company.id),
        metadata: { previousDomain, newDomain: company.domain },
      });
    }

    return NextResponse.json({
      companyId: String(company.id),
      name: company.name,
      domain: company.domain,
      homepageUrl: company.homepageUrl ?? null,
      primaryPricingUrl: company.primaryPricingUrl ?? null,
      domainChanged,
    });
  } catch (error) {
    console.error(error);
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.update",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      metadata: { reason: error instanceof Error ? error.message : "unknown_error" },
    });
    return NextResponse.json({ error: "Failed to update competitor" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: RouteContext): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { companyId } = await context.params;
  if (!Types.ObjectId.isValid(companyId)) {
    return NextResponse.json({ error: "Invalid companyId" }, { status: 400 });
  }

  try {
    await connectMongo();
    const rateLimit = await enforceWriteRateLimit({
      key: `write:company-delete:${userId}`,
      maxRequests: 10,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many delete requests",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const company = await Company.findOne({
      _id: companyId,
      userId: String(userId),
    });

    if (!company) {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "company.delete",
        resourceType: "company",
        resourceId: companyId,
        status: "failure",
        metadata: {
          reason: "company_not_found",
        },
      });

      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (company.type !== "competitor") {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "company.delete",
        resourceType: "company",
        resourceId: String(company.id),
        status: "rejected",
        metadata: {
          reason: "non_competitor_delete_not_allowed",
          companyType: company.type,
        },
      });

      return NextResponse.json(
        { error: "Only competitors can be deleted from this action" },
        { status: 400 }
      );
    }

    const [deletedSnapshots, deletedDiffs, deletedInsights] = await Promise.all([
      Snapshot.deleteMany({ userId: company.userId, companyId: company._id }),
      Diff.deleteMany({ userId: company.userId, companyId: company._id }),
      Insight.deleteMany({ userId: company.userId, companyId: company._id }),
    ]);

    await Company.deleteOne({ _id: company._id, userId: company.userId });

    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.delete",
      resourceType: "company",
      resourceId: String(company.id),
      status: "success",
      metadata: {
        companyType: company.type,
        domain: company.domain,
        snapshotCount: deletedSnapshots.deletedCount,
        diffCount: deletedDiffs.deletedCount,
        insightCount: deletedInsights.deletedCount,
      },
    });
    await createAuditEventSafe({
      eventType: "company_deleted",
      source: "api:companies.[companyId].delete",
      userId: String(userId),
      companyId: String(company.id),
      metadata: {
        companyType: company.type,
        domain: company.domain,
        snapshotCount: deletedSnapshots.deletedCount,
        diffCount: deletedDiffs.deletedCount,
        insightCount: deletedInsights.deletedCount,
      },
    });

    return NextResponse.json({
      companyId: String(company.id),
      deleted: true,
    });
  } catch (error) {
    console.error(error);
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.delete",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });

    return NextResponse.json({ error: "Failed to delete competitor" }, { status: 500 });
  }
}
