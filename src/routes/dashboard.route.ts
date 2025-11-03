import { Router } from 'express';
import { getAnimalStatusSummary, getDashboardStats, getUserGrowthStats } from '../controller/dashboard.controller';
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

dashboardRouter.get(
  '/userGrowth',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(getUserGrowthStats),
);

dashboardRouter.get(
  '/animalStatusSummary',
  authenticate,
  requireRole(['owner', 'assistant', 'admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(getAnimalStatusSummary),
);