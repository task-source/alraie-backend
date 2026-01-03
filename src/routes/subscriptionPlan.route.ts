import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/authRole";
import { asyncHandler } from "../middleware/asyncHandler";
import { setUserLanguage } from "../middleware/setUserLanguage";

import {
  createPlan,
  updatePlan,
  listPlans,
  getPlan,
  deactivatePlan,
  activatePlan,
} from "../controller/subscriptionPlan.controller";

import { createSubscriptionPlanSchema, updateSubscriptionPlanSchema, validate } from "../middleware/validate";

export const adminSubscriptionPlanRouter = Router();

adminSubscriptionPlanRouter.use(authenticate);
adminSubscriptionPlanRouter.use(requireRole(["admin", "superadmin"]));
adminSubscriptionPlanRouter.use(setUserLanguage);

adminSubscriptionPlanRouter.post(
  "/",
  validate(createSubscriptionPlanSchema),
  asyncHandler(createPlan)
);

adminSubscriptionPlanRouter.get(
  "/",
  asyncHandler(listPlans)
);

adminSubscriptionPlanRouter.get(
  "/:id",
  asyncHandler(getPlan)
);

adminSubscriptionPlanRouter.put(
  "/:id",
  validate(updateSubscriptionPlanSchema),
  asyncHandler(updatePlan)
);

adminSubscriptionPlanRouter.put(
  "/:id/deactivate",
  asyncHandler(deactivatePlan)
);

adminSubscriptionPlanRouter.put(
  "/:id/activate",
  asyncHandler(activatePlan)
);
