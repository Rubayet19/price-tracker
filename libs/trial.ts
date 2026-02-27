import config from "@/config";
import { isTrialActive } from "@/libs/entitlements";
import connectMongo from "@/libs/mongoose";
import User from "@/models/User";
import type { EntitlementUserLike, TrialStatus } from "@/types/entitlements";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TrialStartReason =
  | "started"
  | "already_active"
  | "already_expired"
  | "already_converted"
  | "paid_user";

interface MutableTrialUser extends EntitlementUserLike {
  _id: unknown;
  trialStatus: TrialStatus;
  save: () => Promise<unknown>;
}

export type TrialUserDocumentLike = MutableTrialUser;

export interface TrialRefreshResult {
  changed: boolean;
  trialStatus: TrialStatus;
}

export interface TrialStartResult {
  userId: string;
  started: boolean;
  changed: boolean;
  reason: TrialStartReason;
  trialStatus: TrialStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
}

const toTrialStartResult = (
  user: MutableTrialUser,
  started: boolean,
  changed: boolean,
  reason: TrialStartReason
): TrialStartResult => {
  return {
    userId: String(user._id),
    started,
    changed,
    reason,
    trialStatus: user.trialStatus,
    trialStartedAt: user.trialStartedAt,
    trialEndsAt: user.trialEndsAt,
  };
};

export const refreshTrialStatusIfExpired = async (
  user: MutableTrialUser,
  now: Date = new Date()
): Promise<TrialRefreshResult> => {
  if (user.trialStatus !== "active") {
    return { changed: false, trialStatus: user.trialStatus };
  }

  let nextStatus: TrialStatus | null = null;

  if (user.hasAccess) {
    nextStatus = "converted";
  } else if (!isTrialActive(user, now)) {
    nextStatus = "expired";
  }

  if (!nextStatus) {
    return { changed: false, trialStatus: user.trialStatus };
  }

  user.trialStatus = nextStatus;
  await user.save();

  return { changed: true, trialStatus: user.trialStatus };
};

export const startTrialForUser = async (
  userId: string,
  now: Date = new Date()
): Promise<TrialStartResult> => {
  await connectMongo();

  const user = (await User.findById(userId)) as MutableTrialUser | null;

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  const refreshResult = await refreshTrialStatusIfExpired(user, now);
  const changedByRefresh = refreshResult.changed;

  if (user.hasAccess) {
    const reason: TrialStartReason =
      user.trialStatus === "converted" ? "already_converted" : "paid_user";
    return toTrialStartResult(user, false, changedByRefresh, reason);
  }

  if (user.trialStatus === "converted") {
    return toTrialStartResult(user, false, changedByRefresh, "already_converted");
  }

  if (user.trialStatus === "expired") {
    return toTrialStartResult(user, false, changedByRefresh, "already_expired");
  }

  if (user.trialStatus === "active" && isTrialActive(user, now)) {
    return toTrialStartResult(user, false, changedByRefresh, "already_active");
  }

  const hasTrialHistory = Boolean(user.trialStartedAt || user.trialEndsAt);
  if (hasTrialHistory && user.trialStatus === "not_started") {
    user.trialStatus = "expired";
    await user.save();
    return toTrialStartResult(user, false, true, "already_expired");
  }

  user.trialStartedAt = now;
  user.trialEndsAt = new Date(now.getTime() + config.entitlements.trialDays * MS_PER_DAY);
  user.trialStatus = "active";
  await user.save();

  return toTrialStartResult(user, true, true, "started");
};
