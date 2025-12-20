import { Router } from 'express';
import {
  getAboutUs,
  upsertAboutUs,
  getAboutUsHistory,
} from '../controller/aboutUs.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { upsertAboutUsSchema, validate } from '../middleware/validate';


export const aboutUsRouter = Router();

// Public
aboutUsRouter.get('/', asyncHandler(getAboutUs));

// Admin
aboutUsRouter.post(
  '/update',
  authenticate,
  setUserLanguage,
  requireRole(['superadmin', 'admin']),
  validate(upsertAboutUsSchema),
  asyncHandler(upsertAboutUs),
);

aboutUsRouter.get(
  '/history',
  authenticate,
  setUserLanguage,
  requireRole(['superadmin', 'admin']),
  asyncHandler(getAboutUsHistory),
);
