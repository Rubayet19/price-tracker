import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { logAuditEvent } from "@/libs/audit";
import {
  discoverPricingUrlsFromHomepage,
  mergePricingUrlCandidates,
} from "@/libs/crawler/discovery";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import Company from "@/models/Company";

interface RouteContext {
  params: Promise<{
    companyId: string;
  }>;
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
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
      key: `write:discover-pricing:${userId}:${companyId}`,
      maxRequests: 6,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many pricing discovery requests",
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
        action: "company.pricing_discovery.run",
        resourceType: "company",
        resourceId: companyId,
        status: "failure",
        metadata: {
          reason: "company_not_found",
        },
      });
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (!company.homepageUrl) {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "company.pricing_discovery.run",
        resourceType: "company",
        resourceId: String(company.id),
        status: "rejected",
        metadata: {
          reason: "missing_homepage_url",
        },
      });
      return NextResponse.json({ error: "Company has no homepageUrl to discover from" }, { status: 400 });
    }

    const discovery = await discoverPricingUrlsFromHomepage({
      homepageUrl: company.homepageUrl,
      allowedDomain: company.domain,
    });

    const mergedCandidates = mergePricingUrlCandidates(company.pricingUrlCandidates, discovery.candidates);
    company.pricingUrlCandidates = mergedCandidates;

    if (!company.primaryPricingUrl && discovery.recommendedPrimaryUrl) {
      company.primaryPricingUrl = discovery.recommendedPrimaryUrl;
    }

    await company.save();
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.pricing_discovery.run",
      resourceType: "company",
      resourceId: String(company.id),
      status: "success",
      metadata: {
        candidateCount: company.pricingUrlCandidates.length,
        discoveredCount: discovery.candidates.length,
        recommendedPrimaryUrl: discovery.recommendedPrimaryUrl,
      },
    });

    return NextResponse.json(
      {
        companyId: company.id,
        candidates: company.pricingUrlCandidates,
        primaryPricingUrl: company.primaryPricingUrl ?? null,
        recommendedPrimaryUrl: discovery.recommendedPrimaryUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.pricing_discovery.run",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });
    return NextResponse.json({ error: "Failed to discover pricing URLs" }, { status: 500 });
  }
}
