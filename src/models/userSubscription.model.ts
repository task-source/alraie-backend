// models/userSubscription.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export type BillingCycle = "monthly" | "yearly";
export type SubscriptionSource = "apple" | "google" | "admin";

export interface IUserSubscription extends Document {
  ownerId: Types.ObjectId;

  planKey: string;
  cycle: BillingCycle;

  priceSnapshot?: {
    amount: number;
    currency: string;
    platform: SubscriptionSource;
  };


  startedAt: Date;
  expiresAt: Date;

  isTrial: boolean;
  trialEndsAt?: Date;

  status: "active" | "expired" | "cancelled";

  source: SubscriptionSource;
  externalReference?: string;

  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IUserSubscription>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },

    planKey: String,
    cycle: { type: String, enum: ["monthly", "yearly"] },
    
    priceSnapshot: {
      amount: Number,
      currency: String,
      platform: String,
    },
    startedAt: Date,
    expiresAt: Date,

    isTrial: Boolean,
    trialEndsAt: Date,

    status: { type: String, enum: ["active", "expired", "cancelled"], default: "active" },

    source: { type: String, enum: ["apple", "google", "admin"] },
    externalReference: String,
  },
  { timestamps: true }
);

schema.index({ ownerId: 1, status: 1 });

export default mongoose.model<IUserSubscription>("UserSubscription", schema);
