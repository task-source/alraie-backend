import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";

import {
  registerAndLinkGps,
  deleteGps,
  unlinkGpsFromAnimal,
  getAnimalsWithoutGps,
  getAnimalsWithGps,
} from "../controller/gps.controller";

import {
  registerAndLinkGpsSchema,
  deleteGpsSchema,
  unlinkGpsSchema,
} from "../middleware/validate";

export const gpsRouter = express.Router();

gpsRouter.use(authenticate);
gpsRouter.use(setUserLanguage);

gpsRouter.post(
  "/registerLink",
  validate(registerAndLinkGpsSchema),
  asyncHandler(registerAndLinkGps)
);


gpsRouter.post("/unlink", validate(unlinkGpsSchema), asyncHandler(unlinkGpsFromAnimal));

gpsRouter.get("/animals/noGps", asyncHandler(getAnimalsWithoutGps));
gpsRouter.get("/animals/withGps", asyncHandler(getAnimalsWithGps));

gpsRouter.post(
  "/delete",
  validate(deleteGpsSchema),
  asyncHandler(deleteGps)
);
