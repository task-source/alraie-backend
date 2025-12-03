import { Request, Response } from "express";
import createError from "http-errors";
import Geofence from "../models/geofence.model";
import UserModel, { IUserDocument } from "../models/user";
import AnimalModel from "../models/animal.model";
import mongoose from "mongoose";
import { reverseGeocode } from "../utils/geo";

function resolveOwner(
    actor: mongoose.Document<unknown, {}, IUserDocument, {}, {}> & IUserDocument & Required<{ _id: mongoose.Types.ObjectId; }> & { __v: number; }, 
    req: { body: { ownerId: any; }; }) {
  if (actor.role === "owner") return actor._id;
  if (actor.role === "assistant") return actor.ownerId;
  if ((actor.role === "admin" || actor.role === "superadmin") && req.body.ownerId) return req.body.ownerId;
  throw createError(400, "OWNER_ID_REQUIRED");
}

export const createGeofence = async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  const ownerId = resolveOwner(actor, req);
  const owner = await UserModel.findById(ownerId);
  if (!owner) throw createError(404, req.t("OWNER_NOT_FOUND"));

  const { center, radiusKm, name } = req.body;
  const geoData = await reverseGeocode(center.lat, center.lng);

  const geofence = await Geofence.create({
    name,
    ownerId,
    createdBy: actor._id,
    center,
    radiusKm,
    city: geoData.city,
    country: geoData.country,
    address: geoData.address
  });

  res.status(201).json({ success: true, data: geofence });
};

export const listGeofences = async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  let ownerFilter = {};
  if (actor.role === "owner") ownerFilter = { ownerId: actor._id };
  else if (actor.role === "assistant") ownerFilter = { ownerId: actor.ownerId };
  else if ((actor.role === "admin" || actor.role === "superadmin") && req.query.ownerId)
    ownerFilter = { ownerId: req.query.ownerId };

  const page = Math.max(1, +req.query.page || 1);
  const limit = Math.min(100, +req.query.limit || 20);
  const skip = (page - 1) * limit;

  const filter: any = { ...ownerFilter };
  if (req.query.search) filter.name = { $regex: req.query.search, $options: "i" };

  const [items, total] = await Promise.all([
    Geofence.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean().populate({
      path: "animals",
      select: "-__v -createdAt -updatedAt"
    }).select("-__v"),
    Geofence.countDocuments(filter)
  ]);

  res.json({ success: true, items, total, page, limit });
};

export const updateGeofence = async (req: any, res: Response) => {
  const geo = await Geofence.findById(req.params.id);
  if (!geo) throw createError(404, req.t("NOT_FOUND"));

  const actor = await UserModel.findById(req.user.id);

  if (actor?.role === "owner" && geo.ownerId.toString() !== actor?._id.toString())
    throw createError(403, req.t("FORBIDDEN"));
  if (actor?.role === "assistant" && geo.ownerId.toString() !== actor?.ownerId?.toString())
    throw createError(403, req.t("FORBIDDEN"));

  const { center } = req.body;

  if (center?.lat && center?.lng) {
    const geoData = await reverseGeocode(center.lat, center.lng);

    req.body.city = geoData.city;
    req.body.country = geoData.country;
    req.body.address = geoData.address;
  }

  Object.assign(geo, req.body);
  await geo.save();

  res.json({ success: true, data: geo });
};

export const deleteGeofence = async (req: any, res: Response) => {
  const geo = await Geofence.findById(req.params.id);
  if (!geo) throw createError(404, req.t("NOT_FOUND"));

  const actor = await UserModel.findById(req.user.id);

  if (actor?.role === "owner" && geo.ownerId.toString() !== actor?._id.toString())
    throw createError(403, req.t("FORBIDDEN"));
  if (actor?.role === "assistant" && geo.ownerId.toString() !== actor?.ownerId?.toString())
    throw createError(403, req.t("FORBIDDEN"));

  await geo.deleteOne();
  res.json({ success: true, message: req.t("DELETED") });
};

export const addAnimalsToGeofence = async (req: any, res: Response) => {
  const { id: geofenceId } = req.params;
  const { uniqueAnimalIds } = req.body;

  if (
    !Array.isArray(uniqueAnimalIds) ||
    uniqueAnimalIds.length === 0 ||
    !uniqueAnimalIds.every((x) => typeof x === "string")
  ) {
    throw createError(400, req.t("INVALID_ANIMALID") || "uniqueAnimalIds must be an array of strings");
  }

  const geo = await Geofence.findById(geofenceId);
  if (!geo) throw createError(404, req.t("GEOFENCE_NOT_FOUND"));

  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  if (actor.role === "owner" && geo.ownerId.toString() !== actor._id.toString()) {
    throw createError(403, req.t("FORBIDDEN"));
  }
  if (actor.role === "assistant" && geo.ownerId.toString() !== actor.ownerId?.toString()) {
    throw createError(403, req.t("FORBIDDEN"));
  }


  const animals = await AnimalModel.find({
    uniqueAnimalId: { $in: uniqueAnimalIds },
    ownerId: geo.ownerId,
  }).lean();

  if (animals.length !== uniqueAnimalIds.length) {
    const foundIds = animals.map((a) => a.uniqueAnimalId);
    const missing = uniqueAnimalIds.filter((id) => !foundIds.includes(id));
    throw createError(400, `${req.t("ANIMALS_NOT_FOUND")}: ${missing.join(", ")}`);
  }

  const animalIds = animals.map((a) => a._id);

  const existingConflict = await Geofence.findOne({
    animals: { $in: animalIds },
  })
    .select("_id name animals")
    .lean();

  if (existingConflict) {
    const conflicted = animals.filter((a) =>
      existingConflict.animals.some((id: any) => id.toString() === a._id.toString())
    );

    const conflictList = conflicted.map((a) => a.uniqueAnimalId).join(", ");

    throw createError(
      400,
      `${req.t("ANIMAL_ALREADY_IN_GEOFENCE") || "Animal already in another geofence"}: ${conflictList}`
    );
  }

  await Geofence.updateOne(
    { _id: geo._id },
    { $addToSet: { animals: { $each: animalIds } } }
  );

  res.json({
    success: true,
    message: req.t("ANIMAL_ADDED_GEOFENCE") || "Animals added to geofence",
    added: animalIds.length,
  });
};

export const removeAnimalFromGeofence = async (req: any, res: Response) => {
  const geo = await Geofence.findById(req.params.id);
  if (!geo) throw createError(404, req.t("NOT_FOUND"));

  const actor = await UserModel.findById(req.user.id);

  if (actor?.role === "owner" && geo.ownerId.toString() !== actor?._id.toString())
    throw createError(403, req.t("FORBIDDEN"));
  if (actor?.role === "assistant" && geo.ownerId.toString() !== actor?.ownerId?.toString())
    throw createError(403, req.t("FORBIDDEN"));

  const animal = await AnimalModel.findOne({
    uniqueAnimalId: req.params.uniqueAnimalId,
    ownerId: geo.ownerId,
  });

  if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));

  await Geofence.updateOne(
    { _id: geo._id },
    { $pull: { animals: animal._id } }
  );

  res.json({ success: true, message: req.t("ANIMAL_REMOVED_GEOFENCE") });
};

export const getAnimalsWithGpsNotInGeofence = async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  let ownerId: string | null = null;

  if (actor.role === "owner") {
    ownerId = actor._id.toString();
  } 
  else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    ownerId = actor.ownerId.toString();
  } 
  else if ((actor.role === "admin" || actor.role === "superadmin")) {
    if (!req.query.ownerId) {
      throw createError(400, req.t("OWNER_ID_REQUIRED_FOR_ADMIN"));
    }
    ownerId = req.query.ownerId;
  } 
  else {
    throw createError(403, req.t("FORBIDDEN"));
  }

  if (ownerId && !mongoose.Types.ObjectId.isValid(ownerId)) {
    throw createError(400, req.t("INVALID_OWNER_ID"));
  }

  const geofences = await Geofence.find({ ownerId })
    .select("animals")
    .lean();

  const geoAnimalIds = new Set<string>();
  for (const g of geofences) {
    for (const id of g.animals) {
      geoAnimalIds.add(String(id));
    }
  }

  const filter = {
    ownerId,
    gpsDeviceId: { $ne: null },
    _id: { $nin: Array.from(geoAnimalIds) },
  };

  const animals = await AnimalModel.find(filter)
    .select("-__v")
    .lean();

  res.json({
    success: true,
    count: animals.length,
    data: animals,
  });
};