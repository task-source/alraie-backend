import { Router } from 'express';
import { getTerms, upsertTerms, getTermsHistory } from '../controller/terms.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { upsertTermsSchema, validate } from '../middleware/validate';

export const termsRouter = Router();

termsRouter.get('/', asyncHandler(getTerms));

// Admin endpoints (protected)
termsRouter.post(
  '/update',
  authenticate,
  setUserLanguage,
  requireRole(['superadmin', 'admin']),
  validate(upsertTermsSchema),
  asyncHandler(upsertTerms),
);

termsRouter.get(
  '/history',
  authenticate,
  setUserLanguage,
  requireRole(['superadmin', 'admin']),
  asyncHandler(getTermsHistory),
);
