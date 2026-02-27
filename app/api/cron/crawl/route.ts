import { NextRequest, NextResponse } from "next/server";
import {
  CRAWL_BATCH_LIMIT,
  DEFAULT_CRAWL_BATCH_LIMIT,
  MAX_CRAWL_BATCH_LIMIT,
} from "@/libs/crawler/constants";
import { acquireCronLock, releaseCronLock } from "@/libs/cron-lock";
import { runCrawlBatch } from "@/libs/crawler/runner";
import { requireCronAuth } from "@/libs/cron-auth";
import connectMongo from "@/libs/mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const CRAWL_CRON_LOCK_KEY = "cron:crawl";
const CRAWL_CRON_LOCK_TTL_MS = 8 * 60 * 1000;

const parseLimit = (raw: string | null): number => {
  if (!raw) {
    return CRAWL_BATCH_LIMIT || DEFAULT_CRAWL_BATCH_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return CRAWL_BATCH_LIMIT || DEFAULT_CRAWL_BATCH_LIMIT;
  }

  return Math.min(parsed, MAX_CRAWL_BATCH_LIMIT);
};

const handle = async (request: NextRequest): Promise<NextResponse> => {
  const unauthorizedResponse = requireCronAuth(request);
  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  try {
    await connectMongo();
    const lock = await acquireCronLock({
      key: CRAWL_CRON_LOCK_KEY,
      ttlMs: CRAWL_CRON_LOCK_TTL_MS,
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

    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    try {
      const result = await runCrawlBatch({ limit });

      return NextResponse.json({ ok: true, skipped: false, result }, { status: 200 });
    } finally {
      await releaseCronLock(CRAWL_CRON_LOCK_KEY, lock.ownerId);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run crawl batch";
    return NextResponse.json({ error: message }, { status: 500 });
  }
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
