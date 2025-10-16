import { Request, Response } from 'express';
import { AnimalType } from '../models/animalType.model';
import { asyncHandler } from '../middleware/asyncHandler';
import createError from 'http-errors';

export const createAnimalType = asyncHandler(async (req: Request, res: Response) => {
  const { name_en, name_ar, category, key } = req.body;

  const existing = await AnimalType.findOne({ key, category });
  if (existing) throw createError(400, req.t('ANIMAL_TYPE_EXISTS') || 'Animal type already exists');

  const animalType = await AnimalType.create({ name_en, name_ar, category, key });
  res.status(201).json({
    success: true,
    message: req.t('ANIMAL_TYPE_CREATED') || 'Animal type created successfully',
    data: animalType,
  });
});

export const getAnimalTypes = asyncHandler(async (req: Request, res: Response) => {
  const { category, lang } = req.query;

  if (lang && ['en', 'ar'].includes(lang?.toString())) {
    req.language = lang?.toString();
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(lang?.toString());
    }
  }
  
  const filter: Record<string, any> = {};
  if (category && ['farm', 'pet'].includes(category?.toString())) filter.category = category;

  const animalTypes = await AnimalType.find(filter).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: animalTypes,
  });
});

export const updateAnimalType = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;
  
  if ("key" in updates) delete updates.key;

  const animalType = await AnimalType.findByIdAndUpdate(id, updates, { new: true });
  if (!animalType)
    throw createError(404, req.t('ANIMAL_TYPE_NOT_FOUND') || 'Animal type not found');

  res.status(200).json({
    success: true,
    message: req.t('ANIMAL_TYPE_UPDATED') || 'Animal type updated successfully',
    data: animalType,
  });
});

export const deleteAnimalType = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const animalType = await AnimalType.findByIdAndDelete(id);

  if (!animalType)
    throw createError(404, req.t('ANIMAL_TYPE_NOT_FOUND') || 'Animal type not found');

  res.status(200).json({
    success: true,
    message: req.t('ANIMAL_TYPE_DELETED') || 'Animal type deleted successfully',
  });

});