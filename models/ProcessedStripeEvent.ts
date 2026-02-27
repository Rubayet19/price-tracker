import mongoose from "mongoose";
import type { Document, Model } from "mongoose";
import toJSON from "./plugins/toJSON";

export type ProcessedStripeEventStatus = "processing" | "processed" | "failed";

export interface IProcessedStripeEvent extends Document {
  eventId: string;
  eventType: string;
  status: ProcessedStripeEventStatus;
  attempts: number;
  lockExpiresAt: Date;
  processedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const processedStripeEventSchema = new mongoose.Schema<IProcessedStripeEvent>(
  {
    eventId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["processing", "processed", "failed"],
      default: "processing",
      required: true,
    },
    attempts: {
      type: Number,
      default: 1,
      min: 1,
      required: true,
    },
    lockExpiresAt: {
      type: Date,
      required: true,
    },
    processedAt: {
      type: Date,
    },
    lastError: {
      type: String,
      trim: true,
      maxlength: 800,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

processedStripeEventSchema.index({ eventId: 1 }, { unique: true });
processedStripeEventSchema.index({ status: 1, lockExpiresAt: 1 });
processedStripeEventSchema.plugin(toJSON);

const ProcessedStripeEvent =
  (mongoose.models.ProcessedStripeEvent as Model<IProcessedStripeEvent>) ||
  mongoose.model<IProcessedStripeEvent>("ProcessedStripeEvent", processedStripeEventSchema);

export default ProcessedStripeEvent;
