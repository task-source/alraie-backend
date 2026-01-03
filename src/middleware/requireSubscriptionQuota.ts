import { Response, NextFunction } from "express";
import createError from "http-errors";
import SubscriptionPlan from "../models/subscriptionPlan.model";
import Animal from "../models/animal.model";
import User from "../models/user";
import UserSubscription from "../models/userSubscription.model";

export function requireQuota(type: "animal" | "assistant") {
  return async (req: any, _res: Response, next: NextFunction) => {
    if (!req.user) return next();

    if (req.user.role === "disabled") {
      throw createError(403, req.t("ACCOUNT_DISABLED"));
    }

    const ownerId =
      req.user.role === "owner"
        ? req.user.id
        : req.user.role === "assistant"
        ? req.user.ownerId
        : null;

    if (!ownerId) return next();

    const subscription = await UserSubscription.findOne({
      ownerId,
      status: "active",
      expiresAt: { $gt: new Date() },
    }).lean();

    if (!subscription) {
      throw createError(403, req.t("NO_ACTIVE_SUBSCRIPTION"));
    }

    const plan = await SubscriptionPlan.findOne({
      planKey: subscription.planKey,
      isActive: true,
    }).lean();

    if (!plan) {
      throw createError(403, req.t("INVALID_SUBSCRIPTION_PLAN"));
    }

    if (type === "animal") {
      const count = await Animal.countDocuments({
        ownerId,
        animalStatus: { $ne: "inactive" },
      });

      if (count >= plan.maxAnimals) {
        throw createError(403, req.t("ANIMAL_LIMIT_REACHED"));
      }
    }

    if (type === "assistant") {
      const count = await User.countDocuments({
        ownerId,
        role: "assistant",
      });

      if (count >= plan.maxAssistants) {
        throw createError(403, req.t("ASSISTANT_LIMIT_REACHED"));
      }
    }

    next();
  };
}
