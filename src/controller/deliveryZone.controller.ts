import { Request, Response } from "express";
import createError from "http-errors";
import { asyncHandler } from "../middleware/asyncHandler";
import DeliveryZone from "../models/deliveryZone.model";
import { Types } from "mongoose";

export const createDeliveryZone = asyncHandler(async (req: any, res: Response) => {
  const exists = await DeliveryZone.findOne({
    country: req.body.country.toUpperCase(),
    state: req.body.state,
    city: req.body.city,
  });

  if (exists) {
    throw createError(400, req.t("DELIVERY_ZONE_ALREADY_EXISTS"));
  }

  const zone = await DeliveryZone.create(req.body);

  res.status(201).json({
    success: true,
    data: zone,
  });
});

export const listDeliveryZones = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      search,
      country,
      state,
      city,
      currency,
      isActive,

      page = "1",
      limit = "20",

      sortBy = "priority",
      sortOrder = "desc",
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Number(limit));
    const skip = (pageNum - 1) * limitNum;

    const filter: any = {};

    if (country) filter.country = country.toUpperCase();
    if (state) filter.state = state;
    if (city) filter.city = city;
    if (currency) filter.currency = currency.toUpperCase();

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    if (search) {
      const regex = new RegExp(search, "i");
      filter.$or = [
        { country: regex },
        { state: regex },
        { city: regex },
      ];
    }

    const allowedSortFields = [
      "createdAt",
      "country",
      "priority",
      "deliveryFee",
      "taxPercent",
    ];

    const sortField = allowedSortFields.includes(sortBy)
      ? sortBy
      : "priority";

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const sort: any = {
      [sortField]: sortDirection,
      country: 1,
    };

    const [items, total] = await Promise.all([
      DeliveryZone.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      DeliveryZone.countDocuments(filter),
    ]);

    res.json({
      success: true,
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  }
);

export const updateDeliveryZone = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_DELIVERY_ZONE_ID"));
  }

  const zone = await DeliveryZone.findById(id);
  if (!zone) {
    throw createError(404, req.t("DELIVERY_ZONE_NOT_FOUND"));
  }

  Object.assign(zone, req.body);
  await zone.save();

  res.json({
    success: true,
    data: zone,
  });
});


export const deleteDeliveryZone = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_DELIVERY_ZONE_ID"));
  }

  const zone = await DeliveryZone.findById(id);
  if (!zone) {
    throw createError(404, req.t("DELIVERY_ZONE_NOT_FOUND"));
  }

  await zone.deleteOne();

  res.json({
    success: true,
    message: req.t("DELIVERY_ZONE_DELETED"),
  });
});
