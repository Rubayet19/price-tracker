import mongoose from "mongoose";
import type { Model, Types } from "mongoose";
import toJSON from "./plugins/toJSON";

const INSIGHT_SEVERITY_GATES = ["high_only", "high_and_medium"] as const;
const INSIGHT_FEEDBACK_STATES = ["none", "helpful", "not_helpful"] as const;

export type InsightSeverityGate = (typeof INSIGHT_SEVERITY_GATES)[number];
export type InsightFeedbackState = (typeof INSIGHT_FEEDBACK_STATES)[number];

export interface IInsight {
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  diffId: Types.ObjectId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
  recommendation: Record<string, unknown>;
  severityGate: InsightSeverityGate;
  generatedAt: Date;
  feedback: InsightFeedbackState;
  createdAt: Date;
  updatedAt: Date;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const insightSchema = new mongoose.Schema<IInsight>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    diffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Diff",
      required: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    promptTokens: {
      type: Number,
      default: 0,
      required: true,
      min: 0,
    },
    completionTokens: {
      type: Number,
      default: 0,
      required: true,
      min: 0,
    },
    totalCostUsd: {
      type: Number,
      default: 0,
      required: true,
      min: 0,
    },
    recommendation: {
      type: mongoose.Schema.Types.Mixed,
      default: (): Record<string, unknown> => ({}),
      required: true,
      validate: {
        validator: (value: unknown) => isPlainObject(value),
        message: "recommendation must be an object",
      },
    },
    severityGate: {
      type: String,
      enum: INSIGHT_SEVERITY_GATES,
      default: "high_only",
      required: true,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    feedback: {
      type: String,
      enum: INSIGHT_FEEDBACK_STATES,
      default: "none",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

insightSchema.index({ companyId: 1, generatedAt: -1 });
insightSchema.index({ diffId: 1 });

const insightToJSONPlugin = toJSON as unknown as Parameters<typeof insightSchema.plugin>[0];
insightSchema.plugin(insightToJSONPlugin);

const InsightModel =
  (mongoose.models.Insight as Model<IInsight>) || mongoose.model<IInsight>("Insight", insightSchema);

export default InsightModel;
