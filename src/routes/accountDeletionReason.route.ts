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
import { subscriptionContext } from '../middleware/subscriptionContext';


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
  subscriptionContext,
  requireRole(['admin', 'superadmin']),
  asyncHandler(getDeletionReasonsAdmin),
);

accountDeletionReasonRouter.post(
  '/',
  authenticate,
  subscriptionContext,
  setUserLanguage,
  requireRole(['admin', 'superadmin']),
  validate(upsertDeletionReasonSchema),
  asyncHandler(createDeletionReason),
);

accountDeletionReasonRouter.patch(
  '/:id',
  authenticate,
  subscriptionContext,
  setUserLanguage,
  requireRole(['admin', 'superadmin']),
  asyncHandler(toggleDeletionReason),
);

accountDeletionReasonRouter.delete(
    '/:id',
    authenticate,
    subscriptionContext,
  setUserLanguage,
    requireRole(['admin', 'superadmin']),
    asyncHandler(deleteDeletionReason),
  );
  