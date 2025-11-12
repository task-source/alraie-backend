import express from 'express';
import multer from 'multer';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { validate, createSlideSchema, updateSlideSchema } from '../middleware/validate';
import {
  createSlide,
  updateSlide,
  deleteSlide,
  getSlides,
  getAllSlidesAdmin,
} from '../controller/slide.controller';

export const slideRouter = express.Router();
const upload = multer({ dest: '/tmp/uploads' });

slideRouter.get('/', asyncHandler(getSlides));


slideRouter.use(authenticate);
slideRouter.use(requireRole(['admin', 'superadmin']));
slideRouter.use(setUserLanguage);

slideRouter.get('/allSlides', asyncHandler(getAllSlidesAdmin));

slideRouter.post(
  '/',
  upload.single('image'),
  validate(createSlideSchema),
  asyncHandler(createSlide),
);

slideRouter.put(
  '/:id',
  upload.single('image'),
  validate(updateSlideSchema),
  asyncHandler(updateSlide),
);

slideRouter.delete('/:id', asyncHandler(deleteSlide));
