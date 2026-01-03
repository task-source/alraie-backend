import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { asyncHandler } from "../middleware/asyncHandler";
import { updateGpsCredsSchema, validate } from "../middleware/validate";

import {
  registerAndLinkGps,
  deleteGps,
  unlinkGpsFromAnimal,
  getAnimalsWithoutGps,
  getAnimalsWithGps,
  updateGpsCreds,
} from "../controller/gps.controller";

import {
  registerAndLinkGpsSchema,
  deleteGpsSchema,
  unlinkGpsSchema,
} from "../middleware/validate";
import { subscriptionContext } from "../middleware/subscriptionContext";

export const gpsRouter = express.Router();

gpsRouter.use(authenticate);
gpsRouter.use(subscriptionContext);
gpsRouter.use(setUserLanguage);

gpsRouter.post(
  "/registerLink",
  validate(registerAndLinkGpsSchema),
  asyncHandler(registerAndLinkGps)
);

gpsRouter.post(
  "/updateCreds",
  validate(updateGpsCredsSchema),
  asyncHandler(updateGpsCreds)
);

gpsRouter.post("/unlink", validate(unlinkGpsSchema), asyncHandler(unlinkGpsFromAnimal));

gpsRouter.get("/animals/noGps", asyncHandler(getAnimalsWithoutGps));
gpsRouter.get("/animals/withGps", asyncHandler(getAnimalsWithGps));

gpsRouter.post(
  "/delete",
  validate(deleteGpsSchema),
  asyncHandler(deleteGps)
);
