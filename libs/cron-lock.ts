import { randomUUID } from "node:crypto";
import CronRunLock from "@/models/CronRunLock";

export interface AcquireCronLockInput {
  key: string;
  ttlMs: number;
}

export interface AcquireCronLockResult {
  acquired: boolean;
  ownerId: string;
  lockUntil: Date;
  retryAfterSeconds: number;
}

const isDuplicateKeyError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (!("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 11000;
};

export const acquireCronLock = async (
  input: AcquireCronLockInput
): Promise<AcquireCronLockResult> => {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + input.ttlMs);
  const ownerId = randomUUID();

  const claimedExistingLock = await CronRunLock.findOneAndUpdate(
    {
      key: input.key,
      $or: [{ lockUntil: { $lte: now } }, { lockUntil: { $exists: false } }],
    },
    {
      $set: {
        ownerId,
        lockUntil,
        lockedAt: now,
      },
    },
    { new: true }
  ).exec();

  if (claimedExistingLock) {
    return {
      acquired: true,
      ownerId,
      lockUntil,
      retryAfterSeconds: 0,
    };
  }

  try {
    await CronRunLock.create({
      key: input.key,
      ownerId,
      lockUntil,
      lockedAt: now,
    });

    return {
      acquired: true,
      ownerId,
      lockUntil,
      retryAfterSeconds: 0,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
  }

  const existingLock = await CronRunLock.findOne({ key: input.key }).exec();
  if (!existingLock) {
    return {
      acquired: true,
      ownerId,
      lockUntil,
      retryAfterSeconds: 0,
    };
  }

  const retryAfterMs = Math.max(existingLock.lockUntil.getTime() - now.getTime(), 0);

  return {
    acquired: false,
    ownerId: existingLock.ownerId,
    lockUntil: existingLock.lockUntil,
    retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
  };
};

export const releaseCronLock = async (key: string, ownerId: string): Promise<void> => {
  await CronRunLock.updateOne(
    {
      key,
      ownerId,
    },
    {
      $set: {
        lockUntil: new Date(),
        lastReleasedAt: new Date(),
      },
    }
  ).exec();
};
