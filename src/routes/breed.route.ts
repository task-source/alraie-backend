import express from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';
import {
  createBreedSchema,
  updateBreedSchema,
} from '../middleware/validate';
import {
  createBreed,
  listBreeds,
  updateBreed,
  deleteBreed,
  getBreedsGroupedByType,
} from '../controller/breed.controller';

export const breedRouter = express.Router();


breedRouter.get('/', asyncHandler(listBreeds));


breedRouter.post(
  '/',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  validate(createBreedSchema),
  asyncHandler(createBreed),
);

breedRouter.get('/grouped', asyncHandler(getBreedsGroupedByType));

breedRouter.put(
  '/:id',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  validate(updateBreedSchema),
  asyncHandler(updateBreed),
);

breedRouter.delete(
  '/:id',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(deleteBreed),
);
