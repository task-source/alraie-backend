import { Types } from "mongoose";
import UserSubscription from "../models/userSubscription.model";
import SubscriptionPlan from "../models/subscriptionPlan.model";
import createError from "http-errors";
import pendingDowngradeModel from "../models/pendingDowngrade.model";
import user from "../models/user";

export const adminAssignSubscription = async (req: any, res: any) => {
  const { ownerId, planKey, cycle, price, currency } = req.body;

  if (!Types.ObjectId.isValid(ownerId)) {
    throw createError(400, req.t("INVALID_OWNER_ID"));
  }

  const owner = await user.findById(ownerId).lean();
  if (!owner) {
    throw createError(404, req.t("OWNER_NOT_FOUND"));
  }

  if (owner.role !== "owner") {
    throw createError(400, req.t("USER_IS_NOT_OWNER"));
  }

  if (price < 0) {
    throw createError(400, req.t("INVALID_PRICE"));
  }

  if (!["monthly", "yearly"].includes(cycle)) {
    throw createError(400, req.t("INVALID_BILLING_CYCLE"));
  }

  const plan = await SubscriptionPlan.findOne({
    planKey,
    isActive: true,
  });

  if (!plan) {
    throw createError(404, req.t("PLAN_NOT_FOUND"));
  }

  const now = new Date();
  const expiresAt =
    cycle === "yearly"
      ? new Date(new Date(now).setFullYear(now.getFullYear() + 1))
      : new Date(new Date(now).setMonth(now.getMonth() + 1));

  // Expire existing subscriptions
  await UserSubscription.updateMany(
    { ownerId, status: "active" },
    { $set: { status: "expired" } }
  );


  await pendingDowngradeModel.deleteOne({ ownerId });

  const subscription = await UserSubscription.create({
    ownerId,
    planKey,
    cycle,
    startedAt: now,
    expiresAt,
    status: "active",
    isTrial: false,
    source: "admin",
    priceSnapshot: {
      amount: price,
      currency,
      platform: "admin",
    },
  });

  return res.json({
    success: true,
    data: subscription,
  });
};

export const adminListSubscriptions = async (_req: any, res: any) => {
  const subscriptions = await UserSubscription.find()
    .populate("ownerId","_id fullPhone email name profileImage")
    .lean();


  if (!subscriptions || subscriptions.length === 0) {
    throw createError(404, "NO_AVAILABLE_PLANS");
  }

  return res.json({
    success: true,
    data: subscriptions ?? [],
  });
};

export const adminGetUserSubscription = async (req: any, res: any) => {
  const { ownerId } = req.params;

  if (!ownerId || !Types.ObjectId.isValid(ownerId)) {
    throw createError(400, req.t("INVALID_OWNER_ID"));
  }

  const subscription = await UserSubscription.findOne({
    ownerId,
    status: "active",
  }).lean();

    
  if (!subscription) {
    throw createError(404, req.t("SUBSCRIPTION_NOT_FOUND"));
  }

  return res.json({
    success: true,
    data: subscription ?? null,
  });
};
