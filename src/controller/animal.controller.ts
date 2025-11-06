import { Request, Response } from "express";
import createError from "http-errors";
import { asyncHandler } from "../middleware/asyncHandler";
import AnimalModel, { IRelation } from "../models/animal.model";
import {AnimalType} from "../models/animalType.model";
import UserModel from "../models/user";
import mongoose, { Types } from "mongoose";
import { generateUniqueAnimalId } from "../utils/uniqueAnimalId";
import { FileService } from "../services/fileService"; // adjust path if different

/**
 * Create animal
 * - multipart/form-data: profilePicture file + other fields in body
 */
export const createAnimal = asyncHandler(async (req: any, res: Response) => {

  // Note: multer has already populated req.file
  const data = req.body;

  const user = req.user; // authenticated user
  const actor = await UserModel.findById(user?.id);
  if (!user || !actor) throw createError(401, req.t("UNAUTHORIZED"));

  // determine ownerId for this animal
  let ownerId: Types.ObjectId;
  if (actor.role === "owner") {
    ownerId = new Types.ObjectId(String(actor.id));
  } else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    ownerId = new Types.ObjectId(String(actor.ownerId));
  } else if (actor.role === "admin" || actor.role === "superadmin") {
    if (!data.ownerId) throw createError(400, req.t("OWNER_ID_REQUIRED_FOR_ADMIN"));
    if (!Types.ObjectId.isValid(data.ownerId)) throw createError(400, req.t("INVALID_OWNER_ID"));
    const ownerDoc = await UserModel.findById(data.ownerId);
    if (!ownerDoc) throw createError(404, req.t("OWNER_NOT_FOUND"));
    ownerId = new Types.ObjectId(String(data.ownerId));
  } else {
    throw createError(403, req.t("FORBIDDEN"));
  }

  // resolve AnimalType by key
  const type = await AnimalType.findOne({ key: data.typeKey, isActive: true });
  
  if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));

  // profile picture upload (if present)
  let profilePictureUrl: string | undefined = undefined;
  if (req.file) {
    // save to temp location or buffer depending on your FileService. Example assumes file.path exists.
    const fileService = new FileService();
    const uploadedUrl = await fileService.uploadFile(req.file.path, `animals/${Date.now()}_${req.file.originalname}`, req.file.mimetype);
    profilePictureUrl = uploadedUrl;
    // remove temp file if FileService didn't remove it (FileService is expected to unlink)
  }

  // generate uniqueAnimalId and ensure uniqueness (simple loop)
  let uniqueAnimalId = generateUniqueAnimalId(ownerId?.toString());
  let attempts = 0;
  while (await AnimalModel.findOne({ uniqueAnimalId })) {
    uniqueAnimalId = generateUniqueAnimalId(ownerId?.toString());
    if (++attempts > 5) break;
  }
  
  const relationsWithIds = [];
  for (const r of data.relations || []) {
    const relDoc : IRelation = { relation: r.relation, uniqueAnimalId: r.uniqueAnimalId, animalId: null };
    if (r.uniqueAnimalId) {
      const other = await AnimalModel.findOne({ uniqueAnimalId: r.uniqueAnimalId }).select("_id name");
      if (other) {
        relDoc.animalId = other._id as Types.ObjectId;
        relDoc.name = other?.name ?? "";
      }
    }
    relationsWithIds.push(relDoc);
  }

  // create animal
  const animal = await AnimalModel.create({
    ownerId,
    createdBy: actor.id,
    typeId: type._id,
    typeKey: type.key,
    typeNameEn: type.name_en,
    typeNameAr: type.name_ar,
    uniqueAnimalId,
    profilePicture: profilePictureUrl,
    name: data.name,
    gender: data.gender,
    dob: data.dob ? new Date(data.dob) : undefined,
    animalStatus: data.animalStatus,
    breed: data.breed,
    country: data.country,
    fatherName: data?.fatherName ?? "",
    motherName: data?.motherName ?? "",
    relations: relationsWithIds,
    hasVaccinated: data.hasVaccinated,
    reproductiveStatus: data.reproductiveStatus,
    tagId: data.tagId,
    category: type?.category ?? "pet",
    metadata: data.metadata || {}
  });

  // resolve relations animalId for each relation entry
  if (animal.relations && animal.relations.length > 0) {
    for (const rel of animal.relations) {
      if (rel.uniqueAnimalId) {
        const other = await AnimalModel.findOne({ uniqueAnimalId: rel.uniqueAnimalId }).select("_id name");
        if (other) {
          (rel as any).animalId = other._id;
          (rel as any).name = (other as any).name;
        }
      }
    }
    await animal.save();
  }

  res.status(201).json({ success: true, message: req.t("ANIMAL_CREATED"), data: animal });
});

/**
 * List animals
 * Supports: page, limit, status, typeKey, ownerId (admin), search
 */
export const listAnimals = asyncHandler(async (req: any, res: Response) => {
  // const parsed = listAnimalsQuerySchema.safeParse({ query: req.query });
  // if (!parsed.success) {
  //   throw createError(400, parsed.error.issues.map(e => e.message).join(", "));
  // }

  const q = req.query;
  const user = req.user; // authenticated user
  const actor = await UserModel.findById(user?.id);
  
  if (!user || !actor) throw createError(401, req.t("UNAUTHORIZED"));

  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};

  if (actor.role === "admin" || actor.role === "superadmin") {
    if (q.ownerId) {
      if (!Types.ObjectId.isValid(q.ownerId)) throw createError(400, req.t("INVALID_OWNER_ID"));
      filter.ownerId = q.ownerId;
    }
  } else if (actor.role === "owner") {
    filter.ownerId = actor.id;
  } else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    filter.ownerId = actor.ownerId;
  } else {
    throw createError(403, req.t("FORBIDDEN"));
  }

  if (q.status) filter.animalStatus = q.status;
  if (q.typeKey) {
    const type = await AnimalType.findOne({ key: q.typeKey });
    if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
    filter.typeId = type._id;
  }
  if (q.search) {
    const s = q.search;
    filter.$or = [
      { name: { $regex: s, $options: "i" } },
      { uniqueAnimalId: { $regex: s, $options: "i" } },
      { tagId: { $regex: s, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    AnimalModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AnimalModel.countDocuments(filter)
  ]);

  res.json({ success: true, items, total, page, limit });
});

/**
 * Get single animal
 */
export const getAnimal = asyncHandler(async (req: any, res: Response) => {

  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) throw createError(400, req.t("invalid_animal_id"));

  const animal = await AnimalModel.findById(id);
  if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));

  const user = req.user; // authenticated user
  const actor = await UserModel.findById(user?.id);
  if (!actor || !user) throw createError(401, req.t("UNAUTHORIZED"));

  // permission
  const ownerId = animal.ownerId.toString();
  if (actor.role === "owner" && actor.id !== ownerId) throw createError(403, req.t("FORBIDDEN"));
  if (actor.role === "assistant" && (!actor.ownerId || actor.ownerId.toString() !== ownerId)) throw createError(403, req.t("FORBIDDEN"));
  // admin allowed

  res.json({ success: true, data: animal });
});

/**
 * Update animal
 * Accepts multipart (profilePicture optional) or JSON
 */
export const updateAnimal = asyncHandler(async (req: any, res: Response) => {

  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) throw createError(400, req.t("invalid_animal_id"));

  const data = req.body;

  const user = req.user; // authenticated user
  const actor = await UserModel.findById(user?.id);
  if (!actor || !user) throw createError(401, req.t("UNAUTHORIZED"));

  const animal = await AnimalModel.findById(id);
  if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));

  const ownerId = animal.ownerId.toString();
  if (actor.role === "owner" && actor.id !== ownerId) throw createError(403, req.t("FORBIDDEN"));
  if (actor.role === "assistant" && (!actor.ownerId || actor.ownerId.toString() !== ownerId)) throw createError(403, req.t("FORBIDDEN"));

  // If admin and ownerId changing, validate
  if ((actor.role === "admin" || actor.role === "superadmin") && data.ownerId) {
    if (!Types.ObjectId.isValid(data.ownerId)) throw createError(400, req.t("INVALID_OWNER_ID"));
    const ownerDoc = await UserModel.findById(data.ownerId);
    if (!ownerDoc) throw createError(404, req.t("OWNER_NOT_FOUND"));
    animal.ownerId = ownerDoc._id;
  }

  // change type if typeKey provided
  if (data.typeKey) {
    const type = await AnimalType.findOne({ key: data.typeKey, isActive: true });
    if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
    animal.typeId = type._id as Types.ObjectId;
    animal.typeKey = type.key;
    animal.typeNameEn = type.name_en;
    animal.typeNameAr = type.name_ar;
    animal.category = type?.category ?? "pet";
  }

  // handle profile picture upload if provided
  if (req.file) {
    const fileService = new FileService();
    const uploadedUrl = await fileService.uploadFile(req.file.path, `animals/${Date.now()}_${req.file.originalname}`, req.file.mimetype);
    animal.profilePicture = uploadedUrl;
  }



  // apply simple fields
  const fields = ["name","gender","dob","animalStatus","breed","country","fatherName","motherName","hasVaccinated","reproductiveStatus","tagId","metadata"];
  for (const f of fields) {
    if (data[f] !== undefined) {
      (animal as any)[f] = data[f];
    }
  }

  // relations array resolution (optional)
  if (data.relations && Array.isArray(data.relations)) {
    const resolved: any[] = [];
    for (const r of data.relations) {
      const other = await AnimalModel.findOne({ uniqueAnimalId: r.uniqueAnimalId });
      if (!other) continue; // skip unresolved
      resolved.push({ relation: r.relation, animalId: other._id, uniqueAnimalId: r.uniqueAnimalId, name: other.name });
    }
    animal.relations = resolved;
  }

  await animal.save();
  res.json({ success: true, message: req.t("ANIMAL_UPDATED"), data: animal });
});

/**
 * Delete animal (hard delete)
 */
export const deleteAnimal = asyncHandler(async (req: any, res: Response) => {

  const id = req.params.id;
  if (!Types.ObjectId.isValid(id)) throw createError(400, req.t("invalid_animal_id"));

  const user = req.user; // authenticated user
  const actor = await UserModel.findById(user?.id);
  if (!actor || !user) throw createError(401, req.t("UNAUTHORIZED"));

  const animal = await AnimalModel.findById(id);
  if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));

  const ownerId = animal.ownerId.toString();
  if (actor.role === "owner" && actor.id !== ownerId) throw createError(403, req.t("FORBIDDEN"));
  if (actor.role === "assistant" && (!actor.ownerId || actor.ownerId.toString() !== ownerId)) throw createError(403, req.t("FORBIDDEN"));

  if (animal.profilePicture) {
    try {
      const fileService = new FileService();
      await fileService.deleteFile(animal.profilePicture);
    } catch (err) {
      console.error("Failed to delete animal image:", err);
    }
  }
  
  await animal.deleteOne(); // triggers hooks
  res.json({ success: true, message: req.t("ANIMAL_DELETED") });
});


export const getAnimalStats = asyncHandler(async (req: any, res: Response) => {
  
  const user = req.user;
  const actor = await UserModel.findById(user?.id);
  if (!actor || !user) throw createError(401, req.t("UNAUTHORIZED"));

  // Determine target owner
  let ownerId: mongoose.Types.ObjectId;
  if (actor.role === "owner") {
    ownerId = actor._id;
  } else if (actor.role === "assistant") {
    if (!actor.ownerId) throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
    ownerId = actor.ownerId;
  } else if (actor.role === "admin" || actor.role === "superadmin") {
    if (!req.query.ownerId) throw createError(400, req.t("OWNER_ID_REQUIRED_FOR_ADMIN"));
    if (!Types.ObjectId.isValid(req.query.ownerId)) throw createError(400, req.t("INVALID_OWNER_ID"));
    ownerId = new mongoose.Types.ObjectId(String(req.query.ownerId));
  } else {
    throw createError(403, req.t("FORBIDDEN"));
  }

  const pipeline = [
    { $match: { ownerId } },
    {
      $group: {
        _id: { typeId: "$typeId", status: "$animalStatus" },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.typeId",
        statuses: {
          $push: { status: "$_id.status", count: "$count" },
        },
        total: { $sum: "$count" },
      },
    },
    {
      $lookup: {
        from: "animaltypes",
        localField: "_id",
        foreignField: "_id",
        as: "type",
      },
    },
    { $unwind: "$type" },
    {
      $project: {
        _id: 0,
        typeId: "$_id",
        typeKey: "$type.key",
        typeNameEn: "$type.name_en",
        typeNameAr: "$type.name_ar",
        total: 1,
        active: {
          $ifNull: [
            {
              $first: {
                $filter: {
                  input: "$statuses",
                  as: "s",
                  cond: { $eq: ["$$s.status", "active"] },
                },
              },
            },
            { count: 0 },
          ],
        },
        sold: {
          $ifNull: [
            {
              $first: {
                $filter: {
                  input: "$statuses",
                  as: "s",
                  cond: { $eq: ["$$s.status", "sold"] },
                },
              },
            },
            { count: 0 },
          ],
        },
        dead: {
          $ifNull: [
            {
              $first: {
                $filter: {
                  input: "$statuses",
                  as: "s",
                  cond: { $eq: ["$$s.status", "dead"] },
                },
              },
            },
            { count: 0 },
          ],
        },
        transferred: {
          $ifNull: [
            {
              $first: {
                $filter: {
                  input: "$statuses",
                  as: "s",
                  cond: { $eq: ["$$s.status", "transferred"] },
                },
              },
            },
            { count: 0 },
          ],
        },
      },
    },
    {
      $addFields: {
        active: "$active.count",
        sold: "$sold.count",
        dead: "$dead.count",
        transferred: "$transferred.count",
      },
    },
  ];

  const stats = await AnimalModel.aggregate(pipeline);

  res.json({
    success: true,
    data: stats,
  });
});
