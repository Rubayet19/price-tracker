import { model, models, Schema, type Model, type Types } from "mongoose";
import toJSON from "./plugins/toJSON";

const SNAPSHOT_CAPTURE_METHODS = ["static", "playwright", "llm", "manual"] as const;

export type SnapshotCaptureMethod = (typeof SNAPSHOT_CAPTURE_METHODS)[number];

export interface Snapshot {
  userId: Types.ObjectId;
  companyId: Types.ObjectId;
  capturedAt: Date;
  captureMethod: SnapshotCaptureMethod;
  confidence: number;
  contentHash: string;
  pricingPayload: Record<string, unknown>;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface SnapshotModel extends Model<Snapshot> {}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const snapshotSchema = new Schema<Snapshot, SnapshotModel>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    capturedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    captureMethod: {
      type: String,
      enum: SNAPSHOT_CAPTURE_METHODS,
      default: "static",
      required: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0,
      required: true,
    },
    contentHash: {
      type: String,
      trim: true,
      required: true,
    },
    pricingPayload: {
      type: Schema.Types.Mixed,
      default: (): Record<string, unknown> => ({}),
      required: true,
      validate: {
        validator: (value: unknown) => isPlainObject(value),
        message: "pricingPayload must be a JSON object",
      },
    },
    isVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

snapshotSchema.index({ companyId: 1, capturedAt: -1 });
snapshotSchema.index({ contentHash: 1 });

const snapshotToJSONPlugin = toJSON as unknown as Parameters<typeof snapshotSchema.plugin>[0];
snapshotSchema.plugin(snapshotToJSONPlugin);

const SnapshotModel =
  (models.Snapshot as SnapshotModel | undefined) ||
  model<Snapshot, SnapshotModel>("Snapshot", snapshotSchema);

export default SnapshotModel;
