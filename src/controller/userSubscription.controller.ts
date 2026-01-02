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

export const adminListSubscriptions = async (req: any, res: any) => {
  const q = req.query;

  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Number(q.limit) || 20);
  const skip = (page - 1) * limit;

  const allowedSortFields = [
    "createdAt",
    "expiresAt",
    "startedAt",
    "planKey",
  ];

  const sortBy = allowedSortFields.includes(q.sortBy)
    ? q.sortBy
    : "createdAt";

  const sortOrder = q.sortOrder === "asc" ? 1 : -1;
  const sort: any = { [sortBy]: sortOrder };

  const filter: any = {};

  if (q.status) filter.status = q.status;
  if (q.planKey) filter.planKey = q.planKey;
  if (q.cycle) filter.cycle = q.cycle;
  if (q.source) filter.source = q.source;

  if (q.currency) {
    filter["priceSnapshot.currency"] = q.currency;
  }

  if (q.ownerId) {
    if (!Types.ObjectId.isValid(q.ownerId)) {
      throw createError(400, "INVALID_OWNER_ID");
    }
    filter.ownerId = q.ownerId;
  }

  let ownerMatch: any = {};
  if (q.search) {
    const s = String(q.search).trim();
    ownerMatch = {
      $or: [
        { "owner.name": { $regex: s, $options: "i" } },
        { "owner.email": { $regex: s, $options: "i" } },
        { "owner.fullPhone": { $regex: s, $options: "i" } },
      ],
    };
  }

  const pipeline: any[] = [
    { $match: filter },

    {
      $lookup: {
        from: "users",
        localField: "ownerId",
        foreignField: "_id",
        as: "owner",
      },
    },
    { $unwind: "$owner" },

    ...(q.search ? [{ $match: ownerMatch }] : []),

    { $sort: sort },

    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    },
  ];

  const result = await UserSubscription.aggregate(pipeline);

  const items = result[0]?.items || [];
  const total = result[0]?.total?.[0]?.count || 0;

  if (total === 0) {
    throw createError(404, "NO_SUBSCRIPTIONS_FOUND");
  }

  return res.json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
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
