import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authMiddleware";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  createAnimal,
  listAnimals,
  getAnimal,
  updateAnimal,
  deleteAnimal,
  getAnimalStats,
  checkUniqueAnimalId
} from "../controller/animal.controller";
import { validate } from "../middleware/validate";
import { createAnimalSchema, updateAnimalSchema} from "../middleware/validate";
import { subscriptionContext } from "../middleware/subscriptionContext";
import { requireQuota } from "../middleware/requireSubscriptionQuota";

export const animalRouter = Router();
const upload = multer({ dest: "/tmp/uploads" }); // adjust tmp dir for your environment

// All animal endpoints need auth (owner/assistant/admin)
animalRouter.use(authenticate);
animalRouter.use(subscriptionContext);
animalRouter.use(setUserLanguage);

// create (multipart, single profilePicture)
animalRouter.post("/",  requireQuota("animal"),upload.array('images', 6), validate(createAnimalSchema), asyncHandler(createAnimal));

// list (query)
animalRouter.get("/", asyncHandler(listAnimals));

animalRouter.get("/stats", asyncHandler(getAnimalStats));

animalRouter.post("/checkAnimalId", asyncHandler(checkUniqueAnimalId));

// get one
animalRouter.get("/:id", asyncHandler(getAnimal));

// update (multipart optional)
animalRouter.put("/:id",upload.array('images', 6), validate(updateAnimalSchema), asyncHandler(updateAnimal));

// delete
animalRouter.delete("/:id", asyncHandler(deleteAnimal));
