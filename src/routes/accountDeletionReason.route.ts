import { Router } from 'express';
import {
  getDeletionReasons,
  createDeletionReason,
  getDeletionReasonsAdmin,
  toggleDeletionReason,
  deleteDeletionReason,
} from '../controller/accountDeletionReason.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { upsertDeletionReasonSchema, validate } from '../middleware/validate';
import { setUserLanguage } from '../middleware/setUserLanguage';


export const accountDeletionReasonRouter = Router();

// Public (mobile / web)
accountDeletionReasonRouter.get(
  '/',
  asyncHandler(getDeletionReasons),
);

// Admin
accountDeletionReasonRouter.get(
  '/admin',
  authenticate,
  requireRole(['admin', 'superadmin']),
  asyncHandler(getDeletionReasonsAdmin),
);

accountDeletionReasonRouter.post(
  '/',
  authenticate,
  setUserLanguage,
  requireRole(['admin', 'superadmin']),
  validate(upsertDeletionReasonSchema),
  asyncHandler(createDeletionReason),
);

accountDeletionReasonRouter.patch(
  '/:id',
  authenticate,
  setUserLanguage,
  requireRole(['admin', 'superadmin']),
  asyncHandler(toggleDeletionReason),
);

accountDeletionReasonRouter.delete(
    '/:id',
    authenticate,
  setUserLanguage,
    requireRole(['admin', 'superadmin']),
    asyncHandler(deleteDeletionReason),
  );
  