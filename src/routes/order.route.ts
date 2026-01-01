// routes/order.routes.ts
import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware";
import { setUserLanguage } from "../middleware/setUserLanguage";
import { asyncHandler } from "../middleware/asyncHandler";
import {  cancelOrderSchema, checkoutSingleSchema, validate ,  checkoutSchema,  adminUpdateOrderStatusSchema,} from "../middleware/validate";
import {
  checkout,
  listMyOrders,
  getOrderById,
  adminUpdateOrderStatus,
  buySingleItem,
  cancelOrder,
  adminListOrders,
  createPaymentIntent,
} from "../controller/order.controller";
export const orderRouter = Router();

orderRouter.use(authenticate);
orderRouter.use(setUserLanguage);

// User
orderRouter.get("/", asyncHandler(listMyOrders));
orderRouter.post("/checkout", validate(checkoutSchema), asyncHandler(checkout));
orderRouter.post(
  "/buySingle",
  validate(checkoutSingleSchema),
  asyncHandler(buySingleItem)
);

orderRouter.get( "/admin", asyncHandler(adminListOrders) );

orderRouter.post("/:id/pay", asyncHandler(createPaymentIntent));

orderRouter.patch(
  "/:id/status",
  validate(adminUpdateOrderStatusSchema),
  asyncHandler(adminUpdateOrderStatus)
);


orderRouter.post(
  "/:id/cancel",
  validate(cancelOrderSchema),
  asyncHandler(cancelOrder)
);

orderRouter.get("/:id", asyncHandler(getOrderById));