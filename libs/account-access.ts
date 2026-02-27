import type { TrialStatus } from "@/types/entitlements";

interface MutableAccountUser {
  _id: unknown;
  hasAccess: boolean;
  customerId?: string;
  priceId?: string;
  trialStatus: TrialStatus;
  save: () => Promise<unknown>;
}

interface GrantPaidAccessInput {
  user: MutableAccountUser;
  customerId: string;
  priceId: string;
}

interface RevokePaidAccessInput {
  user: MutableAccountUser;
}

interface ApplyInvoicePaidSyncInput {
  user: MutableAccountUser;
  customerId: string;
  priceId: string;
}

export interface AccountAccessMutationResult {
  userId: string;
  changed: boolean;
  hasAccess: boolean;
  trialStatus: TrialStatus;
  trialConverted: boolean;
}

export interface InvoicePaidSyncResult extends AccountAccessMutationResult {
  applied: boolean;
  reason?: "customer_mismatch" | "price_mismatch";
}

const persistIfChanged = async (
  user: MutableAccountUser,
  changed: boolean
): Promise<AccountAccessMutationResult> => {
  if (changed) {
    await user.save();
  }

  return {
    userId: String(user._id),
    changed,
    hasAccess: user.hasAccess,
    trialStatus: user.trialStatus,
    trialConverted: user.trialStatus === "converted",
  };
};

export const grantPaidAccess = async (
  input: GrantPaidAccessInput
): Promise<AccountAccessMutationResult> => {
  const { user, customerId, priceId } = input;

  let changed = false;
  let trialConverted = false;

  if (user.customerId !== customerId) {
    user.customerId = customerId;
    changed = true;
  }

  if (user.priceId !== priceId) {
    user.priceId = priceId;
    changed = true;
  }

  if (!user.hasAccess) {
    user.hasAccess = true;
    changed = true;
  }

  if (user.trialStatus === "active") {
    user.trialStatus = "converted";
    trialConverted = true;
    changed = true;
  }

  const result = await persistIfChanged(user, changed);
  return {
    ...result,
    trialConverted,
  };
};

export const revokePaidAccess = async (
  input: RevokePaidAccessInput
): Promise<AccountAccessMutationResult> => {
  const { user } = input;

  if (!user.hasAccess) {
    return {
      userId: String(user._id),
      changed: false,
      hasAccess: user.hasAccess,
      trialStatus: user.trialStatus,
      trialConverted: false,
    };
  }

  user.hasAccess = false;
  return persistIfChanged(user, true);
};

export const applyInvoicePaidSync = async (
  input: ApplyInvoicePaidSyncInput
): Promise<InvoicePaidSyncResult> => {
  const { user, customerId, priceId } = input;

  if (user.customerId && user.customerId !== customerId) {
    return {
      userId: String(user._id),
      applied: false,
      reason: "customer_mismatch",
      changed: false,
      hasAccess: user.hasAccess,
      trialStatus: user.trialStatus,
      trialConverted: false,
    };
  }

  if (user.priceId && user.priceId !== priceId) {
    return {
      userId: String(user._id),
      applied: false,
      reason: "price_mismatch",
      changed: false,
      hasAccess: user.hasAccess,
      trialStatus: user.trialStatus,
      trialConverted: false,
    };
  }

  const granted = await grantPaidAccess({
    user,
    customerId,
    priceId,
  });

  return {
    ...granted,
    applied: true,
  };
};
