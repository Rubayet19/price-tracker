import mongoose from "mongoose";
import toJSON from "./plugins/toJSON";

type TrialStatus = "not_started" | "active" | "expired" | "converted";

interface IUser {
  name?: string;
  email?: string;
  image?: string;
  customerId?: string;
  priceId?: string;
  hasAccess: boolean;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialStatus: TrialStatus;
  lastDigestSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface IUserDocument extends IUser, mongoose.Document {}

interface IUserModel extends mongoose.Model<IUserDocument> {}

// USER SCHEMA
const userSchema = new mongoose.Schema<IUserDocument, IUserModel>(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      private: true,
    },
    image: {
      type: String,
    },
    // Used in the Stripe webhook to identify the user in Stripe and later create Customer Portal or prefill user credit card details
    customerId: {
      type: String,
      validate(value: string) {
        return typeof value === "string" ? value.includes("cus_") : false;
      },
    },
    // Used in the Stripe webhook. should match a plan in config.js file.
    priceId: {
      type: String,
      validate(value: string) {
        return typeof value === "string" ? value.includes("price_") : false;
      },
    },
    // Used to determine if the user has access to the product—it's turn on/off by the Stripe webhook
    hasAccess: {
      type: Boolean,
      default: false,
    },
    trialStartedAt: {
      type: Date,
      default: null,
    },
    trialEndsAt: {
      type: Date,
      default: null,
    },
    trialStatus: {
      type: String,
      enum: ["not_started", "active", "expired", "converted"],
      default: "not_started",
    },
    lastDigestSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

userSchema.index({ email: 1 });
userSchema.index({ trialStatus: 1 });

// add plugin that converts mongoose to json
userSchema.plugin(toJSON);

const User =
  (mongoose.models.User as IUserModel) ||
  mongoose.model<IUserDocument, IUserModel>("User", userSchema);

export default User;
