import { Request, Response } from 'express';
import UserModel from '../models/user';
import createError from 'http-errors';
import { adminGpsListQuerySchema, userListQuerySchema } from '../middleware/validate';
import mongoose from 'mongoose';
import animalModel from '../models/animal.model';
import geofenceModel from '../models/geofence.model';
import GpsDevice from "../models/gps.model";

export const getUsersList = async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

  const adminUser = await UserModel.findById(adminId);
  if (!adminUser) throw createError.NotFound(req.t('USER_NOT_FOUND'));

  if (!['admin', 'superadmin'].includes(adminUser.role))
    throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));

  // ✅ Validate query params
  const parsed = userListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw createError(400, parsed.error.issues.map((e) => e.message).join(', '));
  }

  const { page, limit, role, search } = parsed.data;

  const query: any = {
    role: { $ne: 'superadmin' },
  };
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
    ];
  }

  // Pagination
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    UserModel.find(query)
      .select('-password -refreshToken -otp -otpExpiresAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    UserModel.countDocuments(query),
  ]);

  res.json({
    success: true,
    page,
    totalPages: Math.ceil(total / limit),
    totalUsers: total,
    users,
  });
};

export const getAllAnimalsAdmin = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

    const adminUser = await UserModel.findById(userId);
    if (!adminUser) throw createError.NotFound(req.t('USER_NOT_FOUND'));

    if (!['admin', 'superadmin'].includes(adminUser.role)) {
      throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));
    }

    // Extract query params
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      category,
      typeId,
      gender,
      startDate,
      endDate,
    } = req.query as Record<string, string>;

    const query: any = {};

    // Search (by name, tag, uniqueAnimalId)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { tagId: { $regex: search, $options: 'i' } },
        { uniqueAnimalId: { $regex: search, $options: 'i' } },
      ];
    }

    // Filters
    if (status) query.animalStatus = status;
    if (category) query.category = category;
    if (gender) query.gender = gender;
    if (typeId && mongoose.isValidObjectId(typeId)) query.typeId = new mongoose.Types.ObjectId(typeId);

    // Date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.max(Number(limit), 1);
    const skip = (pageNum - 1) * limitNum;

    const pipeline: any[] = [
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'assistant',
        },
      },
      { $unwind: { path: '$assistant', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          uniqueAnimalId: 1,
          name: 1,
          typeNameEn: 1,
          typeNameAr: 1,
          category: 1,
          animalStatus: 1,
          gender: 1,
          dob: 1,
          tagId: 1,
          breed: 1,
          country: 1,
          profilePicture: 1,
          hasVaccinated: 1,
          createdAt: 1,
          updatedAt: 1,
          'owner._id': 1,
          'owner.name': 1,
          'owner.email': 1,
          'owner.phone': 1,
          'assistant._id': 1,
          'assistant.name': 1,
          'assistant.email': 1,
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          totalCount: [{ $count: 'count' }],
          data: [{ $skip: skip }, { $limit: limitNum }],
        },
      },
    ];

    const [result] = await animalModel.aggregate(pipeline);
    const totalCount = result?.totalCount?.[0]?.count || 0;
    const animals = result?.data || [];

    res.status(200).json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      data: animals,
    });
  } catch (error: any) {
    console.error('Admin get animals error:', error);

    if (createError.isHttpError(error)) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
};

export const getAllGeofencesAdmin = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

    const adminUser = await UserModel.findById(userId);
    if (!adminUser) throw createError.NotFound(req.t('USER_NOT_FOUND'));
    if (!['admin', 'superadmin'].includes(adminUser.role))
      throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));

    // Extract query params
    const {
      page = 1,
      limit = 10,
      search = '',
      ownerId,
      createdBy,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query as Record<string, string>;

    const query: any = {};

    if (search) {
      query.$or = [{ name: { $regex: search, $options: 'i' } }];
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      query.ownerId = new mongoose.Types.ObjectId(ownerId);
    }

    if (createdBy && mongoose.isValidObjectId(createdBy)) {
      query.createdBy = new mongoose.Types.ObjectId(createdBy);
    }


    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.max(Number(limit), 1);
    const skip = (pageNum - 1) * limitNum;

    const sortDirection = sortOrder === 'asc' ? 1 : -1;


    const pipeline: any[] = [
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator',
        },
      },
      { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'animals',
          localField: 'animals',
          foreignField: '_id',
          as: 'animalList',
        },
      },
      {
        $addFields: {
          animalCount: { $size: '$animalList' },
          sampleAnimals: { $slice: ['$animalList', 3] }, 
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          'center.lat': 1,
          'center.lng': 1,
          radiusKm: 1,
          createdAt: 1,
          updatedAt: 1,
          animalCount: 1,
          sampleAnimals: {
            _id: 1,
            name: 1,
            uniqueAnimalId: 1,
            profilePicture: 1,
            gender: 1,
          },
          'owner._id': 1,
          'owner.name': 1,
          'owner.email': 1,
          'owner.phone': 1,
          'creator._id': 1,
          'creator.name': 1,
          'creator.email': 1,
        },
      },
      { $sort: { [sortBy]: sortDirection } },
      {
        $facet: {
          totalCount: [{ $count: 'count' }],
          data: [{ $skip: skip }, { $limit: limitNum }],
        },
      },
    ];

    const [result] = await geofenceModel.aggregate(pipeline);
    const totalCount = result?.totalCount?.[0]?.count || 0;
    const geofences = result?.data || [];

    res.status(200).json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      data: geofences,
    });
  } catch (error: any) {
    console.error('Admin get geofences error:', error);

    if (createError.isHttpError(error)) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
};

export const getAllGpsAdmin = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw createError.Unauthorized(req.t("UNAUTHORIZED"));

    const adminUser = await UserModel.findById(userId);
    if (!adminUser) throw createError.NotFound(req.t("USER_NOT_FOUND"));
    if (!["admin", "superadmin"].includes(adminUser.role))
      throw createError.Forbidden(req.t("FORBIDDEN_ACCESS"));

    // Validate query parameters
    const parsed = adminGpsListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw createError(
        400,
        parsed.error.issues.map((e) => e.message).join(", ")
      );
    }

    const {
      page,
      limit,
      search,
      ownerId,
      linked,
      sortBy,
      sortOrder,
      startDate,
      endDate,
    } = parsed.data;

    const query: any = {};

    // Search GPS by serialNumber
    if (search) {
      query.serialNumber = { $regex: search, $options: "i" };
    }

    // Filter by owner
    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      query.ownerId = new mongoose.Types.ObjectId(ownerId);
    }

    // Filter by link status
    if (linked === "true") query.isLinked = true;
    if (linked === "false") query.isLinked = false;

    // Filter by date
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(Number(page), 1);
    const limitNum = Math.max(Number(limit), 1);
    const skip = (pageNum - 1) * limitNum;

    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const pipeline: any[] = [
      { $match: query },

      // Join owner details
      {
        $lookup: {
          from: "users",
          localField: "ownerId",
          foreignField: "_id",
          as: "owner",
        },
      },
      { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },

      // Join animal details (if linked)
      {
        $lookup: {
          from: "animals",
          localField: "animalId",
          foreignField: "_id",
          as: "animal",
        },
      },
      { $unwind: { path: "$animal", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          _id: 1,
          serialNumber: 1,
          ownerId: 1,
          createdBy: 1,
          isLinked: 1,
          linkedAt: 1,
          createdAt: 1,

          // Owner data
          "owner._id": 1,
          "owner.name": 1,
          "owner.email": 1,
          "owner.phone": 1,

          // Linked animal data (if exists)
          "animal._id": 1,
          "animal.uniqueAnimalId": 1,
          "animal.name": 1,
          "animal.profilePicture": 1,
          "animal.typeNameEn": 1,
          "animal.breedNameEn": 1,
        },
      },

      { $sort: { [sortBy]: sortDirection } },

      {
        $facet: {
          totalCount: [{ $count: "count" }],
          data: [{ $skip: skip }, { $limit: limitNum }],
        },
      },
    ];

    const [result] = await GpsDevice.aggregate(pipeline);
    const totalCount = result?.totalCount?.[0]?.count || 0;
    const gpsList = result?.data || [];

    res.status(200).json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      data: gpsList,
    });
  } catch (error: any) {
    console.error("Admin get GPS list error:", error);

    if (createError.isHttpError(error)) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
};
