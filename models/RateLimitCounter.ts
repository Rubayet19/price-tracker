import mongoose from "mongoose";
import type { Document, Model } from "mongoose";
import toJSON from "./plugins/toJSON";

export interface IRateLimitCounter extends Document {
  key: string;
  count: number;
  windowStartedAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const rateLimitCounterSchema = new mongoose.Schema<IRateLimitCounter>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    count: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    windowStartedAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

rateLimitCounterSchema.index({ key: 1 }, { unique: true });
rateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
rateLimitCounterSchema.plugin(toJSON);

const RateLimitCounter =
  (mongoose.models.RateLimitCounter as Model<IRateLimitCounter>) ||
  mongoose.model<IRateLimitCounter>("RateLimitCounter", rateLimitCounterSchema);

export default RateLimitCounter;
