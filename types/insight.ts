export type MoveClassificationLabel =
  | "Monetization shift"
  | "Packaging shift"
  | "Upmarket shift"
  | "Land-and-expand shift"
  | "Value framing shift"
  | "Minor adjustment";

export type StrategicEffort = "Low" | "Medium" | "High";
export type StrategicRisk = "Low" | "Medium" | "High";

export type StrategyType =
  | "Compete on price"
  | "Compete on features"
  | "Compete on positioning";

export interface StrategicOption {
  strategy: StrategyType;
  action: string;
  bestFor: string;
  effort: StrategicEffort;
  risk: StrategicRisk;
}

export interface MoveClassification {
  label: MoveClassificationLabel;
  description: string;
}

export interface DiffSummary {
  added: number;
  removed: number;
  updated: number;
}

export interface LlmInsightRecommendation {
  summary: string;
  moveClassification: MoveClassification;
  strategicOptions: StrategicOption[];
  watchList: string[];
  severity: string;
  verificationState: string;
  diffSummary: DiffSummary;
}

/** Shape produced by the rules-v1 fallback engine. */
export interface RulesInsightRecommendation {
  headline: string;
  summary: string;
  risk: "low" | "medium" | "high";
  severity: string;
  verificationState: string;
  actionItems: string[];
  diffSummary: DiffSummary;
}
