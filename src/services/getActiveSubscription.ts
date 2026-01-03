// services/getActiveSubscription.ts
import UserSubscription from "../models/userSubscription.model";
import { Types } from "mongoose";
import SubscriptionPlan from "../models/subscriptionPlan.model";
export async function getActiveSubscription(ownerId: string) {
  if (!Types.ObjectId.isValid(ownerId)) return null;

  const subscription = await UserSubscription.findOne({
    ownerId,
    status: "active",
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!subscription) return null;

  const plan = await SubscriptionPlan.findOne({
    planKey: subscription.planKey,
    isActive: true,
  }).lean();

  if (!plan) return null;

  return { subscription, plan };
}
