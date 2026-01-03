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

export const listPlans = async (req: any, res: any) => {
  const {
    search,
    planKey,
    isActive,
    isPublic,
    sortBy = "createdAt",
    order = "desc",
    page = "1",
    limit = "10",
  } = req.query;


  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
  const skip = (pageNum - 1) * limitNum;


  const filter: any = {};

  if (planKey) {
    filter.planKey = planKey;
  }

  if (typeof isActive !== "undefined") {
    filter.isActive = isActive === "true";
  }

  if (typeof isPublic !== "undefined") {
    filter.isPublic = isPublic === "true";
  }

  if (search && typeof search === "string") {
    filter.$or = [
      { name_en: { $regex: search, $options: "i" } },
      { name_ar: { $regex: search, $options: "i" } },
      { description_en: { $regex: search, $options: "i" } },
      { description_ar: { $regex: search, $options: "i" } },
    ];
  }

  const allowedSortFields = [
    "createdAt",
    "updatedAt",
    "planKey",
    "maxAnimals",
    "maxAssistants",
  ];

  if (!allowedSortFields.includes(sortBy)) {
    throw createError(400, req.t("INVALID_SORT_FIELD"));
  }

  const sortOrder = order === "asc" ? 1 : -1;

  const [plans, total] = await Promise.all([
    SubscriptionPlan.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    SubscriptionPlan.countDocuments(filter),
  ]);

  if (total === 0) {
    throw createError(404, req.t("PLAN_NOT_FOUND"));
  }

  return res.json({
    success: true,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
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
