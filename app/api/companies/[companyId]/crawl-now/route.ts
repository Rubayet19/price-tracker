import { NextResponse } from "next/server";
import { Types } from "mongoose";
import { auth } from "@/libs/auth";
import { runCompanyCrawl } from "@/libs/crawler/runner";
import { enforceWriteRateLimit } from "@/libs/rate-limit";

interface RouteContext {
  params: Promise<{
    companyId: string;
  }>;
}

export async function POST(
  _request: Request,
  context: RouteContext
): Promise<NextResponse> {
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

    const result = await runCompanyCrawl({
      companyId,
      userId: String(userId),
    });

    return NextResponse.json({
      companyId: result.companyId,
      completed: true,
      result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to run crawl";

    if (message === "Company not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    if (message === "crawl-now is only available for competitor companies") {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (message === "A crawl is already in progress for this competitor") {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    console.error(error);
    return NextResponse.json({ error: "Failed to run crawl" }, { status: 500 });
  }
}
