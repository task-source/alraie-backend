import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { authenticate } from "../middleware/authMiddleware";
import { requireRole } from "../middleware/authRole";
import { listContactUs, submitContactUs } from "../controller/contactUs.controller";

export const contactUsRouter = Router();

contactUsRouter.post(
  "/",
  asyncHandler(submitContactUs)
);

contactUsRouter.get(
  "/admin",
  authenticate,
  requireRole(["admin", "superadmin"]),
  asyncHandler(listContactUs)
);
