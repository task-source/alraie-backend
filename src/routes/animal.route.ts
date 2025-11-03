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
  getAnimalStats
} from "../controller/animal.controller";
import { validate } from "../middleware/validate";
import { createAnimalSchema, updateAnimalSchema} from "../middleware/validate";

export const animalRouter = Router();
const upload = multer({ dest: "/tmp/uploads" }); // adjust tmp dir for your environment

// All animal endpoints need auth (owner/assistant/admin)
animalRouter.use(authenticate);
animalRouter.use(setUserLanguage);

// create (multipart, single profilePicture)
animalRouter.post("/", upload.single("profilePicture"), validate(createAnimalSchema), asyncHandler(createAnimal));

// list (query)
animalRouter.get("/", asyncHandler(listAnimals));

animalRouter.get("/stats", asyncHandler(getAnimalStats));

// get one
animalRouter.get("/:id", asyncHandler(getAnimal));

// update (multipart optional)
animalRouter.put("/:id", upload.single("profilePicture"), validate(updateAnimalSchema), asyncHandler(updateAnimal));

// delete
animalRouter.delete("/:id", asyncHandler(deleteAnimal));
