import { Request, Response } from 'express';
import createError from 'http-errors';
import fs from 'fs';
import { Slide } from '../models/slide.model';
import { asyncHandler } from '../middleware/asyncHandler';
import { FileService } from '../services/fileService';

const fileService = new FileService();

export const createSlide = asyncHandler(async (req: any, res: Response) => {
  const { title, description } = req.body;

  if (!req.file) throw createError(400, req.t('IMAGE_REQUIRED') || 'Image is required');

  const safeName = `slides/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
  let imageUrl = '';
  try {
    imageUrl = await fileService.uploadFile(req.file.path, safeName, req.file.mimetype);
  } catch (err: any) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw createError(500, req.t('FILE_UPLOAD_FAILED') || 'Image upload failed');
  }

  const slide = await Slide.create({ title, description, imageUrl, isActive: true });

  res.status(201).json({
    success: true,
    message: req.t('SLIDE_CREATED') || 'Slide created successfully',
    data: slide,
  });
});


export const updateSlide = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const slide = await Slide.findById(id);
  if (!slide) throw createError(404, req.t('SLIDE_NOT_FOUND') || 'Slide not found');

  if (req.file) {
    const safeName = `slides/${Date.now()}_${req.file.originalname.replace(/\s+/g, '_')}`;
    let newUrl = '';
    try {
      newUrl = await fileService.uploadFile(req.file.path, safeName, req.file.mimetype);
    } catch (err: any) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      throw createError(500, req.t('FILE_UPLOAD_FAILED') || 'Image upload failed');
    }

    if (slide.imageUrl) {
      try {
        await fileService.deleteFile(slide.imageUrl);
      } catch (err) {
        console.error('Failed to delete old slide image:', err);
      }
    }

    updates.imageUrl = newUrl;
  }


  const updated = await Slide.findByIdAndUpdate(id, updates, { new: true });
  res.status(200).json({
    success: true,
    message: req.t('SLIDE_UPDATED') || 'Slide updated successfully',
    data: updated,
  });
});


export const deleteSlide = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const slide = await Slide.findById(id);
  if (!slide) throw createError(404, req.t('SLIDE_NOT_FOUND') || 'Slide not found');

  if (slide.imageUrl) {
    try {
      await fileService.deleteFile(slide.imageUrl);
    } catch (err) {
      console.error('Failed to delete slide image:', err);
    }
  }

  await slide.deleteOne();

  res.json({
    success: true,
    message: req.t('SLIDE_DELETED') || 'Slide deleted successfully',
  });
});

export const getSlides = asyncHandler(async (req: Request, res: Response) => {
  const slides = await Slide.find({ isActive: true }).sort({ createdAt: -1 }).lean();

  res.json({
    success: true,
    data: slides,
  });
});


export const getAllSlidesAdmin = asyncHandler(async (req: Request, res: Response) => {
  const slides = await Slide.find().sort({ createdAt: -1 }).lean();

  res.json({
    success: true,
    data: slides,
  });
});
