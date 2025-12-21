import { Response } from "express";
import createError from "http-errors";
import mongoose, { Types } from "mongoose";
import { asyncHandler } from "../middleware/asyncHandler";
import AnimalModel from "../models/animal.model";
import AnimalReport from "../models/animalReport.model";
import UserModel from "../models/user";
import { AnimalType } from "../models/animalType.model";
import breedModel from "../models/breed.model";

/**
 * Permission check (same rules as Animal)
 */
const hasAccess = (actor: any, animal: any) => {
    const ownerId = animal.ownerId.toString();

    if (actor.role === "owner") return actor.id === ownerId;
    if (actor.role === "assistant")
        return actor.ownerId && actor.ownerId.toString() === ownerId;
    return actor.role === "admin" || actor.role === "superadmin";
};

/**
 * CREATE report (ONLY if not exists)
 */
export const createAnimalReport = asyncHandler(
    async (req: any, res: Response) => {
        const { animalId, ...data } = req.body;

        if (!Types.ObjectId.isValid(animalId))
            throw createError(400, req.t("INVALID_ANIMAL_ID"));

        const animal = await AnimalModel.findById(animalId);
        if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));

        const actor = await UserModel.findById(req.user.id);
        if (!actor || !hasAccess(actor, animal))
            throw createError(403, req.t("FORBIDDEN"));

        const existing = await AnimalReport.findOne({ animalId });
        if (existing)
            throw createError(400, req.t("REPORT_ALREADY_EXISTS"));

        const report = await AnimalReport.create({
            animalId,
            ownerId: animal.ownerId,
            ...data,
        });
        animal.reportId = report._id as Types.ObjectId;
        await animal.save();
        res.status(201).json({
            success: true,
            message: req.t("ANIMAL_REPORT_CREATED"),
            data: report,
        });
    }
);

/**
 * UPDATE report (ONLY if exists)
 */
export const updateAnimalReport = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
  
    const report = await AnimalReport.findById(reportId);
    if (!report) throw createError(404, req.t("REPORT_NOT_FOUND"));
  
    const animal = await AnimalModel.findById(report.animalId);
    if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));
  
    const actor = await UserModel.findById(req.user.id);
    if (!actor || !hasAccess(actor, animal))
      throw createError(403, req.t("FORBIDDEN"));
  
    Object.assign(report, req.body);
    await report.save();
  
    res.json({
      success: true,
      message: req.t("ANIMAL_REPORT_UPDATED"),
      data: report,
    });
  });

export const listAnimalReports = asyncHandler(
    async (req: any, res: Response) => {
        const q = req.query;
        const user = req.user;

        const actor = await UserModel.findById(user?.id);
        if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

        const page = Math.max(1, Number(q.page || 1));
        const limit = Math.min(100, Number(q.limit || 20));
        const skip = (page - 1) * limit;

        const filter: any = {};

        // 🔐 Role-based access
        if (actor.role === "admin" || actor.role === "superadmin") {
            if (q.ownerId) {
                if (!Types.ObjectId.isValid(q.ownerId))
                    throw createError(400, req.t("INVALID_OWNER_ID"));
                filter.ownerId = q.ownerId;
            }
        } else if (actor.role === "owner") {
            filter.ownerId = actor._id;
        } else if (actor.role === "assistant") {
            if (!actor.ownerId)
                throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
            filter.ownerId = actor.ownerId;
        } else {
            throw createError(403, req.t("FORBIDDEN"));
        }

        // 🔎 Filters
        if (q.animalId) {
            if (!Types.ObjectId.isValid(q.animalId))
                throw createError(400, req.t("INVALID_ANIMAL_ID"));
            filter.animalId = q.animalId;
        }

        if (q.vaccinated !== undefined) {
            if (q.vaccinated === "true" ||q.vaccinated === true) filter.vaccinated = true;
            else if (q.vaccinated === "false" || q.vaccinated === false) filter.vaccinated = false;
            else throw createError(400, "INVALID_VACCINATED_VALUE");
        }

        // 🔍 Search
        if (q.search) {
            filter.$or = [
                { disease: { $regex: q.search, $options: "i" } },
                { allergy: { $regex: q.search, $options: "i" } },
                { notes: { $regex: q.search, $options: "i" } },
            ];
        }

        // 🔃 Sorting
        let sort: any = {};
        switch (q.sort) {
            case "date_oldest":
                sort.createdAt = 1;
                break;
            case "weight_high_to_low":
                sort.weight = -1;
                break;
            case "weight_low_to_high":
                sort.weight = 1;
                break;
            case "heart_rate_high_to_low":
                sort.heartRate = -1;
                break;
            case "heart_rate_low_to_high":
                sort.heartRate = 1;
                break;
            default:
                sort.createdAt = -1;
                break;
        }

        const [items, total] = await Promise.all([
            AnimalReport.find(filter).populate({
                path: "animalId",
                select: "uniqueAnimalId name profilePicture",
              })
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            AnimalReport.countDocuments(filter),
        ]);

        res.json({
            success: true,
            items,
            total,
            page,
            limit,
        });
    }
);

/**
 * GET report
 */
export const getAnimalReport = asyncHandler(async (req: any, res: Response) => {
    const { reportId } = req.params;
  
    if (!Types.ObjectId.isValid(reportId))
      throw createError(400, req.t("INVALID_REPORT_ID"));
  
    // 1️⃣ Get report
    const report = await AnimalReport.findById(reportId).lean();
    if (!report)
      throw createError(404, req.t("REPORT_NOT_FOUND"));
  
    // 2️⃣ Get animal for permission check
    const animal = await AnimalModel.findById(report.animalId).lean();
    if (!animal)
      throw createError(404, req.t("ANIMAL_NOT_FOUND"));
  
    // 3️⃣ Permission check
    const actor = await UserModel.findById(req.user.id);
    if (!actor || !hasAccess(actor, animal))
      throw createError(403, req.t("FORBIDDEN"));
  
    // 4️⃣ Populate animal data (controlled fields)
    const populatedReport = await AnimalReport.findById(reportId)
      .populate({
        path: "animalId",
        select: `
          uniqueAnimalId
          name
          typeKey
          typeNameEn
          typeNameAr
          breedKey
          breedNameEn
          breedNameAr
          gender
          dob
          animalStatus
          profilePicture
          images
        `,
      })
      .lean();
  
    res.json({
      success: true,
      data: populatedReport,
    });
});
  
/**
 * DELETE report
 */
export const deleteAnimalReport = asyncHandler(async (req, res) => {
    const { reportId } = req.params;
  
    const report = await AnimalReport.findById(reportId);
    if (!report) throw createError(404, req.t("REPORT_NOT_FOUND"));
  
    const animal = await AnimalModel.findById(report.animalId);
    if (!animal) throw createError(404, req.t("ANIMAL_NOT_FOUND"));
  
    const actor = await UserModel.findById(req.user.id);
    if (!actor || !hasAccess(actor, animal))
      throw createError(403, req.t("FORBIDDEN"));
  
    if (animal) {
        animal.reportId = null;
        await animal.save();
    }
    await report.deleteOne();
  
    res.json({
      success: true,
      message: req.t("REPORT_DELETED"),
    });
  });
  

/**
 * LIST animals WITH and WITHOUT reports
 */
export const listAnimalsWithReport = asyncHandler(async (req: any, res: Response) => {
    const q = req.query;
    const user = req.user;

    const actor = await UserModel.findById(user?.id);
    if (!user || !actor) throw createError(401, req.t("UNAUTHORIZED"));

    const page = Math.max(1, Number(q.page || 1));
    const limit = Math.min(100, Number(q.limit || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};

    // 🔐 Role based owner filtering
    if (actor.role === "admin" || actor.role === "superadmin") {
        if (q.ownerId) {
            if (!Types.ObjectId.isValid(q.ownerId))
                throw createError(400, req.t("INVALID_OWNER_ID"));
            filter.ownerId = q.ownerId;
        }
    } else if (actor.role === "owner") {
        filter.ownerId = actor.id;
    } else if (actor.role === "assistant") {
        if (!actor.ownerId)
            throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
        filter.ownerId = actor.ownerId;
    } else {
        throw createError(403, req.t("FORBIDDEN"));
    }

    // 🔹 Get animals that HAVE report
    const reports = await AnimalReport.find({ ownerId: filter.ownerId })
        .select("animalId")
        .lean();

    const reportedAnimalIds = reports.map(r => r.animalId);
    filter._id = { $in: reportedAnimalIds };

    // 🔍 Filters (SAME AS listAnimals)
    if (q.status) filter.animalStatus = q.status;

    if (q.typeKey) {
        const type = await AnimalType.findOne({ key: q.typeKey });
        if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
        filter.typeId = type._id;
    }

    if (q.search) {
        filter.$or = [
            { name: { $regex: q.search, $options: "i" } },
            { uniqueAnimalId: { $regex: q.search, $options: "i" } },
            { tagId: { $regex: q.search, $options: "i" } },
        ];
    }

    if (q.hasVaccinated !== undefined) {
        if (q.hasVaccinated === "true" || q.hasVaccinated === true) filter.hasVaccinated = true;
        else if (q.hasVaccinated === "false" || q.hasVaccinated === false) filter.hasVaccinated = false;
        else throw createError(400, req.t("INVALID_HAS_VACCINATED_VALUE"));
    }

    if (q.gender) {
        const genders = String(q.gender)
            .split(",")
            .map(g => g.trim().toLowerCase())
            .filter(g => ["male", "female", "unknown"].includes(g));

        if (!genders.length)
            throw createError(400, req.t("INVALID_GENDER_VALUE"));

        filter.gender = { $in: genders };
    }

    if (q.breedKey) {
        const breedKeys = String(q.breedKey).split(",").map(b => b.trim());
        const validBreeds = await breedModel.find({ key: { $in: breedKeys } }).select("key");
        if (!validBreeds.length)
            throw createError(400, req.t("INVALID_BREED_KEY"));
        filter.breedKey = { $in: validBreeds.map(b => b.key) };
    }

    if (q.ageFrom || q.ageTo) {
        const now = new Date();
        const ageFilter: any = {};

        if (q.ageFrom) {
            const maxDate = new Date(now.getFullYear() - Number(q.ageFrom), now.getMonth(), now.getDate());
            ageFilter.$lte = maxDate;
        }

        if (q.ageTo) {
            const minDate = new Date(now.getFullYear() - Number(q.ageTo), now.getMonth(), now.getDate());
            ageFilter.$gte = minDate;
        }

        filter.dob = ageFilter;
    }

    // 🔃 Sorting
    let sort: any = {};
    switch (q.sort) {
        case "name_asc": sort.name = 1; break;
        case "name_desc": sort.name = -1; break;
        case "age_young_to_old": sort.dob = -1; break;
        case "age_old_to_young": sort.dob = 1; break;
        case "date_oldest": sort.createdAt = 1; break;
        default: sort.createdAt = -1; break;
    }

    const [items, total] = await Promise.all([
        AnimalModel.find(filter)
            .populate("gpsDeviceId", "serialNumber lastKnownLatitude lastKnownLongitude")
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        AnimalModel.countDocuments(filter),
    ]);

    res.json({ success: true, items, total, page, limit });
});


export const listAnimalsWithoutReport = asyncHandler(async (req: any, res: Response) => {
    const q = req.query;
    const user = req.user;

    const actor = await UserModel.findById(user?.id);
    if (!user || !actor) throw createError(401, req.t("UNAUTHORIZED"));

    const page = Math.max(1, Number(q.page || 1));
    const limit = Math.min(100, Number(q.limit || 20));
    const skip = (page - 1) * limit;

    const filter: any = {};

    if (actor.role === "admin" || actor.role === "superadmin") {
        if (q.ownerId) {
            if (!Types.ObjectId.isValid(q.ownerId))
                throw createError(400, req.t("INVALID_OWNER_ID"));
            filter.ownerId = q.ownerId;
        }
    } else if (actor.role === "owner") {
        filter.ownerId = actor.id;
    } else if (actor.role === "assistant") {
        if (!actor.ownerId)
            throw createError(400, req.t("OWNER_NOT_ASSIGNED"));
        filter.ownerId = actor.ownerId;
    } else {
        throw createError(403, req.t("FORBIDDEN"));
    }

    const reports = await AnimalReport.find({ ownerId: filter.ownerId })
        .select("animalId")
        .lean();

    const reportedAnimalIds = reports.map(r => r.animalId);
    filter._id = { $nin: reportedAnimalIds };

    // 🔁 SAME FILTER / SORT LOGIC AS ABOVE (unchanged)
    // ⬇️ (intentionally identical for consistency)

    if (q.status) filter.animalStatus = q.status;

    if (q.typeKey) {
        const type = await AnimalType.findOne({ key: q.typeKey });
        if (!type) throw createError(400, req.t("INVALID_ANIMAL_TYPE"));
        filter.typeId = type._id;
    }

    if (q.search) {
        filter.$or = [
            { name: { $regex: q.search, $options: "i" } },
            { uniqueAnimalId: { $regex: q.search, $options: "i" } },
            { tagId: { $regex: q.search, $options: "i" } },
        ];
    }

    let sort: any = { createdAt: -1 };

    const [items, total] = await Promise.all([
        AnimalModel.find(filter)
            .populate("gpsDeviceId", "serialNumber lastKnownLatitude lastKnownLongitude")
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean(),
        AnimalModel.countDocuments(filter),
    ]);

    res.json({ success: true, items, total, page, limit });
});

