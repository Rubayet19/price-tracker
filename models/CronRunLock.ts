import mongoose from "mongoose";
import type { Document, Model } from "mongoose";
import toJSON from "./plugins/toJSON";

export interface ICronRunLock extends Document {
  key: string;
  ownerId: string;
  lockUntil: Date;
  lockedAt: Date;
  lastReleasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cronRunLockSchema = new mongoose.Schema<ICronRunLock>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    ownerId: {
      type: String,
      required: true,
      trim: true,
    },
    lockUntil: {
      type: Date,
      required: true,
    },
    lockedAt: {
      type: Date,
      required: true,
    },
    lastReleasedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

cronRunLockSchema.index({ key: 1 }, { unique: true });
cronRunLockSchema.index({ lockUntil: 1 });
cronRunLockSchema.plugin(toJSON);

const CronRunLock =
  (mongoose.models.CronRunLock as Model<ICronRunLock>) ||
  mongoose.model<ICronRunLock>("CronRunLock", cronRunLockSchema);

export default CronRunLock;
