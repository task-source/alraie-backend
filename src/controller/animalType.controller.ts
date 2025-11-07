import { Request, Response } from 'express';
import { AnimalType } from '../models/animalType.model';
import { asyncHandler } from '../middleware/asyncHandler';
import createError from 'http-errors';
import { FileService } from '../services/fileService';
import fs from 'fs';
import breedModel from '../models/breed.model';

const fileService = new FileService();

export const createAnimalType = asyncHandler(async (req: any, res: Response) => {
  const { name_en, name_ar, category, key } = req.body;

  const existing = await AnimalType.findOne({ key, category });
  if (existing) throw createError(400, req.t('ANIMAL_TYPE_EXISTS') || 'Animal type already exists');

  let imageUrl: string | undefined;
  if (req.file) {
    const original = req.file.originalname || 'image';
    const safeName = `${key}_${Date.now()}_${original}`.replace(/\s+/g, '_');
    try {
      imageUrl = await fileService.uploadFile(req.file.path, `animal_types/${safeName}`, req.file.mimetype);
    } catch (err:any) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      throw createError(500, req.t('FILE_UPLOAD_FAILED') || 'Image upload failed');
    }
  }

  const animalType = await AnimalType.create({ name_en, name_ar, category, key, imageUrl });

  res.status(201).json({
    success: true,
    message: req.t('ANIMAL_TYPE_CREATED') || 'Animal type created successfully',
    data: animalType,
  });
});

export const getAnimalTypes = asyncHandler(async (req: Request, res: Response) => {
  const { category, lang } = req.query;

  if (lang && ['en', 'ar'].includes(lang?.toString())) {
    (req as any).language = lang?.toString();
    if ((req as any)?.i18n && typeof (req as any)?.i18n?.changeLanguage === 'function') {
      await (req as any).i18n.changeLanguage(lang?.toString());
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

export const updateAnimalType = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  const updates: any = req.body || {};
  
  if ('key' in updates) delete updates.key;

  const animalType = await AnimalType.findById(id);
  if (!animalType) throw createError(404, req.t('ANIMAL_TYPE_NOT_FOUND') || 'Animal type not found');

  if (req.file) {

    const original = req.file.originalname || 'image';
    const safeName = `${animalType.key}_${Date.now()}_${original}`.replace(/\s+/g, '_');
    let newUrl: string | undefined;
    try {
      newUrl = await fileService.uploadFile(req.file.path, `animal_types/${safeName}`, req.file.mimetype);
    } catch (err:any) {
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      throw createError(500, req.t('FILE_UPLOAD_FAILED') || 'Image upload failed');
    }

    if (animalType.imageUrl) {
      try {
        await fileService.deleteFile(animalType.imageUrl);
      } catch (err) {
        console.error('Failed to delete previous animalType image', err);
      }
    }

    updates.imageUrl = newUrl;
  }

  const updated = await AnimalType.findByIdAndUpdate(id, updates, { new: true });
  res.status(200).json({
    success: true,
    message: req.t('ANIMAL_TYPE_UPDATED') || 'Animal type updated successfully',
    data: updated,
  });
});

export const deleteAnimalType = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const animalType = await AnimalType.findById(id);

  if (!animalType) throw createError(404, req.t('ANIMAL_TYPE_NOT_FOUND') || 'Animal type not found');
  if (animalType.imageUrl) {
    try {
      await fileService.deleteFile(animalType.imageUrl);
    } catch (err) {
      console.error('Failed to delete animal type image:', err);
    }
  }

  try {
    await breedModel.deleteMany({ animalTypeKey: animalType.key });
    console.log(`🧹 Deleted breeds of animalType ${animalType.key}`);
  } catch (err) {
    console.error('Failed to cascade delete breeds for animal type:', err);
  }

  await AnimalType.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: req.t('ANIMAL_TYPE_DELETED') || 'Animal type deleted successfully',
  });

});