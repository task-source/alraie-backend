import express from 'express';
import multer from 'multer';
import { validate,createAnimalTypeSchema, updateAnimalTypeSchema } from '../middleware/validate';
import {
  createAnimalType,
  getAnimalTypes,
  updateAnimalType,
  deleteAnimalType,
  bulkUploadAnimalTypes,
} from '../controller/animalType.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';

export const animalTypeRouter = express.Router();

const upload = multer({ dest: '/tmp/uploads' });

animalTypeRouter.post(
  '/',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  upload.single('image'),          
  validate(createAnimalTypeSchema),
  asyncHandler(createAnimalType),
);

animalTypeRouter.get('/', asyncHandler(getAnimalTypes));

animalTypeRouter.post(
  '/bulkUpload',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  upload.single('file'), 
  asyncHandler(bulkUploadAnimalTypes),
);

animalTypeRouter.put(
  '/:id',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  upload.single('image'),          
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
