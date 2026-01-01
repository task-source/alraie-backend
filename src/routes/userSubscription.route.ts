import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/authRole";
import { asyncHandler } from "../middleware/asyncHandler";
import { setUserLanguage } from "../middleware/setUserLanguage";

import {
  adminAssignSubscription,
  adminListSubscriptions,
  adminGetUserSubscription,
} from "../controller/userSubscription.controller";
import { adminAssignSubscriptionSchema, validate } from "../middleware/validate";

export const adminUserSubscriptionRouter = Router();

adminUserSubscriptionRouter.use(authenticate);
adminUserSubscriptionRouter.use(requireRole(["admin", "superadmin"]));
adminUserSubscriptionRouter.use(setUserLanguage);

adminUserSubscriptionRouter.get(
  "/",
  asyncHandler(adminListSubscriptions)
);

adminUserSubscriptionRouter.post(
  "/assign",
  validate(adminAssignSubscriptionSchema),
  asyncHandler(adminAssignSubscription)
);

adminUserSubscriptionRouter.get(
  "/:ownerId",
  asyncHandler(adminGetUserSubscription)
);
