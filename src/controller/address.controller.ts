import { Request, Response } from "express";
import createError from "http-errors";
import Address from "../models/address.model";
import { asyncHandler } from "../middleware/asyncHandler";
import  {Types} from "mongoose";

/**
 * Create address
 */
export const createAddress = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.id;

  if (req.body.isDefault === true) {
    await Address.updateMany(
      { userId },
      { $set: { isDefault: false } }
    );
  }

  const address = await Address.create({
    ...req.body,
    userId,
  });

  res.status(201).json({ success: true, data: address });
});

/**
 * List addresses
 */
export const listAddresses = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user.id;

  const addresses = await Address.find({ userId })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();

  res.json({ success: true, data: addresses });
});

/**
 * Update address
 */
export const updateAddress = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;

  const address = await Address.findOne({ _id: id, userId });
  if (!address) throw createError(404, "ADDRESS_NOT_FOUND");

  if (req.body.isDefault === true) {
    await Address.updateMany(
      { userId },
      { $set: { isDefault: false } }
    );
  }

  Object.assign(address, req.body);
  await address.save();

  res.json({ success: true, data: address });
});

/**
 * Delete address
 */
export const deleteAddress = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;

  const address = await Address.findOne({ _id: id, userId });
  if (!address) throw createError(404, "ADDRESS_NOT_FOUND");

  await address.deleteOne();

  res.json({ success: true, message: "ADDRESS_DELETED" });
});

/**
 * Set default address
 */
export const setDefaultAddress = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;

  if (!id || !Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_ADDRESS_ID"));
  }

  const address = await Address.findOne({ _id: id, userId });
  if (!address) throw createError(404, "ADDRESS_NOT_FOUND");

  await Address.updateMany(
    { userId },
    { $set: { isDefault: false } }
  );

  address.isDefault = true;
  await address.save();

  res.json({ success: true, message: "DEFAULT_ADDRESS_UPDATED" });
});
