import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/authRole";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  createDeliveryZone,
  listDeliveryZones,
  updateDeliveryZone,
  deleteDeliveryZone,
} from "../controller/deliveryZone.controller";
import {
  createDeliveryZoneSchema,
  updateDeliveryZoneSchema,
} from "../middleware/validate";
import { setUserLanguage } from "../middleware/setUserLanguage";

export const deliveryZoneRouter = Router();

deliveryZoneRouter.use(authenticate);
deliveryZoneRouter.use(requireRole(["admin", "superadmin"]));
deliveryZoneRouter.use(setUserLanguage);
deliveryZoneRouter.post(
  "/",
  validate(createDeliveryZoneSchema),
  asyncHandler(createDeliveryZone)
);

deliveryZoneRouter.get("/", asyncHandler(listDeliveryZones));

deliveryZoneRouter.put(
  "/:id",
  validate(updateDeliveryZoneSchema),
  asyncHandler(updateDeliveryZone)
);

deliveryZoneRouter.delete("/:id", asyncHandler(deleteDeliveryZone));
