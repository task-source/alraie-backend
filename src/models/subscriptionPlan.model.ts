// models/subscriptionPlan.model.ts
import mongoose, { Schema, Document } from "mongoose";

export type PlanKey = "basic" | "standard" | "professional" | "enterprise";

export interface ISubscriptionPlan extends Document {
  planKey: PlanKey;

  name_en: string;
  name_ar: string;

  description_en: string;
  description_ar: string;

  features_en: string[];
  features_ar: string[];

  maxAnimals: number;
  maxAssistants: number;

  iosProductId_monthly?: string;
  iosProductId_yearly?: string;
  androidProductId_monthly?: string;
  androidProductId_yearly?: string;

  isPublic: boolean;
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISubscriptionPlan>(
  {
    planKey: { type: String, enum: ["basic", "standard", "professional", "enterprise"], unique: true },

    name_en: String,
    name_ar: String,

    description_en: String,
    description_ar: String,

    features_en: [String],
    features_ar: [String],

    maxAnimals: { type: Number, required: true },
    maxAssistants: { type: Number, required: true },

    iosProductId_monthly: String,
    iosProductId_yearly: String,
    androidProductId_monthly: String,
    androidProductId_yearly: String,

    isPublic: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<ISubscriptionPlan>("SubscriptionPlan", schema);
