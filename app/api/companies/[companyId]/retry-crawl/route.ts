import { NextResponse } from "next/server";
import { Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import Company from "@/models/Company";

interface RouteContext {
  params: Promise<{
    companyId: string;
  }>;
}

export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
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
      key: `write:retry-crawl:${userId}:${companyId}`,
      maxRequests: 10,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many retry-crawl requests",
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
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (company.type !== "competitor") {
      return NextResponse.json(
        { error: "retry-crawl is only available for competitor companies" },
        { status: 400 }
      );
    }

    const now = new Date();
    const leaseUntil = company.crawlLeaseUntil ?? null;
    const hasLease = Boolean(leaseUntil);
    const leaseIsActive = Boolean(leaseUntil && leaseUntil.getTime() > now.getTime());

    if (leaseIsActive) {
      return NextResponse.json(
        {
          error: "Cannot retry while a crawl lease is active",
          leaseState: "active",
          crawlLeaseUntil: leaseUntil,
        },
        { status: 409 }
      );
    }

    company.lastCrawlError = undefined;
    company.lastCrawlStatus = "idle";
    company.nextCrawlAt = now;

    if (hasLease) {
      company.crawlLeaseUntil = undefined;
    }

    await company.save();

    return NextResponse.json({
      companyId: company.id,
      retried: true,
      lastCrawlStatus: company.lastCrawlStatus,
      lastCrawlError: company.lastCrawlError ?? null,
      nextCrawlAt: company.nextCrawlAt,
      crawlLeaseUntil: company.crawlLeaseUntil ?? null,
      leaseState: hasLease ? "stale_or_expired" : "none",
      leaseCleared: hasLease,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to retry crawl" }, { status: 500 });
  }
}
