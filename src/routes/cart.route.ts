// routes/cart.routes.ts
import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from "../controller/cart.controller";
import {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema,
} from "../middleware/validate";

export const cartRouter = Router();

cartRouter.use(authenticate);
cartRouter.use(setUserLanguage);

cartRouter.get("/", asyncHandler(getCart));

cartRouter.post("/add", validate(addToCartSchema), asyncHandler(addToCart));

cartRouter.put("/update", validate(updateCartItemSchema), asyncHandler(updateCartItem));

cartRouter.post("/remove", validate(removeCartItemSchema), asyncHandler(removeCartItem));

cartRouter.delete("/", asyncHandler(clearCart));
