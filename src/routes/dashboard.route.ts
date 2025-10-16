import { Router } from 'express';
import { getDashboardStats } from '../controller/dashboard.controller';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { asyncHandler } from '../middleware/asyncHandler';
import { setUserLanguage } from '../middleware/setUserLanguage';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/stats',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(getDashboardStats),
);