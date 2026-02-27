import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { logAuditEvent } from "@/libs/audit";
import { createAuditEventSafe } from "@/libs/audit-events";
import { mergePricingUrlCandidates } from "@/libs/crawler/discovery";
import { normalizeUrl } from "@/libs/crawler/normalize";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import Company, { type IPricingUrlCandidate } from "@/models/Company";

interface RouteContext {
  params: Promise<{
    companyId: string;
  }>;
}

const pricingSelectionSchema = z
  .object({
    url: z.string().trim().optional(),
    candidateUrl: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const hasUrl = Boolean(value.url);
    const hasCandidateUrl = Boolean(value.candidateUrl);

    if (hasUrl === hasCandidateUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of: url or candidateUrl",
        path: ["url"],
      });
    }
  });

const normalizeHostname = (hostname: string): string => {
  return hostname.toLowerCase().replace(/^www\./, "");
};

const isSubdomainOrSame = (hostname: string, domain: string): boolean => {
  return hostname === domain || hostname.endsWith(`.${domain}`);
};

const matchesCompanyDomain = (url: string, companyDomain: string): boolean => {
  try {
    const parsed = new URL(url);
    const normalizedCompanyDomain = normalizeHostname(companyDomain);
    const normalizedHostname = normalizeHostname(parsed.hostname);
    return isSubdomainOrSame(normalizedHostname, normalizedCompanyDomain);
  } catch {
    return false;
  }
};

const setSelectedCandidate = (
  candidates: ReadonlyArray<IPricingUrlCandidate>,
  selectedUrl: string
): IPricingUrlCandidate[] => {
  return candidates.map((candidate) => ({
    ...candidate,
    selectedByUser: candidate.url === selectedUrl,
  }));
};

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

  const parsed = pricingSelectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const candidateUrlInput = parsed.data.candidateUrl?.trim();
  const selectedUrlInput = candidateUrlInput || parsed.data.url;
  const normalizedSelectedUrl = selectedUrlInput ? normalizeUrl(selectedUrlInput) : null;

  if (!normalizedSelectedUrl) {
    return NextResponse.json({ error: "Invalid pricing URL" }, { status: 400 });
  }

  try {
    await connectMongo();
    const rateLimit = await enforceWriteRateLimit({
      key: `write:primary-pricing:${userId}:${companyId}`,
      maxRequests: 12,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many primary pricing updates",
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
        action: "company.primary_pricing.update",
        resourceType: "company",
        resourceId: companyId,
        status: "failure",
        metadata: {
          reason: "company_not_found",
        },
      });
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (!matchesCompanyDomain(normalizedSelectedUrl, company.domain)) {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "company.primary_pricing.update",
        resourceType: "company",
        resourceId: companyId,
        status: "rejected",
        metadata: {
          reason: "domain_mismatch",
          companyDomain: company.domain,
          selectedUrl: normalizedSelectedUrl,
        },
      });
      return NextResponse.json(
        { error: "Selected pricing URL domain does not match company domain" },
        { status: 400 }
      );
    }

    const mergedCandidates = mergePricingUrlCandidates(company.pricingUrlCandidates);
    const selectingExistingCandidate = Boolean(candidateUrlInput);

    if (selectingExistingCandidate) {
      const candidateExists = mergedCandidates.some(
        (candidate) => candidate.url === normalizedSelectedUrl
      );

      if (!candidateExists) {
        await logAuditEvent({
          userId: String(userId),
          actorType: "user",
          action: "company.primary_pricing.update",
          resourceType: "company",
          resourceId: String(company.id),
          status: "rejected",
          metadata: {
            reason: "candidate_url_not_found",
            selectedUrl: normalizedSelectedUrl,
          },
        });
        return NextResponse.json(
          { error: "candidateUrl must exist in pricingUrlCandidates" },
          { status: 400 }
        );
      }
    }

    const nextCandidates = selectingExistingCandidate
      ? mergedCandidates
      : mergePricingUrlCandidates(mergedCandidates, [
          {
            url: normalizedSelectedUrl,
            confidence: 1,
            selectedByUser: true,
          },
        ]);

    const previousPrimaryPricingUrl = company.primaryPricingUrl ?? null;
    company.primaryPricingUrl = normalizedSelectedUrl;
    company.pricingUrlCandidates = setSelectedCandidate(nextCandidates, normalizedSelectedUrl);
    await company.save();

    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.primary_pricing.update",
      resourceType: "company",
      resourceId: String(company.id),
      status: "success",
      metadata: {
        selectedUrl: normalizedSelectedUrl,
        fromCandidate: selectingExistingCandidate,
        candidateCount: company.pricingUrlCandidates.length,
      },
    });
    if (previousPrimaryPricingUrl !== normalizedSelectedUrl) {
      await createAuditEventSafe({
        eventType: "primary_pricing_url_changed",
        source: "api:companies.primary-pricing.patch",
        userId: String(userId),
        companyId: String(company.id),
        metadata: {
          previousPrimaryPricingUrl,
          nextPrimaryPricingUrl: normalizedSelectedUrl,
          fromCandidate: selectingExistingCandidate,
        },
      });
    }

    return NextResponse.json({
      companyId: company.id,
      domain: company.domain,
      primaryPricingUrl: company.primaryPricingUrl ?? null,
      pricingUrlCandidates: company.pricingUrlCandidates,
    });
  } catch (error) {
    console.error(error);
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.primary_pricing.update",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });
    return NextResponse.json({ error: "Failed to update primary pricing URL" }, { status: 500 });
  }
}
