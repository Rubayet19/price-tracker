import mongoose from "mongoose";
import type { Document, Model, Types } from "mongoose";
import toJSON from "./plugins/toJSON";

export type CompanyType = "self" | "competitor";
export type CompanyCrawlStatus = "idle" | "ok" | "blocked" | "manual_needed" | "error";

export interface IPricingUrlCandidate {
  url: string;
  confidence: number;
  selectedByUser: boolean;
}

export interface ICompany extends Document {
  userId: Types.ObjectId;
  name: string;
  domain: string;
  type: CompanyType;
  homepageUrl?: string;
  primaryPricingUrl?: string;
  pricingUrlCandidates: IPricingUrlCandidate[];
  nextCrawlAt?: Date;
  crawlLeaseUntil?: Date;
  lastCrawlAt?: Date;
  lastCrawlStatus: CompanyCrawlStatus;
  lastCrawlError?: string;
  latestContentHash?: string;
  latestConfidence?: number;
  createdAt: Date;
  updatedAt: Date;
}

const pricingUrlCandidateSchema = new mongoose.Schema<IPricingUrlCandidate>(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },
    selectedByUser: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const companySchema = new mongoose.Schema<ICompany>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    type: {
      type: String,
      enum: ["self", "competitor"],
      required: true,
    },
    homepageUrl: {
      type: String,
      trim: true,
    },
    primaryPricingUrl: {
      type: String,
      trim: true,
    },
    pricingUrlCandidates: {
      type: [pricingUrlCandidateSchema],
      default: [],
    },
    nextCrawlAt: {
      type: Date,
    },
    crawlLeaseUntil: {
      type: Date,
    },
    lastCrawlAt: {
      type: Date,
    },
    lastCrawlStatus: {
      type: String,
      enum: ["idle", "ok", "blocked", "manual_needed", "error"],
      default: "idle",
    },
    lastCrawlError: {
      type: String,
      trim: true,
    },
    latestContentHash: {
      type: String,
      trim: true,
    },
    latestConfidence: {
      type: Number,
      min: 0,
      max: 1,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

companySchema.index({ userId: 1, type: 1 });
companySchema.index({ nextCrawlAt: 1 });
companySchema.index({ crawlLeaseUntil: 1 });

companySchema.plugin(toJSON);

const Company =
  (mongoose.models.Company as Model<ICompany>) ||
  mongoose.model<ICompany>("Company", companySchema);

export default Company;
