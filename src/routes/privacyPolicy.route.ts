import { Router } from 'express';
import {
  getPrivacyPolicy,
  upsertPrivacyPolicy,
  getPrivacyPolicyHistory,
} from '../controller/privacyPolicy.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { upsertTermsSchema, validate } from '../middleware/validate'; // same schema for terms and privacy policy

export const privacyPolicyRouter = Router();

privacyPolicyRouter.get('/', asyncHandler(getPrivacyPolicy));

// Admin endpoints (protected)
privacyPolicyRouter.post(
  '/update',
  authenticate,
  setUserLanguage,
  requireRole(['superadmin', 'admin']),
  validate(upsertTermsSchema),
  asyncHandler(upsertPrivacyPolicy),
);

privacyPolicyRouter.get(
  '/history',
  authenticate,
  setUserLanguage,
  requireRole(['superadmin', 'admin']),
  asyncHandler(getPrivacyPolicyHistory),
);
