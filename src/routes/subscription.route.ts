import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/authRole";
import { asyncHandler } from "../middleware/asyncHandler";
import { setUserLanguage } from "../middleware/setUserLanguage";

import {
  getMySubscription,
  listAvailablePlans,
  scheduleDowngrade,
  cancelSubscription,
  validateSubscriptionReceipt,
} from "../controller/subscription.controller";
import { scheduleDowngradeSchema, validate, validateSubscriptionReceiptSchema } from "../middleware/validate";

export const subscriptionRouter = Router();

subscriptionRouter.use(authenticate);
subscriptionRouter.use(setUserLanguage);

subscriptionRouter.get(
    "/me",
    requireRole(["owner", "assistant"]),
    asyncHandler(getMySubscription)
  );
  

subscriptionRouter.get(
  "/plans",
  asyncHandler(listAvailablePlans)
);

subscriptionRouter.post(
  "/verify",
  authenticate,
  requireRole(["owner"]),
  setUserLanguage,
  validate(validateSubscriptionReceiptSchema),
  asyncHandler(validateSubscriptionReceipt)
);

subscriptionRouter.post(
  "/downgrade",
  requireRole(["owner"]),
  validate(scheduleDowngradeSchema),
  asyncHandler(scheduleDowngrade)
);

subscriptionRouter.post(
  "/cancel",
  requireRole(["owner"]),
  asyncHandler(cancelSubscription)
);
