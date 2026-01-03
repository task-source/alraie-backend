import createError from "http-errors";
import SubscriptionPlan from "../models/subscriptionPlan.model";
import UserSubscription from "../models/userSubscription.model";
import PendingDowngrade from "../models/pendingDowngrade.model";
import { verifyAppleReceipt } from "../services/appleReciept.service";
import { verifyGoogleSubscription } from "../services/googleReciept.service";

export const getMySubscription = async (req: any, res: any) => {
    const ownerId =
      req.user.role === "assistant"
        ? req.user.ownerId
        : req.user.id;
  
    if (!ownerId) {
      throw createError(403, req.t("OWNER_NOT_FOUND_FOR_ASSISTANT"));
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

export const listAvailablePlans = async (_req: any, res: any) => {
  const plans = await SubscriptionPlan.find({
    isPublic: true,
    isActive: true,
  }).lean();

  if (!plans || plans.length === 0) {
    throw createError(404, "NO_AVAILABLE_PLANS");
  }

  return res.json({ success: true, data: plans });
};


export const scheduleDowngrade = async (req: any, res: any) => {
  const { planKey, cycle } = req.body;

  const current = await UserSubscription.findOne({
    ownerId: req.user.id,
    status: "active",
  });

  if (!current) {
    throw createError(400, req.t("NO_ACTIVE_SUBSCRIPTION"));
  }

  if (current.planKey === planKey && current.cycle === cycle) {
    throw createError(400, req.t("SAME_PLAN_DOWNGRADE_NOT_ALLOWED"));
  }

  if (current.status !== "active") {
    throw createError(400, "SUBSCRIPTION_NOT_ACTIVE");
  }
  
  await PendingDowngrade.findOneAndUpdate(
    { ownerId: req.user.id },
    {
      ownerId: req.user.id,
      targetPlanKey: planKey,
      targetCycle: cycle,
      effectiveAt: current.expiresAt,
    },
    { upsert: true, new: true }
  );

  return res.json({
    success: true,
    message: req.t("DOWNGRADE_SCHEDULED"),
    effectiveAt: current.expiresAt,
  });
};

export const cancelSubscription = async (req: any, res: any) => {
  const ownerId = req.user.id;

  const result = await UserSubscription.updateMany(
    { ownerId, status: "active" },
    { $set: { status: "cancelled" } }
  );

  if (result.modifiedCount === 0) {
    throw createError(400, req.t("NO_ACTIVE_SUBSCRIPTION"));
  }

  await PendingDowngrade.deleteOne({ ownerId });

  return res.json({
    success: true,
    message: req.t("SUBSCRIPTION_CANCELLED"),
  });
};

export const validateSubscriptionReceipt = async (req: any, res: any) => {
  const {
    platform, // "apple" | "google"
    receipt,
    purchaseToken,
    productId,
    planKey,
    cycle,
  } = req.body;


  const plan = await SubscriptionPlan.findOne({
    planKey,
    isActive: true,
  });

  if (!plan) {
    throw createError(404, req.t("PLAN_NOT_FOUND"));
  }

  const expectedProductId =
    platform === "apple"
      ? cycle === "monthly"
        ? plan.iosProductId_monthly
        : plan.iosProductId_yearly
      : cycle === "monthly"
        ? plan.androidProductId_monthly
        : plan.androidProductId_yearly;

  if (!expectedProductId) {
    throw createError(400, req.t("PLAN_CYCLE_NOT_SUPPORTED"));
  }

  if (expectedProductId !== productId) {
    throw createError(400, req.t("PRODUCT_ID_MISMATCH"));
  }

  let result;

  if (platform === "apple") {
    if (!receipt) {
      throw createError(400, req.t("APPLE_RECEIPT_REQUIRED"));
    }
    result = await verifyAppleReceipt(receipt);
  } else {
    if (!purchaseToken) {
      throw createError(400, req.t("GOOGLE_PURCHASE_TOKEN_REQUIRED"));
    }
    result = await verifyGoogleSubscription(purchaseToken, productId);
  }

  if (!result.valid || !result.expiresAt) {
    throw createError(401, req.t("INVALID_RECEIPT"));
  }

  const existing = await UserSubscription.findOne({
    ownerId: req.user.id,
    source: platform,
    externalReference: productId,
    expiresAt: result.expiresAt,
  });

  if (existing) {
    return res.json({
      success: true,
      data: existing,
    });
  }

  await UserSubscription.updateMany(
    { ownerId: req.user.id, status: "active" },
    { $set: { status: "expired" } }
  );

  const subscription = await UserSubscription.create({
    ownerId: req.user.id,
    planKey,
    cycle,
    startedAt: new Date(),
    expiresAt: result.expiresAt,
    status: "active",
    isTrial: Boolean(result.isTrial),
    source: platform,
    externalReference: productId,
  });

  return res.json({
    success: true,
    data: subscription,
  });
};
