import { Request, Response } from "express";
import createError from "http-errors";
import { asyncHandler } from "../middleware/asyncHandler";
import GpsDevice from "../models/gps.model";
import AnimalModel from "../models/animal.model";
import UserModel from "../models/user";
import mongoose, {Types} from "mongoose";

/**
 * Admin/Owner adds a GPS device
 */
export const registerAndLinkGps = asyncHandler(async (req: any, res: Response) => {
  const { serialNumber, uniqueAnimalId, ownerId } = req.body;
  
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  // Resolve correct ownerId
  let resolvedOwnerId: string;

  if (actor.role === "owner") {
    resolvedOwnerId = actor._id.toString();
  } else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    resolvedOwnerId = actor.ownerId.toString();
  } else if (actor.role === "admin" || actor.role === "superadmin") {
    if (!ownerId) throw createError(400, req.t("OWNER_ID_REQUIRED_FOR_ADMIN"));
    resolvedOwnerId = ownerId;
  } else {
    throw createError(403, req.t("FORBIDDEN"));
  }

  // Fetch animal & validate ownership
  const animal = await AnimalModel.findOne({ uniqueAnimalId });
  if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));
  if (animal.ownerId.toString() !== resolvedOwnerId)
    throw createError(400, req.t("OWNER_MISMATCH"));

  // STEP 1 — check if gps exists
  let gps = await GpsDevice.findOne({ serialNumber });

  if (gps) {
    // check ownership
    if (gps.ownerId.toString() !== resolvedOwnerId)
      throw createError(403, req.t("GPS_OWNERSHIP_MISMATCH"));

    // check if already linked
    if (gps.isLinked)
      throw createError(400, req.t("GPS_ALREADY_LINKED"));
  } else {
    // CREATE NEW GPS DEVICE
    gps = await GpsDevice.create({
      serialNumber,
      ownerId: resolvedOwnerId,
      createdBy: actor._id,
      isLinked: false,
    });
  }

  // check if animal already has gps
  if (animal.gpsDeviceId)
    throw createError(400, req.t("ANIMAL_ALREADY_HAS_GPS"));

  // LINK GPS
  gps.isLinked = true;
  gps.animalId = animal._id as Types.ObjectId;;
  gps.linkedAt = new Date();
  await gps.save();

  // Update animal
  animal.gpsDeviceId = gps._id as Types.ObjectId;;
  animal.gpsSerialNumber = gps.serialNumber;
  await animal.save();

  res.json({
    success: true,
    message: req.t("GPS_REGISTERED_AND_LINKED"),
    data: { gps, animal },
  });
});

/**
 * Unlink GPS from an animal
 */
export const unlinkGpsFromAnimal = asyncHandler(async (req: any, res: Response) => {
  const { serialNumber } = req.body;

  const gps = await GpsDevice.findOne({ serialNumber });
  if (!gps) throw createError(404, req.t("GPS_NOT_FOUND"));
  if (!gps.isLinked) throw createError(400, "GPS_NOT_LINKED");

  const animal = await AnimalModel.findById(gps.animalId);
  if (animal) {
    animal.gpsDeviceId = null;
    animal.gpsSerialNumber = null;
    await animal.save();
  }

  gps.isLinked = false;
  gps.animalId = null;
  gps.linkedAt = null;
  await gps.save();

  res.json({ success: true, message: "GPS_UNLINKED" });
});


/**
 * List animals NOT linked to GPS
 */
export const getAnimalsWithoutGps = asyncHandler(async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  let filter: any = {};

  if (actor.role === "owner") {
    filter.ownerId = actor?._id;
  }
  else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    filter.ownerId = actor?.ownerId;
  }
  else if (actor.role === "admin" || actor.role === "superadmin") {
    if (req?.query?.ownerId) filter.ownerId = req?.query?.ownerId;
  }

  filter.gpsDeviceId = null;

  const animals = await AnimalModel.find(filter).lean();

  res.json({ success: true, data: animals });
});


/**
 * List animals linked to GPS
 */
export const getAnimalsWithGps = asyncHandler(async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  let filter: any = {};

  if (actor.role === "owner") filter.ownerId = actor._id;
  else if (actor.role === "assistant") filter.ownerId = actor?.ownerId;
  else if ((actor.role === "admin" || actor.role === "superadmin") && req.query.ownerId)
    filter.ownerId = req.query.ownerId;

  filter.gpsDeviceId = { $ne: null };

  const animals = await AnimalModel.find(filter).lean();

  res.json({ success: true, data: animals });
});

export const deleteGps = asyncHandler(async (req: any, res: Response) => {
  const { serialNumber } = req.body;

  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  const gps = await GpsDevice.findOne({ serialNumber });
  if (!gps) throw createError(404, req.t("GPS_NOT_FOUND"));

  const gpsOwner = gps.ownerId.toString();

  // Permission
  if (actor.role === "owner" && actor._id.toString() !== gpsOwner)
    throw createError(403, req.t("FORBIDDEN"));

  if (actor.role === "assistant" && actor.ownerId?.toString() !== gpsOwner)
    throw createError(403, req.t("FORBIDDEN"));

  // Admin can delete any GPS device
  // No further checks required for admin/superadmin

  // If linked → unlink
  if (gps?.isLinked && gps?.animalId) {
    await AnimalModel.updateOne(
      { _id: gps.animalId },
      { $set: { gpsDeviceId: null, gpsSerialNumber: null } }
    );
  }

  await gps.deleteOne();

  res.json({ success: true, message: req.t("GPS_DELETED") });
});
