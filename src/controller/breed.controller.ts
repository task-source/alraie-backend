import { Request, Response } from 'express';
import createError from 'http-errors';
import BreedModel from '../models/breed.model';
import {AnimalType} from '../models/animalType.model';
import { asyncHandler } from '../middleware/asyncHandler';
import mongoose from 'mongoose';
import { promisify } from 'util';
import { pipeline } from 'stream';
import { parse } from 'csv-parse';
import fs from 'fs';

export const createBreed = asyncHandler(async (req: any, res: Response) => {
  const body = req.body;
  // language handled by setUserLanguage middleware if present
  const key = String(body.key).toLowerCase().trim();

  // Check duplicate key
  const exists = await BreedModel.findOne({ key });
  if (exists) throw createError(400, req.t('BREED_KEY_EXISTS') || 'Breed key already exists');

  // validate animalType exists
  const animalType = await AnimalType.findOne({ key: body.animalTypeKey });
  if (!animalType) throw createError(400, req.t('INVALID_ANIMAL_TYPE') || 'Animal type not found');

  // ensure category matches if provided
  if (body.category && animalType.category !== body.category) {
    throw createError(400, req.t('ANIMAL_TYPE_CATEGORY_MISMATCH') || 'Category mismatch with animal type');
  }

  const breed = await BreedModel.create({
    key,
    name_en: body.name_en,
    name_ar: body.name_ar,
    animalTypeKey: animalType.key,
    animalTypeId: animalType._id,
    category: body.category,
    metadata: body.metadata ?? {},
  });

  res.status(201).json({
    success: true,
    message: req.t('BREED_CREATED') || 'Breed created',
    data: breed,
  });
});



export const listBreeds = asyncHandler(async (req: any, res: Response) => {
  // allow callers to pass lang even without token
  const { lang } = req.query;
  if (lang && ['en', 'ar'].includes(String(lang))) {
    req.language = String(lang);
    if (req?.i18n && typeof req.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(String(lang));
    }
  }

  const {
    page = '1',
    limit = '20',
    search,
    animalTypeKey,
    category,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, Number(page || 1));
  const limitNum = Math.max(1, Math.min(200, Number(limit || 20)));
  const skip = (pageNum - 1) * limitNum;
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const filter: any = {};

  if (animalTypeKey) filter.animalTypeKey = String(animalTypeKey).toLowerCase().trim();
  if (category && ['farm', 'pet'].includes(category)) filter.category = category;

  if (search) {
    const s = String(search);
    // text search fallback — also use regex for key
    filter.$or = [
      { name_en: { $regex: s, $options: 'i' } },
      { name_ar: { $regex: s, $options: 'i' } },
      { key: { $regex: s, $options: 'i' } },
      { animalTypeKey: { $regex: s, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    BreedModel.find(filter)
      .sort({ [sortBy]: sortDir, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    BreedModel.countDocuments(filter),
  ]);

  res.json({
    success: true,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
    data: items,
  });
});


export const updateBreed = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw createError(400, req.t('INVALID_ID') || 'Invalid id');

  const body = req.body;
  const breed = await BreedModel.findById(id);
  if (!breed) throw createError(404, req.t('BREED_NOT_FOUND') || 'Breed not found');

  // prevent key update
  if (body.key && body.key !== breed.key) {
    throw createError(400, req.t('CANNOT_UPDATE_KEY') || 'Cannot update breed key');
  }

  // If animalTypeKey updated — verify it exists and category consistency
  if (body.animalTypeKey) {
    const animalType = await AnimalType.findOne({ key: body.animalTypeKey });
    if (!animalType) throw createError(400, req.t('INVALID_ANIMAL_TYPE') || 'Animal type not found');

    if (body.category && animalType.category !== body.category) {
      throw createError(400, req.t('ANIMAL_TYPE_CATEGORY_MISMATCH') || 'Category mismatch with animal type');
    }

    breed.animalTypeKey = animalType.key;
    breed.animalTypeId = animalType._id as mongoose.Types.ObjectId;
  }

  if (body.name_en) breed.name_en = body.name_en;
  if (body.name_ar) breed.name_ar = body.name_ar;
  if (body.category) {
    if (!['farm', 'pet'].includes(body.category)) throw createError(400, req.t('INVALID_CATEGORY'));
    breed.category = body.category;
  }
  if (body.metadata) breed.metadata = body.metadata;

  await breed.save();

  res.json({
    success: true,
    message: req.t('BREED_UPDATED') || 'Breed updated',
    data: breed,
  });
});


export const deleteBreed = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw createError(400, req.t('INVALID_ID') || 'Invalid id');

  const breed = await BreedModel.findById(id);
  if (!breed) throw createError(404, req.t('BREED_NOT_FOUND') || 'Breed not found');

  await BreedModel.findByIdAndDelete(id);

  res.json({
    success: true,
    message: req.t('BREED_DELETED') || 'Breed deleted',
  });
});


export const getBreedsGroupedByType = asyncHandler(async (req: any, res: Response) => {
  const { lang } = req.query;

  if (lang && ['en', 'ar'].includes(lang?.toString())) {
    req.language = lang?.toString();
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(lang?.toString());
    }
  }

  // Fetch all animal types and their breeds
  const [animalTypes, breeds] = await Promise.all([
    AnimalType.find().lean(),
    BreedModel.find().lean(),
  ]);

  // Group breeds by animalTypeKey
  const grouped: any[] = animalTypes.map((type) => {
    const relatedBreeds = breeds
      .filter((b) => b.animalTypeKey === type.key)
      .map((b) => ({
        key: b.key,
        name_en: b.name_en,
        name_ar: b.name_ar,
      }));

    return {
      animalTypeKey: type.key,
      animalTypeNameEn: type.name_en,
      animalTypeNameAr: type.name_ar,
      category: type.category,
      breeds: relatedBreeds,
    };
  });

  res.json({
    success: true,
    data: grouped,
  });
});

const pump = promisify(pipeline);

export const bulkUploadBreeds = asyncHandler(async (req: any, res: Response) => {
  if (!req.file) throw createError(400, req.t('CSV_REQUIRED') || 'CSV file is required');

  const filePath = req.file.path;
  const results: any[] = [];

  try {
    // Parse CSV safely
    await pump(
      fs.createReadStream(filePath),
      parse({
        columns: (header: string[]) => header.map((h) => h.replace(/^\uFEFF/, '').trim()), // remove BOM if any
        skip_empty_lines: true,
        trim: true,
      })
      .on('data', (row) => results.push(row))
    );

    if (results.length === 0)
      throw createError(400, req.t('EMPTY_CSV') || 'CSV file is empty');

    let created = 0;
    let skipped = 0;
    const errors: any[] = [];

    for (const row of results) {
      const { key, name_en, name_ar, category, animalTypeKey } = row;

      // basic validation
      if (!key || !name_en || !name_ar || !category || !animalTypeKey) {
        skipped++;
        errors.push({ key, reason: 'Missing required fields' });
        continue;
      }

      if (!['farm', 'pet'].includes(category)) {
        skipped++;
        errors.push({ key, reason: 'Invalid category' });
        continue;
      }

      // Check animal type existence
      const animalType = await AnimalType.findOne({ key: animalTypeKey });
      if (!animalType) {
        skipped++;
        errors.push({ key, reason: 'Animal type not found' });
        continue;
      }

      if (animalType.category !== category) {
        skipped++;
        errors.push({ key, reason: 'Category mismatch with animal type' });
        continue;
      }

      // Prevent duplicate breed keys
      const exists = await BreedModel.findOne({ key: key.toLowerCase().trim() });
      if (exists) {
        skipped++;
        errors.push({ key, reason: 'Duplicate key' });
        continue;
      }

      try {
        await BreedModel.create({
          key: key.toLowerCase().trim(),
          name_en: name_en.trim(),
          name_ar: name_ar.trim(),
          animalTypeKey: animalType.key,
          animalTypeId: animalType._id,
          category,
        });
        created++;
      } catch (err: any) {
        skipped++;
        errors.push({ key, reason: err.message });
      }
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.status(201).json({
      success: true,
      message: req.t('BREED_BULK_CREATED') || 'Bulk breed upload completed',
      summary: { created, skipped, total: results.length },
      errors,
    });
  } catch (err: any) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('🐪 Bulk breed upload failed:', err);
    throw createError(500, req.t('BULK_UPLOAD_FAILED') || 'Bulk upload failed');
  }
});