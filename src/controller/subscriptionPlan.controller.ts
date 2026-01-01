import createError from "http-errors";
import { Types } from "mongoose";
import SubscriptionPlan from "../models/subscriptionPlan.model";

export const createPlan = async (req: any, res: any) => {
  const exists = await SubscriptionPlan.findOne({
    planKey: req.body.planKey,
  });

  if (exists) {
    throw createError(400, req.t("PLAN_ALREADY_EXISTS"));
  }

  const plan = await SubscriptionPlan.create(req.body);

  return res.status(201).json({
    success: true,
    data: plan,
  });
};

export const listPlans = async (_req: any, res: any) => {
  const plans = await SubscriptionPlan.find().lean();

  return res.json({
    success: true,
    data: plans,
  });
};

export const getPlan = async (req: any, res: any) => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PLAN_ID"));
  }

  const plan = await SubscriptionPlan.findById(id);

  if (!plan) {
    throw createError(404, req.t("PLAN_NOT_FOUND"));
  }

  return res.json({
    success: true,
    data: plan,
  });
};

export const updatePlan = async (req: any, res: any) => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PLAN_ID"));
  }

  const plan = await SubscriptionPlan.findByIdAndUpdate(
    id,
    req.body,
    { new: true }
  );

  if (!plan) {
    throw createError(404, req.t("PLAN_NOT_FOUND"));
  }

  return res.json({
    success: true,
    data: plan,
  });
};

export const deactivatePlan = async (req: any, res: any) => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PLAN_ID"));
  }

  const result = await SubscriptionPlan.updateOne(
    { _id: id },
    { $set: { isActive: false } }
  );

  if (result.matchedCount === 0) {
    throw createError(404, req.t("PLAN_NOT_FOUND"));
  }

  return res.json({ success: true });
};

export const activatePlan = async (req: any, res: any) => {
  const { id } = req.params;

  if (!id || !Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PLAN_ID"));
  }

  const result = await SubscriptionPlan.updateOne(
    { _id: id },
    { $set: { isActive: true } }
  );

  if (result.matchedCount === 0) {
    throw createError(404, req.t("PLAN_NOT_FOUND"));
  }

  return res.json({ success: true });
};
