import { Request, Response } from "express";
import createError from "http-errors";
import Geofence from "../models/geofence.model";
import UserModel, { IUserDocument } from "../models/user";
import AnimalModel from "../models/animal.model";
import mongoose from "mongoose";

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

  const geofence = await Geofence.create({
    name: req.body.name,
    ownerId,
    createdBy: actor._id,
    center: req.body.center,
    radiusKm: req.body.radiusKm,
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

export const addAnimalToGeofence = async (req: any, res: Response) => {
  const geo = await Geofence.findById(req.params.id);
  if (!geo) throw createError(404, req.t("GEOFENCE_NOT_FOUND"));

  const actor = await UserModel.findById(req.user.id);

  if (actor?.role === "owner" && geo.ownerId.toString() !== actor?._id.toString())
    throw createError(403, req.t("FORBIDDEN"));
  if (actor?.role === "assistant" && geo.ownerId.toString() !== actor?.ownerId?.toString())
    throw createError(403, req.t("FORBIDDEN"));

  const animal = await AnimalModel.findOne({
    uniqueAnimalId: req.body.uniqueAnimalId,
    ownerId: geo.ownerId,
  });

  if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));

  await Geofence.updateOne(
    { _id: geo._id },
    { $addToSet: { animals: animal._id } }
  );

  res.json({ success: true, message: req.t("ANIMAL_ADDED_GEOFENCE") });
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
