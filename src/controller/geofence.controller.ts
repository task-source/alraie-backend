import { Request, Response } from "express";
import createError from "http-errors";
import Geofence from "../models/geofence.model";
import UserModel, { IUserDocument } from "../models/user";
import AnimalModel from "../models/animal.model";
import mongoose, {Types} from "mongoose";
import { reverseGeocode } from "../utils/geo";
import { asyncHandler } from "../middleware/asyncHandler";
import { AnimalType } from "../models/animalType.model";
import breedModel from "../models/breed.model";

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

export const getAnimalsWithGpsNotInGeofence = asyncHandler(async (req: any, res: Response) => {
  const q = req.query;
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
  else if (actor.role === "admin" || actor.role === "superadmin") {
    if (!q.ownerId) throw createError(400, req.t("OWNER_ID_REQUIRED_FOR_ADMIN"));
    ownerId = String(q.ownerId);
  } else {
    throw createError(403, req.t("FORBIDDEN"));
  }

  if (ownerId && !Types.ObjectId.isValid(ownerId)) {
    throw createError(400, req.t("INVALID_OWNER_ID"));
  }

  // pagination params
  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  // Build base filter
  const baseFilter: any = { ownerId: new Types.ObjectId(ownerId) };
  baseFilter.gpsDeviceId = { $ne: null };

  // search
  if (q.search) {
    const s = String(q.search);
    baseFilter.$or = [
      { name: { $regex: s, $options: "i" } },
      { uniqueAnimalId: { $regex: s, $options: "i" } },
      { tagId: { $regex: s, $options: "i" } },
    ];
  }

  // status
  if (q.status) baseFilter.animalStatus = q.status;

  // typeKey
  if (q.typeKey) {
    const type = await AnimalType.findOne({ key: String(q.typeKey) });
    if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
    baseFilter.typeId = type._id;
  }

  // breedKey
  if (q.breedKey) {
    const breedKeys = String(q.breedKey)
      .split(",")
      .map((b) => b.trim().toLowerCase());
    const validBreeds = await breedModel.find({ key: { $in: breedKeys } }).select("key").lean();
    const validKeys = validBreeds.map((b) => b.key);
    if (validKeys.length === 0) throw createError(400, req.t("INVALID_BREED_KEY"));
    baseFilter.breedKey = { $in: validKeys };
  }

  // hasVaccinated
  if (q.hasVaccinated !== undefined) {
    if (q.hasVaccinated === "true") baseFilter.hasVaccinated = true;
    else if (q.hasVaccinated === "false") baseFilter.hasVaccinated = false;
    else throw createError(400, req.t("INVALID_HAS_VACCINATED_VALUE"));
  }

  // gender
  if (q.gender) {
    const genders = String(q.gender)
      .split(",")
      .map((g) => g.trim().toLowerCase())
      .filter((g) => ["male", "female", "unknown"].includes(g));
    if (genders.length === 0) throw createError(400, req.t("INVALID_GENDER_VALUE"));
    baseFilter.gender = { $in: genders };
  }

  // ageFrom / ageTo -> dob filter
  if (q.ageFrom || q.ageTo) {
    const now = new Date();
    const ageFilter: any = {};
    if (q.ageFrom) {
      const ageFromYears = Number(q.ageFrom);
      if (!isFinite(ageFromYears) || ageFromYears < 0) throw createError(400, "INVALID_AGE_FROM");
      const maxBirthDate = new Date(now.getFullYear() - ageFromYears, now.getMonth(), now.getDate());
      ageFilter.$lte = maxBirthDate;
    }
    if (q.ageTo) {
      const ageToYears = Number(q.ageTo);
      if (!isFinite(ageToYears) || ageToYears < 0) throw createError(400, "INVALID_AGE_TO");
      const minBirthDate = new Date(now.getFullYear() - ageToYears, now.getMonth(), now.getDate());
      ageFilter.$gte = minBirthDate;
    }
    baseFilter.dob = ageFilter;
  }

  // Determine geofence animal ids for owner
  const geofences = await Geofence.find({ ownerId: new Types.ObjectId(ownerId) }).select("animals").lean();
  const geoAnimalIds = new Set<string>();
  for (const g of geofences) {
    for (const id of g.animals || []) {
      geoAnimalIds.add(String(id));
    }
  }

  // exclude geofence animals
  const finalFilter = {
    ...baseFilter,
    _id: { $nin: Array.from(geoAnimalIds).map((id) => new Types.ObjectId(id)) },
  };

  // Sorting
  let sort: any = {};
  switch (q.sort) {
    case "name_asc": sort.name = 1; break;
    case "name_desc": sort.name = -1; break;
    case "age_young_to_old": sort.dob = -1; break;
    case "age_old_to_young": sort.dob = 1; break;
    case "date_latest": sort.createdAt = -1; break;
    case "date_oldest": sort.createdAt = 1; break;
    default: sort.createdAt = -1; break;
  }

  const [items, total] = await Promise.all([
    AnimalModel.find(finalFilter)
      .populate({ path: "gpsDeviceId", select: "serialNumber", options: { lean: true } })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    AnimalModel.countDocuments(finalFilter),
  ]);


  res.json({
    success: true,
    items,
    total,
    page,
    limit,
  });
});

export const getGeofenceDetails = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  if (!id || !Types.ObjectId.isValid(id)) throw createError(400, req.t("Invalid_Geofence_Id"));
  const geo = await Geofence.findById(id)
    .populate({ path: "ownerId", select: "name email phone language role" })
    .populate({ path: "createdBy", select: "name email role" })
    .lean();

  if (!geo) throw createError(404, req.t("GEOFENCE_NOT_FOUND"));

  const actor = await UserModel.findById(req.user.id).lean();
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  // Permission rules
  if (actor.role === "owner" && geo.ownerId._id.toString() !== actor._id.toString())
    throw createError(403, req.t("FORBIDDEN"));

  if (actor.role === "assistant" && geo.ownerId._id.toString() !== actor?.ownerId?.toString())
    throw createError(403, req.t("FORBIDDEN"));

  res.json({
    success: true,
    geofence: {
      _id: geo._id,
      name: geo.name,
      ownerId: geo.ownerId,
      createdBy: geo.createdBy,
      center: geo.center,
      radiusKm: geo.radiusKm,
      city: geo.city ?? null,
      country: geo.country ?? null,
      address: geo.address ?? null,
      createdAt: geo.createdAt,
      updatedAt: geo.updatedAt,
      totalAnimals: Array.isArray(geo.animals) ? geo.animals.length : 0
    },
  });
});

export const getGeofenceAnimals = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  if (!id || !Types.ObjectId.isValid(id)) throw createError(400, req.t("Invalid_Geofence_Id"));
  const q = req.query;

  const geo = await Geofence.findById(id).lean();
  if (!geo) throw createError(404, req.t("GEOFENCE_NOT_FOUND"));

  const actor = await UserModel.findById(req.user.id).lean();
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  // Role-based access control
  if (actor.role === "owner" && geo.ownerId.toString() !== actor._id.toString())
    throw createError(403, req.t("FORBIDDEN"));

  if (actor.role === "assistant" && geo.ownerId.toString() !== actor?.ownerId?.toString())
    throw createError(403, req.t("FORBIDDEN"));

  // pagination
  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  // base filter → animals of this geofence only
  const filter: any = {
    _id: { $in: geo.animals.map((id: any) => new Types.ObjectId(String(id))) },
    ownerId: geo.ownerId,
  };

  // search
  if (q.search) {
    const s = String(q.search);
    filter.$or = [
      { name: { $regex: s, $options: "i" } },
      { uniqueAnimalId: { $regex: s, $options: "i" } },
      { tagId: { $regex: s, $options: "i" } },
    ];
  }

  // status
  if (q.status) filter.animalStatus = q.status;

  // gender
  if (q.gender) {
    const genders = String(q.gender)
      .split(",")
      .map((g) => g.trim().toLowerCase())
      .filter((g) => ["male", "female", "unknown"].includes(g));

    if (genders.length === 0) throw createError(400, req.t("INVALID_GENDER_VALUE"));
    filter.gender = { $in: genders };
  }

  // typeKey
  if (q.typeKey) {
    const type = await AnimalType.findOne({ key: String(q.typeKey) });
    if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
    filter.typeId = type._id;
  }

  // breedKey
  if (q.breedKey) {
    const breedKeys = String(q.breedKey).split(",").map((b) => b.trim().toLowerCase());
    const validBreeds = await breedModel.find({ key: { $in: breedKeys } }).select("key").lean();
    const validKeys = validBreeds.map((b) => b.key);
    if (validKeys.length === 0) throw createError(400, req.t("INVALID_BREED_KEY"));
    filter.breedKey = { $in: validKeys };
  }

  // hasVaccinated
  if (q.hasVaccinated !== undefined) {
    if (q.hasVaccinated === "true") filter.hasVaccinated = true;
    else if (q.hasVaccinated === "false") filter.hasVaccinated = false;
    else throw createError(400, req.t("INVALID_HAS_VACCINATED_VALUE"));
  }

  // age filters
  if (q.ageFrom || q.ageTo) {
    const now = new Date();
    const ageFilter: any = {};
    if (q.ageFrom) {
      const ageFromYears = Number(q.ageFrom);
      if (!isFinite(ageFromYears) || ageFromYears < 0) throw createError(400, "INVALID_AGE_FROM");
      ageFilter.$lte = new Date(now.getFullYear() - ageFromYears, now.getMonth(), now.getDate());
    }
    if (q.ageTo) {
      const ageToYears = Number(q.ageTo);
      if (!isFinite(ageToYears) || ageToYears < 0) throw createError(400, "INVALID_AGE_TO");
      ageFilter.$gte = new Date(now.getFullYear() - ageToYears, now.getMonth(), now.getDate());
    }
    filter.dob = ageFilter;
  }

  // sorting
  let sort: any = {};
  switch (q.sort) {
    case "name_asc": sort.name = 1; break;
    case "name_desc": sort.name = -1; break;
    case "age_young_to_old": sort.dob = -1; break;
    case "age_old_to_young": sort.dob = 1; break;
    case "date_latest": sort.createdAt = -1; break;
    case "date_oldest": sort.createdAt = 1; break;
    default: sort.createdAt = -1; break;
  }

  const [items, total] = await Promise.all([
    AnimalModel.find(filter)
      .populate({ path: "gpsDeviceId", select: "serialNumber", options: { lean: true } })
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),

    AnimalModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    total,
    page,
    limit,
    items,
  });
});