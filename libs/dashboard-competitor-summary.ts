import type { DashboardComparisonCompetitor } from "@/types/dashboard";

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

const getNamedPlanCount = (
  competitor: DashboardComparisonCompetitor
): number => {
  const snapshot = competitor.latestSnapshot;
  if (!snapshot) {
    return 0;
  }

  if (snapshot.extractedPlans.length > 0) {
    return snapshot.extractedPlans.length;
  }

  return uniqueDisplayStrings(
    snapshot.extractionDebug?.selectedPlanTexts ?? []
  ).length;
};

export const summarizeCompetitorSnapshot = (
  competitor: DashboardComparisonCompetitor
): string | null => {
  const snapshot = competitor.latestSnapshot;
  if (!snapshot) {
    return null;
  }

  if (snapshot.pricingModel === "one_time") {
    return "One-time pricing detected; recurring comparison is unavailable.";
  }

  if (snapshot.pricingModel === "custom_only") {
    return "Custom pricing only; direct comparison is unavailable.";
  }

  const namedPlanCount = getNamedPlanCount(competitor);
  if (namedPlanCount > 0) {
    const cadenceCount = snapshot.comparisonCadences.length;
    return `${namedPlanCount} named plan${namedPlanCount === 1 ? "" : "s"} extracted${cadenceCount > 0 ? ` across ${cadenceCount} billing cadence${cadenceCount === 1 ? "" : "s"}` : ""}.`;
  }

  if (snapshot.comparisonCadences.length > 0) {
    return "Pricing detected, but plan names couldn't be extracted.";
  }

  if (snapshot.pricePoints.length > 0) {
    return "Pricing detected, but billing cadence couldn't be determined.";
  }

  return null;
};
