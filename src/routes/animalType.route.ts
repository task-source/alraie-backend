import express from 'express';
import { validate,createAnimalTypeSchema, updateAnimalTypeSchema } from '../middleware/validate';
import {
  createAnimalType,
  getAnimalTypes,
  updateAnimalType,
  deleteAnimalType,
} from '../controller/animalType.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';

export const animalTypeRouter = express.Router();

animalTypeRouter.post(
  '/',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  validate(createAnimalTypeSchema),
  asyncHandler(createAnimalType),
);

animalTypeRouter.get('/', asyncHandler(getAnimalTypes));

animalTypeRouter.put(
  '/:id',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  validate(updateAnimalTypeSchema),
  asyncHandler(updateAnimalType),
);

animalTypeRouter.delete(
  '/:id',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(deleteAnimalType),
);
