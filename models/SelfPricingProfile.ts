import mongoose from "mongoose";
import type { Document, Model, Types } from "mongoose";
import toJSON from "./plugins/toJSON";

export type SelfPricingBillingPeriod = "month" | "year" | "custom";

export interface ISelfPricingPlan {
  name: string;
  price: number;
  priceAnchor?: number;
  highlights: string[];
}

export interface ISelfPricingProfile extends Document {
  userId: Types.ObjectId;
  currency: string;
  billingPeriod: SelfPricingBillingPeriod;
  plans: ISelfPricingPlan[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const selfPricingPlanSchema = new mongoose.Schema<ISelfPricingPlan>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      max: 1_000_000,
    },
    priceAnchor: {
      type: Number,
      min: 0,
      max: 1_000_000,
    },
    highlights: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 160,
        },
      ],
      default: [],
    },
  },
  {
    _id: false,
  }
);

const selfPricingProfileSchema = new mongoose.Schema<ISelfPricingProfile>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      default: "USD",
      maxlength: 3,
      minlength: 3,
      match: /^[A-Z]{3}$/,
    },
    billingPeriod: {
      type: String,
      enum: ["month", "year", "custom"],
      default: "month",
      required: true,
    },
    plans: {
      type: [selfPricingPlanSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2_000,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

selfPricingProfileSchema.index({ userId: 1 }, { unique: true });
selfPricingProfileSchema.plugin(toJSON);

const SelfPricingProfile =
  (mongoose.models.SelfPricingProfile as Model<ISelfPricingProfile>) ||
  mongoose.model<ISelfPricingProfile>("SelfPricingProfile", selfPricingProfileSchema);

export default SelfPricingProfile;
