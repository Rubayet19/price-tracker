import RateLimitCounter from "@/models/RateLimitCounter";

export interface WriteRateLimitInput {
  key: string;
  maxRequests: number;
  windowMs: number;
}

export interface WriteRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
}

const createResult = (args: {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: Date;
}): WriteRateLimitResult => {
  return {
    allowed: args.allowed,
    limit: args.limit,
    remaining: Math.max(args.remaining, 0),
    retryAfterSeconds: Math.max(args.retryAfterSeconds, 0),
    resetAt: args.resetAt,
  };
};

export const enforceWriteRateLimit = async (
  input: WriteRateLimitInput
): Promise<WriteRateLimitResult> => {
  const now = new Date();

  const windowDurationMs = Math.max(input.windowMs, 1);
  const expiresAt = new Date(now.getTime() + windowDurationMs * 2);
  const windowExpiredBefore = new Date(now.getTime() - windowDurationMs);

  const created = await RateLimitCounter.findOneAndUpdate(
    { key: input.key },
    {
      $setOnInsert: {
        key: input.key,
        count: 1,
        windowStartedAt: now,
        expiresAt,
      },
    },
    { upsert: true, new: true }
  ).exec();

  const isNewWindow = created.windowStartedAt.getTime() === now.getTime() && created.count === 1;
  if (isNewWindow) {
    return createResult({
      allowed: true,
      limit: input.maxRequests,
      remaining: input.maxRequests - 1,
      retryAfterSeconds: 0,
      resetAt: new Date(now.getTime() + windowDurationMs),
    });
  }

  const reset = await RateLimitCounter.findOneAndUpdate(
    {
      key: input.key,
      windowStartedAt: { $lte: windowExpiredBefore },
    },
    {
      $set: {
        windowStartedAt: now,
        count: 1,
        expiresAt,
      },
    },
    { new: true }
  ).exec();

  if (reset) {
    return createResult({
      allowed: true,
      limit: input.maxRequests,
      remaining: input.maxRequests - 1,
      retryAfterSeconds: 0,
      resetAt: new Date(now.getTime() + windowDurationMs),
    });
  }

  const incremented = await RateLimitCounter.findOneAndUpdate(
    {
      key: input.key,
      windowStartedAt: { $gt: windowExpiredBefore },
      count: { $lt: input.maxRequests },
    },
    {
      $inc: { count: 1 },
      $set: { expiresAt },
    },
    { new: true }
  ).exec();

  if (incremented) {
    const resetAt = new Date(incremented.windowStartedAt.getTime() + windowDurationMs);
    return createResult({
      allowed: true,
      limit: input.maxRequests,
      remaining: input.maxRequests - incremented.count,
      retryAfterSeconds: 0,
      resetAt,
    });
  }

  const current = await RateLimitCounter.findOne({ key: input.key }).exec();
  if (!current) {
    return createResult({
      allowed: true,
      limit: input.maxRequests,
      remaining: input.maxRequests - 1,
      retryAfterSeconds: 0,
      resetAt: new Date(now.getTime() + windowDurationMs),
    });
  }

  const elapsedMs = now.getTime() - current.windowStartedAt.getTime();
  const resetAt = new Date(current.windowStartedAt.getTime() + windowDurationMs);
  const retryAfterSeconds = Math.ceil((windowDurationMs - elapsedMs) / 1000);

  return createResult({
    allowed: false,
    limit: input.maxRequests,
    remaining: 0,
    retryAfterSeconds,
    resetAt,
  });
};
