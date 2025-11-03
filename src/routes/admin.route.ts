import { Router } from 'express';
import { dashboardRouter } from './dashboard.route';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { asyncHandler } from '../middleware/asyncHandler';
import { getAllAnimalsAdmin, getUsersList } from '../controller/admin.controller';
import { animalTypeRouter } from './animalType.route';
export const adminRouter = Router();
adminRouter.use('/dashboard', dashboardRouter);
adminRouter.use('/animalType',animalTypeRouter)
adminRouter.get(
  '/users',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(getUsersList),
);

adminRouter.get(
  '/animals',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(getAllAnimalsAdmin),
);