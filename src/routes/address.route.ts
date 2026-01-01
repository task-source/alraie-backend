import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";
import {
  createAddress,
  listAddresses,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "../controller/address.controller";
import {
  createAddressSchema,
  updateAddressSchema,
} from "../middleware/validate";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { subscriptionContext } from "../middleware/subscriptionContext";

export const addressRouter = Router();

addressRouter.use(authenticate);
addressRouter.use(subscriptionContext);
addressRouter.use(setUserLanguage);

addressRouter.post("/", validate(createAddressSchema), asyncHandler(createAddress));
addressRouter.get("/", asyncHandler(listAddresses));
addressRouter.put("/:id", validate(updateAddressSchema), asyncHandler(updateAddress));
addressRouter.delete("/:id", asyncHandler(deleteAddress));
addressRouter.put("/:id/default", asyncHandler(setDefaultAddress));
