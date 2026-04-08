import type { DashboardComparisonCompetitor } from "@/types/dashboard";
import type {
  SelfPricingProfileData,
  SelfPricingPlan,
} from "@/types/self-pricing";

export type ComparisonCadence = "month" | "year";

export interface SelfComparisonPrice {
  name: string;
  amount: number;
  currency: string;
}

export interface CompetitorComparisonPrice {
  label: string;
  minAmount: number;
  maxAmount: number;
  currency: string;
  count: number;
  source: "plan" | "bucket";
  /** When true for annual cadence, the price is shown per-month on the source page. */
  annualPriceIsPerMonth?: boolean;
  description?: string | null;
  trialDetails?: string | null;
}

const uniqueDisplayStrings = (items: string[]): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    values.push(normalized);
  }

  return values;
};

const getNamedFallbackComparisonPrices = (
  competitor: DashboardComparisonCompetitor,
  cadence: ComparisonCadence
): CompetitorComparisonPrice[] => {
  const latestSnapshot = competitor.latestSnapshot;
  if (!latestSnapshot) {
    return [];
  }

  const orderedLabels = uniqueDisplayStrings(
    latestSnapshot.extractionDebug?.selectedPlanTexts ?? []
  );
  if (orderedLabels.length === 0) {
    return [];
  }

  const exactPoints = latestSnapshot.pricePoints
    .filter((point) => point.period === cadence)
    .filter((point) => Number.isFinite(point.amount) && point.currency)
    .map((point) => ({
      amount: point.amount,
      currency: point.currency,
    }))
    .filter(
      (point, index, points) =>
        points.findIndex(
          (candidate) =>
            candidate.currency === point.currency &&
            candidate.amount === point.amount
        ) === index
    )
    .sort((left, right) => left.amount - right.amount);

  if (exactPoints.length === 0 || exactPoints.length !== orderedLabels.length) {
    return [];
  }

  const currencies = new Set(exactPoints.map((point) => point.currency));
  if (currencies.size !== 1) {
    return [];
  }

  return exactPoints.map((point, index) => ({
    label: orderedLabels[index] ?? `Plan ${index + 1}`,
    minAmount: point.amount,
    maxAmount: point.amount,
    currency: point.currency,
    count: 1,
    source: "plan" as const,
  }));
};

export const getCompetitorComparisonUnavailableReason = (
  competitor: DashboardComparisonCompetitor,
  cadence: ComparisonCadence
): string | null => {
  if (!competitor.latestSnapshot) {
    return "No pricing snapshot yet.";
  }

  if (competitor.latestSnapshot.pricingModel === "one_time") {
    return "This source uses one-time pricing, so monthly and annual comparison is unavailable.";
  }

  if (competitor.latestSnapshot.pricingModel === "custom_only") {
    return "This source uses custom pricing, so direct price comparison is unavailable.";
  }

  if (competitor.latestSnapshot.pricingModel === "unknown") {
    return "Pricing was detected, but the billing cadence is unclear.";
  }

  if (!competitor.latestSnapshot.comparisonCadences.includes(cadence)) {
    return `No ${cadence === "month" ? "monthly" : "annual"} prices were detected on the latest pricing source.`;
  }

  if (getNamedFallbackComparisonPrices(competitor, cadence).length > 0) {
    return null;
  }

  if (
    competitor.latestSnapshot.extractedPlans.length === 0 &&
    competitor.latestSnapshot.pricePoints.some((point) => point.period === cadence)
  ) {
    return "Prices were detected, but tier names couldn't be extracted reliably. Open Manage source to review the raw context.";
  }

  return null;
};

const isFiniteNumber = (value: number | null): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

export const formatCurrencyAmount = (
  currency: string,
  amount: number
): string => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

export const getSelfComparisonPrices = (
  profile: SelfPricingProfileData | null,
  cadence: ComparisonCadence
): SelfComparisonPrice[] => {
  if (!profile) {
    return [];
  }

  return profile.plans
    .map((plan: SelfPricingPlan) => {
      const amount = cadence === "month" ? plan.monthlyPrice : plan.annualPrice;

      if (!isFiniteNumber(amount)) {
        return null;
      }

      return {
        name: plan.name,
        amount,
        currency: profile.currency,
      };
    })
    .filter((entry): entry is SelfComparisonPrice => entry !== null)
    .sort((left, right) => left.amount - right.amount);
};

export const getCompetitorComparisonPrices = (
  competitor: DashboardComparisonCompetitor,
  cadence: ComparisonCadence
): CompetitorComparisonPrice[] => {
  const unavailableReason = getCompetitorComparisonUnavailableReason(
    competitor,
    cadence
  );
  if (unavailableReason) {
    return [];
  }

  const extractedPlans =
    competitor.latestSnapshot?.extractedPlans
      .map((plan) => {
        const amount =
          cadence === "month" ? plan.monthlyPrice : plan.annualPrice;

        if (!isFiniteNumber(amount) || !plan.currency) {
          return null;
        }

        return {
          label: plan.name,
          minAmount: amount,
          maxAmount: amount,
          currency: plan.currency,
          count: 1,
          source: "plan" as const,
          annualPriceIsPerMonth:
            cadence === "year"
              ? (plan.annualPriceIsPerMonth ?? false)
              : undefined,
          description: plan.description ?? null,
          trialDetails: plan.trialDetails ?? null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => left.minAmount - right.minAmount) ?? [];

  if (extractedPlans.length > 0) {
    return extractedPlans;
  }

  return getNamedFallbackComparisonPrices(competitor, cadence);
};

const summarizeSinglePrice = (
  amount: number,
  selfPrices: SelfComparisonPrice[],
  currency: string
): string => {
  if (selfPrices.length === 0) {
    return "Add your pricing baseline to compare against competitors.";
  }

  const sortedSelfPrices = [...selfPrices].sort(
    (left, right) => left.amount - right.amount
  );
  const lowest = sortedSelfPrices[0];
  const highest = sortedSelfPrices[sortedSelfPrices.length - 1];

  if (amount < lowest.amount) {
    return `${formatCurrencyAmount(currency, amount)} is below your lowest tier (${lowest.name} at ${formatCurrencyAmount(lowest.currency, lowest.amount)}).`;
  }

  if (amount > highest.amount) {
    return `${formatCurrencyAmount(currency, amount)} is above your highest tier (${highest.name} at ${formatCurrencyAmount(highest.currency, highest.amount)}).`;
  }

  for (let index = 0; index < sortedSelfPrices.length; index += 1) {
    const current = sortedSelfPrices[index];
    const next = sortedSelfPrices[index + 1];

    if (amount === current.amount) {
      return `${formatCurrencyAmount(currency, amount)} matches your ${current.name} price.`;
    }

    if (next && amount > current.amount && amount < next.amount) {
      return `${formatCurrencyAmount(currency, amount)} sits between your ${current.name} and ${next.name} tiers.`;
    }
  }

  const nearest = sortedSelfPrices.reduce((closest, candidate) => {
    const currentDistance = Math.abs(candidate.amount - amount);
    const closestDistance = Math.abs(closest.amount - amount);
    return currentDistance < closestDistance ? candidate : closest;
  }, sortedSelfPrices[0]);

  return `${formatCurrencyAmount(currency, amount)} is closest to your ${nearest.name} tier (${formatCurrencyAmount(nearest.currency, nearest.amount)}).`;
};

const summarizeRangeAgainstSelfBaseline = (
  lowestAmount: number,
  highestAmount: number,
  selfPrices: SelfComparisonPrice[],
  currency: string,
  cadence: ComparisonCadence
): string => {
  const sortedSelfPrices = [...selfPrices].sort(
    (left, right) => left.amount - right.amount
  );
  const lowestSelfPrice = sortedSelfPrices[0];
  const highestSelfPrice = sortedSelfPrices[sortedSelfPrices.length - 1];

  const lowerAnchor =
    lowestAmount < lowestSelfPrice.amount
      ? `starts below your lowest tier (${lowestSelfPrice.name} at ${formatCurrencyAmount(lowestSelfPrice.currency, lowestSelfPrice.amount)})`
      : lowestAmount === lowestSelfPrice.amount
        ? `starts at your lowest tier (${lowestSelfPrice.name})`
        : lowestAmount > highestSelfPrice.amount
          ? `starts above your highest tier (${highestSelfPrice.name} at ${formatCurrencyAmount(highestSelfPrice.currency, highestSelfPrice.amount)})`
          : `starts above your ${sortedSelfPrices.reduce((best, candidate) => {
              if (candidate.amount > lowestAmount) {
                return best;
              }
              return candidate;
            }, lowestSelfPrice).name} tier`;

  const upperAnchor =
    highestAmount > highestSelfPrice.amount
      ? "stretches beyond your highest tier"
      : highestAmount === highestSelfPrice.amount
        ? `tops out at your highest tier (${highestSelfPrice.name})`
        : highestAmount < lowestSelfPrice.amount
          ? `stays below your lowest tier (${lowestSelfPrice.name})`
          : `tops out below your ${sortedSelfPrices.find((candidate) => candidate.amount >= highestAmount)?.name ?? highestSelfPrice.name} tier`;

  return `Competitor ${cadence === "month" ? "monthly" : "annual"} pricing ${lowerAnchor} and ${upperAnchor}, from ${formatCurrencyAmount(currency, lowestAmount)} to ${formatCurrencyAmount(currency, highestAmount)}.`;
};

export const summarizeCompetitorComparison = (
  competitor: DashboardComparisonCompetitor,
  competitorPrices: CompetitorComparisonPrice[],
  selfPrices: SelfComparisonPrice[],
  cadence: ComparisonCadence
): string => {
  const unavailableReason = getCompetitorComparisonUnavailableReason(
    competitor,
    cadence
  );
  if (unavailableReason) {
    return unavailableReason;
  }

  if (selfPrices.length === 0) {
    return `You have no ${cadence === "month" ? "monthly" : "annual"} pricing configured yet.`;
  }

  if (competitorPrices.length === 0) {
    return `No ${cadence === "month" ? "monthly" : "annual"} competitor prices detected yet.`;
  }

  const lowestCompetitorPrice = competitorPrices[0];
  const highestCompetitorPrice = competitorPrices[competitorPrices.length - 1];

  if (
    competitorPrices.length === 1 &&
    lowestCompetitorPrice.minAmount === lowestCompetitorPrice.maxAmount
  ) {
    return summarizeSinglePrice(
      lowestCompetitorPrice.minAmount,
      selfPrices,
      lowestCompetitorPrice.currency
    );
  }

  if (lowestCompetitorPrice.currency !== highestCompetitorPrice.currency) {
    return "Competitor pricing spans multiple currencies, so use this as a directional comparison only.";
  }

  const currency = lowestCompetitorPrice.currency;

  if (selfPrices.length > 0) {
    return summarizeRangeAgainstSelfBaseline(
      lowestCompetitorPrice.minAmount,
      highestCompetitorPrice.maxAmount,
      selfPrices,
      currency,
      cadence
    );
  }

  return `Competitor ${cadence === "month" ? "monthly" : "annual"} pricing spans ${formatCurrencyAmount(currency, lowestCompetitorPrice.minAmount)} to ${formatCurrencyAmount(currency, highestCompetitorPrice.maxAmount)} across ${competitorPrices.length} detected price point${competitorPrices.length === 1 ? "" : "s"}.`;
};
