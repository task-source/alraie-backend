import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  createGeofence,
  listGeofences,
  updateGeofence,
  deleteGeofence,
  addAnimalToGeofence,
  removeAnimalFromGeofence
} from "../controller/geofence.controller";
import { createGeofenceSchema, updateGeofenceSchema, linkAnimalSchema } from "../middleware/validate";

export const geofenceRouter = Router();

geofenceRouter.use(authenticate);
geofenceRouter.use(setUserLanguage);

geofenceRouter.post("/", validate(createGeofenceSchema), asyncHandler(createGeofence));
geofenceRouter.get("/", asyncHandler(listGeofences));
geofenceRouter.put("/:id", validate(updateGeofenceSchema), asyncHandler(updateGeofence));
geofenceRouter.delete("/:id", asyncHandler(deleteGeofence));

geofenceRouter.post("/:id/animals", validate(linkAnimalSchema), asyncHandler(addAnimalToGeofence));
geofenceRouter.delete("/:id/animals/:uniqueAnimalId", asyncHandler(removeAnimalFromGeofence));
