import { Request, Response } from "express";
import createError from "http-errors";
import { asyncHandler } from "../middleware/asyncHandler";
import GpsDevice from "../models/gps.model";
import AnimalModel from "../models/animal.model";
import UserModel from "../models/user";
import  {Types} from "mongoose";
import { decrypt, encrypt } from "../utils/crypto";
import { AnimalType } from "../models/animalType.model";
import breedModel from "../models/breed.model";

/**
 * Admin/Owner adds a GPS device
 */
export const registerAndLinkGps = asyncHandler(async (req: any, res: Response) => {
  const { serialNumber, uniqueAnimalId, ownerId,username,password,clientToken } = req.body;
  
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

    gps.encryptedUsername = encrypt(username);
    gps.encryptedPassword = encrypt(password);
    gps.encryptedClientToken = encrypt(clientToken);
    gps.lastCredsUpdatedAt = new Date();

  } else {
    // CREATE NEW GPS DEVICE
    gps = await GpsDevice.create({
      serialNumber,
      ownerId: resolvedOwnerId,
      createdBy: actor._id,
      isLinked: false,
      encryptedUsername: encrypt(username),
      encryptedPassword: encrypt(password),
      encryptedClientToken: encrypt(clientToken),
      lastCredsUpdatedAt: new Date(),
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

  const gpsSafeResponse = {
    _id: gps._id,
    serialNumber: gps.serialNumber,
    ownerId: gps.ownerId,
    animalId: gps.animalId,
    createdBy: gps.createdBy,
    isLinked: gps.isLinked,
    linkedAt: gps.linkedAt,
    createdAt: gps.createdAt,
    updatedAt: gps.updatedAt,
  };

  res.json({
    success: true,
    message: req.t("GPS_REGISTERED_AND_LINKED"),
    data: { gps: gpsSafeResponse, animal },
  });
});

export const updateGpsCreds = asyncHandler(async (req: any, res: Response) => {
  const {
    serialNumber,
    oldPassword,    
    username,
    password,
    clientToken,
  } = req.body;

  if (!serialNumber || !oldPassword || !username || !password || !clientToken) {
    throw createError(400, req.t("INVALID_PAYLOAD") || "Missing fields");
  }

  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  const gps = await GpsDevice.findOne({ serialNumber });
  if (!gps) throw createError(404, req.t("GPS_NOT_FOUND"));

  const gpsOwner = gps.ownerId.toString();


  if (actor.role === "owner" && actor._id.toString() !== gpsOwner)
    throw createError(403, req.t("FORBIDDEN"));

  if (actor.role === "assistant" && actor.ownerId?.toString() !== gpsOwner)
    throw createError(403, req.t("FORBIDDEN"));


  if (!gps.encryptedPassword) {
    throw createError(400, "NO_EXISTING_PASSWORD");
  }

  let existingPassword: string;
  try {
    existingPassword = decrypt(gps.encryptedPassword);
  } catch (err) {
    console.error("Failed to decrypt existing GPS password", err);
    throw createError(500, "CREDENTIAL_DECRYPT_ERROR");
  }

  if (existingPassword !== oldPassword) {
    throw createError(401, req.t("OLD_PASSWORD_INCORRECT") || "Incorrect old password");
  }

  gps.encryptedUsername = encrypt(username);
  gps.encryptedPassword = encrypt(password);
  gps.encryptedClientToken = encrypt(clientToken);
  gps.lastCredsUpdatedAt = new Date();
  await gps.save();

  res.json({
    success: true,
    message: req.t("GPS_CREDENTIALS_UPDATED"),
  });
});

/**
 * Unlink GPS from an animal
 */
export const unlinkGpsFromAnimal = asyncHandler(async (req: any, res: Response) => {
  const { serialNumber } = req.body;

  const gps = await GpsDevice.findOne({ serialNumber });
  if (!gps) throw createError(404, req.t("GPS_NOT_FOUND"));
  if (!gps.isLinked) throw createError(400, req.t("GPS_NOT_LINKED"));

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

  res.json({ success: true, message: req.t("GPS_UNLINKED") });
});


/**
 * List animals NOT linked to GPS
 */
export const getAnimalsWithoutGps = asyncHandler(async (req: any, res: Response) => {
  const q = req.query;
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};

  if (actor.role === "owner") {
    filter.ownerId = actor._id;
  } else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    filter.ownerId = actor.ownerId;
  } else if (actor.role === "admin" || actor.role === "superadmin") {
    if (q.ownerId) {
      if (!Types.ObjectId.isValid(q.ownerId)) throw createError(400, req.t("INVALID_OWNER_ID"));
      filter.ownerId = new Types.ObjectId(String(q.ownerId));
    }
  } else {
    throw createError(403, req.t("FORBIDDEN"));
  }

  filter.gpsDeviceId = null;

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

  // typeKey
  if (q.typeKey) {
    const type = await AnimalType.findOne({ key: String(q.typeKey) });
    if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
    filter.typeId = type._id;
  }

  // breedKey
  if (q.breedKey) {
    const breedKeys = String(q.breedKey).split(",").map(b => b.trim().toLowerCase());
    const validBreeds = await breedModel.find({ key: { $in: breedKeys } }).select("key").lean();
    const validKeys = validBreeds.map(b => b.key);
    if (validKeys.length === 0) throw createError(400, req.t("INVALID_BREED_KEY"));
    filter.breedKey = { $in: validKeys };
  }

  // hasVaccinated
  if (q.hasVaccinated !== undefined) {
    if (q.hasVaccinated === "true") filter.hasVaccinated = true;
    else if (q.hasVaccinated === "false") filter.hasVaccinated = false;
    else throw createError(400, req.t("INVALID_HAS_VACCINATED_VALUE"));
  }

  // gender
  if (q.gender) {
    const genders = String(q.gender).split(",").map(g => g.trim().toLowerCase())
      .filter(g => ["male","female","unknown"].includes(g));
    if (genders.length === 0) throw createError(400, req.t("INVALID_GENDER_VALUE"));
    filter.gender = { $in: genders };
  }

  // ageFrom / ageTo
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
    items,
    total,
    page,
    limit
  });
});


/**
 * List animals linked to GPS
 */
export const getAnimalsWithGps = asyncHandler(async (req: any, res: Response) => {
  const q = req.query;
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};

  if (actor.role === "owner") filter.ownerId = actor._id;
  else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    filter.ownerId = actor.ownerId;
  } else if ((actor.role === "admin" || actor.role === "superadmin") && q.ownerId) {
    if (!Types.ObjectId.isValid(q.ownerId)) throw createError(400, req.t("INVALID_OWNER_ID"));
    filter.ownerId = new Types.ObjectId(String(q.ownerId));
  } else if (!(actor.role === "admin" || actor.role === "superadmin")) {
    throw createError(403, req.t("FORBIDDEN"));
  }

  filter.gpsDeviceId = { $ne: null };

  // search
  if (q.search) {
    const s = String(q.search);
    filter.$or = [
      { name: { $regex: s, $options: "i" } },
      { uniqueAnimalId: { $regex: s, $options: "i" } },
      { tagId: { $regex: s, $options: "i" } },
    ];
  }

  if (q.status) filter.animalStatus = q.status;

  // typeKey
  if (q.typeKey) {
    const type = await AnimalType.findOne({ key: String(q.typeKey) });
    if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
    filter.typeId = type._id;
  }

  // breedKey
  if (q.breedKey) {
    const breedKeys = String(q.breedKey).split(",").map(b => b.trim().toLowerCase());
    const validBreeds = await breedModel.find({ key: { $in: breedKeys } }).select("key").lean();
    const validKeys = validBreeds.map(b => b.key);
    if (validKeys.length === 0) throw createError(400, req.t("INVALID_BREED_KEY"));
    filter.breedKey = { $in: validKeys };
  }

  // hasVaccinated
  if (q.hasVaccinated !== undefined) {
    if (q.hasVaccinated === "true") filter.hasVaccinated = true;
    else if (q.hasVaccinated === "false") filter.hasVaccinated = false;
    else throw createError(400, req.t("INVALID_HAS_VACCINATED_VALUE"));
  }

  // gender
  if (q.gender) {
    const genders = String(q.gender).split(",").map(g => g.trim().toLowerCase())
      .filter(g => ["male","female","unknown"].includes(g));
    if (genders.length === 0) throw createError(400, req.t("INVALID_GENDER_VALUE"));
    filter.gender = { $in: genders };
  }

  // ageFrom / ageTo
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
    items,
    total,
    page,
    limit
  });
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
