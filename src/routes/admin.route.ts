import { Router } from 'express';
import { dashboardRouter } from './dashboard.route';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { asyncHandler } from '../middleware/asyncHandler';
import { getAllAnimalsAdmin, getAllGeofencesAdmin, getAllGpsAdmin, getUserFullDetails, getUsersList } from '../controller/admin.controller';
import { animalTypeRouter } from './animalType.route';
import { breedRouter } from './breed.route';
import { slideRouter } from './slide.route';
export const adminRouter = Router();
adminRouter.use('/dashboard', dashboardRouter);
adminRouter.use('/animalType',animalTypeRouter);
adminRouter.use('/breed', breedRouter);
adminRouter.use('/slide', slideRouter);
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

adminRouter.get(
  '/geofences',
  authenticate,
  requireRole(['admin', 'superadmin']),
  setUserLanguage,
  asyncHandler(getAllGeofencesAdmin),
);

adminRouter.get(
  "/gps",
  authenticate,
  setUserLanguage,
  asyncHandler(getAllGpsAdmin)
);

adminRouter.get(
  "/user/:id",
  authenticate,
  requireRole(["admin", "superadmin"]),
  setUserLanguage,
  asyncHandler(getUserFullDetails)
);