// routes/product.routes.ts
import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  activateProduct,
  deleteProduct,
} from "../controller/product.controller";
import {
  createProductSchema,
  updateProductSchema,
} from "../middleware/validate";
import { requireRole } from "../middleware/authRole";
import multer from "multer";

const upload = multer({ dest: "/tmp/uploads" }); 
export const productRouter = Router();

// We can allow browsing without auth if you want by removing authenticate here.
// For now, keep it protected like rest of your APIs:
productRouter.use(authenticate);
productRouter.use(setUserLanguage);

// List / filter / sort
productRouter.get(
  "/",
  asyncHandler(listProducts)
);


// Admin create/update/delete
productRouter.post(
  "/",
  requireRole(["admin","superadmin"]),
  upload.array('images', 10),
  validate(createProductSchema),
  asyncHandler(createProduct)
);

// Get single
productRouter.get("/:id", asyncHandler(getProduct));

productRouter.put(
  "/:id",
  requireRole(["admin","superadmin"]),
  upload.array("images", 10),
  validate(updateProductSchema),
  asyncHandler(updateProduct)
);

productRouter.delete(
  "/:id",
  requireRole(["admin", "superadmin"]),
  asyncHandler(deleteProduct)
);

productRouter.put("/:id/deactivate", requireRole(["admin","superadmin"]), asyncHandler(deactivateProduct));

productRouter.put("/:id/activate", requireRole(["admin","superadmin"]), asyncHandler(activateProduct));

