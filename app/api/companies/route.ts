import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { canAddCompetitor, resolveEntitlements } from "@/libs/entitlements";
import { logAuditEvent } from "@/libs/audit";
import { createAuditEventSafe } from "@/libs/audit-events";
import {
  discoverPricingUrlsFromHomepage,
  mergePricingUrlCandidates,
} from "@/libs/crawler/discovery";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import { refreshTrialStatusIfExpired } from "@/libs/trial";
import Company, { type IPricingUrlCandidate } from "@/models/Company";
import User from "@/models/User";

const createCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(["self", "competitor"]),
    domain: z.string().trim().optional(),
    homepageUrl: z.string().trim().optional(),
    primaryPricingUrl: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.domain && !value.homepageUrl && !value.primaryPricingUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one of: domain, homepageUrl, primaryPricingUrl",
        path: ["domain"],
      });
    }
  });

const normalizeHostname = (hostname: string): string => {
  return hostname.toLowerCase().replace(/^www\./, "");
};

const isValidDomain = (domain: string): boolean => {
  return /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(domain);
};

const normalizeDomainInput = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const asUrl = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const normalized = normalizeHostname(asUrl.hostname);
    return isValidDomain(normalized) ? normalized : null;
  } catch {
    const candidate = normalizeHostname(trimmed.split("/")[0].split(":")[0]);
    return isValidDomain(candidate) ? candidate : null;
  }
};

const normalizeUrlInput = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const input = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const url = new URL(input);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    url.hostname = normalizeHostname(url.hostname);
    const normalizedPath = url.pathname.replace(/\/{2,}/g, "/");
    url.pathname = normalizedPath === "" ? "/" : normalizedPath;
    return url.toString();
  } catch {
    return null;
  }
};

const getUserIdFromSession = async (): Promise<string | null> => {
  const session = await auth();
  return session?.user?.id ? String(session.user.id) : null;
};

const isSubdomainOrSame = (hostname: string, domain: string): boolean => {
  return hostname === domain || hostname.endsWith(`.${domain}`);
};

export async function GET() {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    await connectMongo();
    const companies = await Company.find({ userId }).sort({ createdAt: -1 });

    return NextResponse.json({ companies });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load companies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromSession();

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createCompanySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const normalizedHomepageUrl = normalizeUrlInput(parsed.data.homepageUrl);
  if (parsed.data.homepageUrl && !normalizedHomepageUrl) {
    return NextResponse.json({ error: "Invalid homepageUrl" }, { status: 400 });
  }

  const normalizedPricingUrl = normalizeUrlInput(parsed.data.primaryPricingUrl);
  if (parsed.data.primaryPricingUrl && !normalizedPricingUrl) {
    return NextResponse.json({ error: "Invalid primaryPricingUrl" }, { status: 400 });
  }

  const domainFromInput = normalizeDomainInput(parsed.data.domain);
  if (parsed.data.domain && !domainFromInput) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const domainFromHomepage = normalizedHomepageUrl
    ? normalizeHostname(new URL(normalizedHomepageUrl).hostname)
    : null;
  const domainFromPricing = normalizedPricingUrl
    ? normalizeHostname(new URL(normalizedPricingUrl).hostname)
    : null;

  const normalizedDomain = domainFromInput ?? domainFromHomepage ?? domainFromPricing;

  if (!normalizedDomain) {
    return NextResponse.json({ error: "Unable to resolve company domain" }, { status: 400 });
  }

  if (normalizedHomepageUrl) {
    const homepageHost = normalizeHostname(new URL(normalizedHomepageUrl).hostname);
    if (!isSubdomainOrSame(homepageHost, normalizedDomain)) {
      return NextResponse.json(
        { error: "homepageUrl domain does not match company domain" },
        { status: 400 }
      );
    }
  }

  if (normalizedPricingUrl) {
    const pricingHost = normalizeHostname(new URL(normalizedPricingUrl).hostname);
    if (!isSubdomainOrSame(pricingHost, normalizedDomain)) {
      return NextResponse.json(
        { error: "primaryPricingUrl domain does not match company domain" },
        { status: 400 }
      );
    }
  }

  try {
    await connectMongo();
    const rateLimit = await enforceWriteRateLimit({
      key: `write:company-create:${userId}`,
      maxRequests: 10,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many company creation requests",
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

    const user = await User.findById(userId);

    if (!user) {
      await logAuditEvent({
        userId,
        actorType: "user",
        action: "company.create",
        resourceType: "company",
        status: "failure",
        metadata: {
          reason: "user_not_found",
          requestedType: parsed.data.type,
        },
      });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    await refreshTrialStatusIfExpired(user, now);
    const entitlements = resolveEntitlements(user, now);

    if (parsed.data.type === "competitor") {
      const currentCompetitorCount = await Company.countDocuments({
        userId,
        type: "competitor",
      });

      if (!canAddCompetitor(entitlements, currentCompetitorCount)) {
        await createAuditEventSafe({
          eventType: "competitor_cap_hit",
          source: "api:companies.post",
          userId,
          metadata: {
            competitorLimit: entitlements.competitorLimit,
            currentCompetitorCount,
          },
        });

        await logAuditEvent({
          userId,
          actorType: "user",
          action: "company.create",
          resourceType: "company",
          status: "rejected",
          metadata: {
            reason: "competitor_limit_reached",
            competitorLimit: entitlements.competitorLimit,
            currentCompetitorCount,
          },
        });
        return NextResponse.json(
          { error: "Competitor limit reached for current plan" },
          { status: 403 }
        );
      }
    }

    if (parsed.data.type === "self") {
      const existingSelf = await Company.findOne({ userId, type: "self" });
      if (existingSelf) {
        await logAuditEvent({
          userId,
          actorType: "user",
          action: "company.create",
          resourceType: "company",
          resourceId: String(existingSelf.id),
          status: "rejected",
          metadata: {
            reason: "self_company_already_exists",
          },
        });
        return NextResponse.json({ error: "Self company already exists" }, { status: 409 });
      }
    }

    const existingByTypeAndDomain = await Company.findOne({
      userId,
      type: parsed.data.type,
      domain: normalizedDomain,
    });

    if (existingByTypeAndDomain) {
      await logAuditEvent({
        userId,
        actorType: "user",
        action: "company.create",
        resourceType: "company",
        resourceId: String(existingByTypeAndDomain.id),
        status: "rejected",
        metadata: {
          reason: "domain_already_exists_for_type",
          domain: normalizedDomain,
          requestedType: parsed.data.type,
        },
      });
      return NextResponse.json(
        { error: "Company with this domain already exists for this type" },
        { status: 409 }
      );
    }

    let discoveredCandidates: IPricingUrlCandidate[] = [];
    let discoveredPrimaryPricingUrl: string | null = null;

    if (parsed.data.type === "competitor" && !normalizedPricingUrl && normalizedHomepageUrl) {
      const discovery = await discoverPricingUrlsFromHomepage({
        homepageUrl: normalizedHomepageUrl,
        allowedDomain: normalizedDomain,
      });

      discoveredCandidates = discovery.candidates;
      discoveredPrimaryPricingUrl = discovery.recommendedPrimaryUrl;
    }

    const userProvidedCandidates = normalizedPricingUrl
      ? [
          {
            url: normalizedPricingUrl,
            confidence: 1,
            selectedByUser: true,
          },
        ]
      : [];
    const pricingUrlCandidates = mergePricingUrlCandidates(userProvidedCandidates, discoveredCandidates);

    const company = await Company.create({
      userId,
      name: parsed.data.name,
      type: parsed.data.type,
      domain: normalizedDomain,
      homepageUrl: normalizedHomepageUrl ?? undefined,
      primaryPricingUrl: normalizedPricingUrl ?? discoveredPrimaryPricingUrl ?? undefined,
      ...(parsed.data.type === "competitor" ? { nextCrawlAt: now } : {}),
      pricingUrlCandidates,
    });

    await logAuditEvent({
      userId,
      actorType: "user",
      action: "company.create",
      resourceType: "company",
      resourceId: String(company.id),
      status: "success",
      metadata: {
        companyType: company.type,
        domain: company.domain,
        discoveredCandidates: discoveredCandidates.length,
        hasPrimaryPricingUrl: Boolean(company.primaryPricingUrl),
      },
    });
    await createAuditEventSafe({
      eventType: "company_created",
      source: "api:companies.post",
      userId,
      companyId: company.id,
      metadata: {
        companyType: company.type,
        domain: company.domain,
      },
    });

    return NextResponse.json({ company }, { status: 201 });
  } catch (error) {
    console.error(error);
    await logAuditEvent({
      userId,
      actorType: "user",
      action: "company.create",
      resourceType: "company",
      status: "failure",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });
    return NextResponse.json({ error: "Failed to create company" }, { status: 500 });
  }
}
