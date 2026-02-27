import mongoose from "mongoose";
import type { Model, Types } from "mongoose";
import toJSON from "./plugins/toJSON";

const DIFF_SEVERITIES = ["low", "medium", "high"] as const;
const DIFF_VERIFICATION_STATES = ["verified", "unverified"] as const;

export type DiffSeverity = (typeof DIFF_SEVERITIES)[number];
export type DiffVerificationState = (typeof DIFF_VERIFICATION_STATES)[number];

export interface IDiff {
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  previousSnapshotId?: Types.ObjectId;
  currentSnapshotId: Types.ObjectId;
  normalizedDiff: Record<string, unknown>;
  severity: DiffSeverity;
  verificationState: DiffVerificationState;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const diffSchema = new mongoose.Schema<IDiff>(
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
    previousSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Snapshot",
    },
    currentSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Snapshot",
      required: true,
    },
    normalizedDiff: {
      type: mongoose.Schema.Types.Mixed,
      default: (): Record<string, unknown> => ({}),
      required: true,
      validate: {
        validator: (value: unknown) => isPlainObject(value),
        message: "normalizedDiff must be an object",
      },
    },
    severity: {
      type: String,
      enum: DIFF_SEVERITIES,
      default: "low",
      required: true,
    },
    verificationState: {
      type: String,
      enum: DIFF_VERIFICATION_STATES,
      default: "unverified",
      required: true,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

diffSchema.index({ companyId: 1, detectedAt: -1 });
diffSchema.index({ severity: 1 });
diffSchema.index({ verificationState: 1 });

const diffToJSONPlugin = toJSON as unknown as Parameters<typeof diffSchema.plugin>[0];
diffSchema.plugin(diffToJSONPlugin);

const DiffModel = (mongoose.models.Diff as Model<IDiff>) || mongoose.model<IDiff>("Diff", diffSchema);

export default DiffModel;
