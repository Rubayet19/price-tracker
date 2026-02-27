import mongoose from "mongoose";
import type { Model, Types } from "mongoose";
import toJSON from "./plugins/toJSON";

const AUDIT_ACTOR_TYPES = ["user", "system", "stripe_webhook", "cron"] as const;
const AUDIT_STATUSES = ["success", "failure", "rejected"] as const;

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export interface IAuditEvent {
  userId?: Types.ObjectId;
  actorType: AuditActorType;
  action: string;
  resourceType: string;
  resourceId?: string;
  status: AuditStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const auditEventSchema = new mongoose.Schema<IAuditEvent>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    actorType: {
      type: String,
      enum: AUDIT_ACTOR_TYPES,
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    resourceType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    resourceId: {
      type: String,
      trim: true,
      maxlength: 120,
    },
    status: {
      type: String,
      enum: AUDIT_STATUSES,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: (): Record<string, unknown> => ({}),
      required: true,
      validate: {
        validator: (value: unknown) => isPlainObject(value),
        message: "metadata must be an object",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

auditEventSchema.index({ userId: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });
auditEventSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });
auditEventSchema.index({ status: 1, createdAt: -1 });

const auditToJSONPlugin =
  toJSON as unknown as Parameters<typeof auditEventSchema.plugin>[0];
auditEventSchema.plugin(auditToJSONPlugin);

const AuditEventModel =
  (mongoose.models.AuditEvent as Model<IAuditEvent>) ||
  mongoose.model<IAuditEvent>("AuditEvent", auditEventSchema);

export default AuditEventModel;
