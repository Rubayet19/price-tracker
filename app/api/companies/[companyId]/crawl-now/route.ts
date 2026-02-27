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
      key: `write:crawl-now:${userId}:${companyId}`,
      maxRequests: 10,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many crawl-now requests",
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
        { error: "crawl-now is only available for competitor companies" },
        { status: 400 }
      );
    }

    const now = new Date();
    const leaseUntil = company.crawlLeaseUntil ?? null;
    const hasLease = Boolean(leaseUntil);
    const leaseIsActive = Boolean(leaseUntil && leaseUntil.getTime() > now.getTime());
    const shouldClearLease = hasLease && !leaseIsActive;

    company.nextCrawlAt = now;

    if (shouldClearLease) {
      company.crawlLeaseUntil = undefined;
    }

    await company.save();

    return NextResponse.json({
      companyId: company.id,
      scheduled: true,
      nextCrawlAt: company.nextCrawlAt,
      crawlLeaseUntil: company.crawlLeaseUntil ?? null,
      leaseState: leaseIsActive ? "active" : hasLease ? "stale_or_expired" : "none",
      leaseCleared: shouldClearLease,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to schedule crawl" }, { status: 500 });
  }
}
