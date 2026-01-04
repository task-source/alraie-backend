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
  getSingleItemSummary,
  getCartSummary,
} from "../controller/order.controller";
import { subscriptionContext } from "../middleware/subscriptionContext";

export const orderRouter = Router();

orderRouter.use(authenticate);
orderRouter.use(subscriptionContext);
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

orderRouter.post(
  "/summary/single",
  asyncHandler(getSingleItemSummary)
);

orderRouter.get(
  "/summary/cart",
  asyncHandler(getCartSummary)
);

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