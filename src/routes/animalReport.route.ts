import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { asyncHandler } from "../middleware/asyncHandler";
import { createAnimalReportSchema, updateAnimalReportSchema, validate } from "../middleware/validate";
import {
    createAnimalReport,
    updateAnimalReport,
    getAnimalReport,
    deleteAnimalReport,
    listAnimalsWithReport,
    listAnimalsWithoutReport,
    listAnimalReports,
} from "../controller/animalReport.controller";


export const animalReportRouter = Router();

animalReportRouter.use(authenticate);

animalReportRouter.get(
    "/",
    asyncHandler(listAnimalReports)
);


// CREATE
animalReportRouter.post(
    "/",
    validate(createAnimalReportSchema),
    asyncHandler(createAnimalReport)
);

animalReportRouter.get(
    "/withReport",
    asyncHandler(listAnimalsWithReport)
);

// animals WITHOUT report
animalReportRouter.get(
    "/withoutReport",
    asyncHandler(listAnimalsWithoutReport)
);
// UPDATE
animalReportRouter.put(
    "/:reportId",
    validate(updateAnimalReportSchema),
    asyncHandler(updateAnimalReport)
);

// GET

// GET single report (existing)
animalReportRouter.get(
    "/:reportId",
    asyncHandler(getAnimalReport)
);
// DELETE
animalReportRouter.delete(
    "/:reportId",
    asyncHandler(deleteAnimalReport)
);

// STATUS LIST