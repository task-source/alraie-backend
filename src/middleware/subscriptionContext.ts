import { Response, NextFunction } from "express";
import UserSubscription from "../models/userSubscription.model";
import SubscriptionPlan from "../models/subscriptionPlan.model";
import Animal from "../models/animal.model";
import User from "../models/user";

export async function subscriptionContext(
  req: any,
  _res: Response,
  next: NextFunction
) {
  if (!req.user) return next();

  const ownerId =
    req.user.role === "owner"
      ? req.user.id
      : req.user.role === "assistant"
      ? req.user.ownerId
      : null;

  if (!ownerId) {
    req.subscription = null;
    return next();
  }

  const subscription = await UserSubscription.findOne({
    ownerId,
    status: "active",
    expiresAt: { $gt: new Date() },
  }).lean();

  if (!subscription) {
    req.subscription = null;
    return next();
  }

  const plan = await SubscriptionPlan.findOne({
    planKey: subscription.planKey,
    isActive: true,
  }).lean();

  if (!plan) {
    req.subscription = null;
    return next();
  }

  const [animalCount, assistantCount] = await Promise.all([
    Animal.countDocuments({
      ownerId,
      animalStatus: { $ne: "inactive" },
    }),
    User.countDocuments({
      ownerId,
      role: "assistant",
    }),
  ]);

  req.subscription = {
    ownerId,
    planKey: plan.planKey,
    cycle: subscription.cycle,
    isTrial: subscription.isTrial,
    startedAt: subscription.startedAt,
    expiresAt: subscription.expiresAt,
    priceSnapshot: subscription.priceSnapshot,

    limits: {
      animals: plan.maxAnimals,
      assistants: plan.maxAssistants,
    },

    usage: {
      animals: animalCount,
      assistants: assistantCount,
    },

    remaining: {
      animals: Math.max(plan.maxAnimals - animalCount, 0),
      assistants: Math.max(plan.maxAssistants - assistantCount, 0),
    },
  };

  next();
}
