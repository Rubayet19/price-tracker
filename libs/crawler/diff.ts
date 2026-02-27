import type { DiffSeverity, DiffVerificationState } from "@/models/Diff";
import type { NormalizedPricingPayload, PricePeriod } from "@/libs/crawler/normalize";

interface PriceBucketChange {
  currency: string;
  period: PricePeriod;
  addedAmounts: number[];
  removedAmounts: number[];
  updatedAmounts: Array<{
    previousAmount: number;
    currentAmount: number;
    deltaPercent: number;
  }>;
}

export interface PricingDiffResult {
  normalizedDiff: Record<string, unknown>;
  severity: DiffSeverity;
  verificationState: DiffVerificationState;
}

const PERIOD_ORDER: Record<PricePeriod, number> = {
  day: 1,
  week: 2,
  month: 3,
  year: 4,
  one_time: 5,
  unknown: 6,
};

const toBucketMap = (payload: NormalizedPricingPayload): Map<string, number[]> => {
  const buckets = new Map<string, number[]>();

  for (const price of payload.priceMentions) {
    const key = `${price.currency.toUpperCase()}|${price.period}`;
    const next = buckets.get(key) ?? [];
    next.push(Number(price.amount.toFixed(2)));
    next.sort((a, b) => a - b);
    buckets.set(key, next);
  }

  return buckets;
};

const toCustomHintSet = (payload: NormalizedPricingPayload): Set<string> => {
  return new Set(payload.customPricingHints);
};

const createBucketChange = (
  key: string,
  previousAmounts: number[],
  currentAmounts: number[]
): PriceBucketChange | null => {
  const [currency, periodRaw] = key.split("|");
  const period = periodRaw as PricePeriod;

  const maxLen = Math.max(previousAmounts.length, currentAmounts.length);
  const addedAmounts: number[] = [];
  const removedAmounts: number[] = [];
  const updatedAmounts: Array<{
    previousAmount: number;
    currentAmount: number;
    deltaPercent: number;
  }> = [];

  for (let index = 0; index < maxLen; index += 1) {
    const previousAmount = previousAmounts[index];
    const currentAmount = currentAmounts[index];

    if (typeof previousAmount === "number" && typeof currentAmount === "number") {
      const absoluteDelta = Math.abs(currentAmount - previousAmount);
      const deltaPercent = previousAmount > 0 ? (absoluteDelta / previousAmount) * 100 : 100;

      if (absoluteDelta >= 0.5 && deltaPercent >= 1) {
        updatedAmounts.push({
          previousAmount,
          currentAmount,
          deltaPercent: Number(deltaPercent.toFixed(2)),
        });
      }

      continue;
    }

    if (typeof previousAmount === "number") {
      removedAmounts.push(previousAmount);
      continue;
    }

    if (typeof currentAmount === "number") {
      addedAmounts.push(currentAmount);
    }
  }

  if (addedAmounts.length === 0 && removedAmounts.length === 0 && updatedAmounts.length === 0) {
    return null;
  }

  return {
    currency,
    period,
    addedAmounts,
    removedAmounts,
    updatedAmounts,
  };
};

const determineSeverity = (changes: PriceBucketChange[], customHintChanged: boolean): DiffSeverity => {
  const totalUpdates = changes.reduce((sum, change) => sum + change.updatedAmounts.length, 0);
  const totalAdded = changes.reduce((sum, change) => sum + change.addedAmounts.length, 0);
  const totalRemoved = changes.reduce((sum, change) => sum + change.removedAmounts.length, 0);

  const maxDeltaPercent = changes.reduce((maxDelta, change) => {
    const bucketMax = change.updatedAmounts.reduce(
      (innerMax, update) => Math.max(innerMax, update.deltaPercent),
      0
    );
    return Math.max(maxDelta, bucketMax);
  }, 0);

  if (maxDeltaPercent >= 20 || (totalAdded >= 2 && totalRemoved >= 2)) {
    return "high";
  }

  if (maxDeltaPercent >= 10 || totalUpdates + totalAdded + totalRemoved >= 2 || customHintChanged) {
    return "medium";
  }

  return "low";
};

const sortBucketChanges = (changes: PriceBucketChange[]): PriceBucketChange[] => {
  return [...changes].sort((a, b) => {
    if (a.currency !== b.currency) {
      return a.currency.localeCompare(b.currency);
    }

    if (a.period !== b.period) {
      return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
    }

    return 0;
  });
};

export const generatePricingDiff = (
  previousPayload: NormalizedPricingPayload,
  currentPayload: NormalizedPricingPayload,
  currentSnapshotVerified: boolean
): PricingDiffResult | null => {
  const previousBuckets = toBucketMap(previousPayload);
  const currentBuckets = toBucketMap(currentPayload);
  const allKeys = new Set<string>([...previousBuckets.keys(), ...currentBuckets.keys()]);

  const bucketChanges: PriceBucketChange[] = [];

  for (const key of allKeys) {
    const nextChange = createBucketChange(key, previousBuckets.get(key) ?? [], currentBuckets.get(key) ?? []);
    if (nextChange) {
      bucketChanges.push(nextChange);
    }
  }

  const previousHints = toCustomHintSet(previousPayload);
  const currentHints = toCustomHintSet(currentPayload);

  const addedHints = [...currentHints].filter((hint) => !previousHints.has(hint));
  const removedHints = [...previousHints].filter((hint) => !currentHints.has(hint));
  const customHintChanged = addedHints.length > 0 || removedHints.length > 0;

  if (bucketChanges.length === 0 && !customHintChanged) {
    return null;
  }

  const sortedChanges = sortBucketChanges(bucketChanges);
  const severity = determineSeverity(sortedChanges, customHintChanged);

  return {
    normalizedDiff: {
      priceChanges: sortedChanges,
      customPricingHintChanges: {
        added: addedHints,
        removed: removedHints,
      },
      previousPriceCount: previousPayload.priceMentions.length,
      currentPriceCount: currentPayload.priceMentions.length,
      previousPlanCount: previousPayload.planNames.length,
      currentPlanCount: currentPayload.planNames.length,
      changedAt: new Date().toISOString(),
    },
    severity,
    verificationState: currentSnapshotVerified ? "verified" : "unverified",
  };
};
