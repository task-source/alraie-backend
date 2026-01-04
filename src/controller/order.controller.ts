// controller/order.controller.ts
import { Request, Response } from "express";
import createError from "http-errors";
import { asyncHandler } from "../middleware/asyncHandler";
import UserModel from "../models/user";
import Cart from "../models/cart.model";
import Product from "../models/product.model";
import Order, { OrderStatus } from "../models/order.model";
import Address from "../models/address.model";
import {
  adminListOrdersQuerySchema,
} from "../middleware/validate";
import { Types } from "mongoose";
import { stripe } from "../services/stripe.Service";
import Stripe from "stripe";
function isAdminRole(role: string) {
  return role === "admin" || role === "superadmin";
}

async function getActor(req: any) {
  const user = req.user;
  if (!user) throw createError(401, req.t("UNAUTHORIZED"));
  const actor = await UserModel.findById(user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));
  return actor;
}

/**
 * User checkout: create Order from Cart
 */
export const checkout = asyncHandler(async (req: any, res: Response) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const { addressId, notes, paymentMethod } = req.body;
    const actor = await getActor(req);

    // -----------------------------
    // Validate address
    // -----------------------------
    if (!Types.ObjectId.isValid(addressId)) {
      throw createError(400, req.t("INVALID_ADDRESS_ID"));
    }

    const address = await Address.findOne(
      { _id: addressId, userId: actor._id },
      null,
      { session }
    ).lean();

    if (!address) {
      throw createError(404, req.t("ADDRESS_NOT_FOUND"));
    }

    // -----------------------------
    // Get cart
    // -----------------------------
    const cart = await Cart.findOne(
      { userId: actor._id },
      null,
      { session }
    ).lean();

    if (!cart || cart.items.length === 0) {
      throw createError(400, req.t("CART_EMPTY"));
    }

    // -----------------------------
    // Prepare order items + reserve stock atomically
    // -----------------------------
    let subtotal = 0;
    const orderItems: any[] = [];
    const currency = cart.items[0].currency;

    for (const item of cart.items) {
      // 🔒 Atomic stock reservation
      const product = await Product.findOne(
        {
          _id: item.productId,
          isActive: true,
          stockQty: { $gte: item.quantity },
        },
        null,
        { session }
      );

      if (!product) {
        throw createError(
          409,
          req.t("INSUFFICIENT_STOCK") || "Insufficient stock"
        );
      }

      if (product.currency !== currency) {
        throw createError(
          400,
          req.t("CART_CURRENCY_MISMATCH")
        );
      }

      const lineTotal = product.price * item.quantity;
      subtotal += lineTotal;

      orderItems.push({
        productId: product._id,
        productName: product.name,
        productImage: product.images?.[0],
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal,
        currency,
      });
    }

    // -----------------------------
    // Pricing
    // -----------------------------
    const shippingFee = 0;
    const taxAmount = 0;
    const total = subtotal + shippingFee + taxAmount;

    // -----------------------------
    // Create order (with reservation expiry)
    // -----------------------------
    const [order] = await Order.create(
      [
        {
          userId: actor._id,
          items: orderItems,
          subtotal,
          shippingFee,
          taxAmount,
          total,
          currency,
          status: "pending",
          paymentStatus: "pending",
          paymentMethod,
          reservedUntil: new Date(Date.now() + 15 * 60 * 1000), // ⏰ 15 min
          stockReleased: false,
          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            country: address.country,
            postalCode: address.postalCode,
          },
          notes,
        },
      ],
      { session }
    );

    // -----------------------------
    // Clear cart
    // -----------------------------
    await Cart.updateOne(
      { userId: actor._id },
      { $set: { items: [] } },
      { session }
    );

    // -----------------------------
    // Commit transaction
    // -----------------------------
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: req.t("ORDER_CREATED") || "Order created",
      data: order,
      publicKey: process.env.STRIPE_PUBLIC_KEY ?? "" 
    });

  } catch (err) {

    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

/**
 * User: list my orders
 */
export const listMyOrders = asyncHandler(async (req: any, res: Response) => {
  const actor = await getActor(req);
  const q = req.query;

  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  // -----------------------------
  // Base filter (user scoped)
  // -----------------------------
  const filter: any = {
    userId: actor._id,
  };

  // -----------------------------
  // Filters
  // -----------------------------
  if (q.status) filter.status = q.status;

  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;

  if (q.paymentMethod) filter.paymentMethod = q.paymentMethod;

  if (q.currency) filter.currency = q.currency;

  if (q.minTotal || q.maxTotal) {
    filter.total = {};
    if (q.minTotal) filter.total.$gte = Number(q.minTotal);
    if (q.maxTotal) filter.total.$lte = Number(q.maxTotal);
  }

  if (q.fromDate || q.toDate) {
    filter.createdAt = {};
    if (q.fromDate) filter.createdAt.$gte = new Date(q.fromDate);
    if (q.toDate) filter.createdAt.$lte = new Date(q.toDate);
  }

  // -----------------------------
  // Search (order id or product name)
  // -----------------------------
  if (q.search) {
    const s = String(q.search);
    filter.$or = [
      { _id: Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : undefined },
      { "items.productName": { $regex: s, $options: "i" } },
    ].filter(Boolean);
  }

  // -----------------------------
  // Sorting
  // -----------------------------
  let sort: any = { createdAt: -1 };

  switch (q.sort) {
    case "date_oldest":
      sort = { createdAt: 1 };
      break;

    case "total_high_to_low":
      sort = { total: -1 };
      break;

    case "total_low_to_high":
      sort = { total: 1 };
      break;

    case "date_latest":
    default:
      sort = { createdAt: -1 };
      break;
  }

  // -----------------------------
  // Query
  // -----------------------------
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    orders,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

/**
 * User: get single order
 */
export const getOrderById = asyncHandler(async (req: any, res: Response) => {
  const actor = await getActor(req);
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_ORDER_ID") || "Invalid order id");
  }

  const isAdmin = actor.role === "admin" || actor.role === "superadmin";

  /**
   * 🔐 Access control
   * - Admin → any order
   * - User  → only own order
   */
  const filter: any = { _id: id };
  if (!isAdmin) {
    filter.userId = actor._id;
  }

  const order = await Order.findOne(filter)
    .populate({
      path: "items.productId",
      select: "isActive",
    })
    .lean();

  if (!order) {
    throw createError(404, req.t("ORDER_NOT_FOUND"));
  }

  /**
   * 🔒 Optional hardening:
   * Hide inactive products from users (admins still see them)
   */
  if (!isAdmin) {
    order.items = order.items.map((item: any) => {
      if (item.productId && !item.productId.isActive) {
        item.productId = null;
      }
      return item;
    });
  }

  res.json({
    success: true,
    data: order,
  });
});


/**
 * Admin: list all orders
 */
export const adminListOrders = asyncHandler(async (req: any, res: Response) => {
  const actor = await getActor(req);
  if (!isAdminRole(actor.role)) {
    throw createError(403, req.t("FORBIDDEN"));
  }

  const parsed = adminListOrdersQuerySchema.safeParse({ query: req.query });
  if (!parsed.success) {
    throw createError(
      400,
      parsed.error.issues.map((e) => e.message).join(", ")
    );
  }

  const q = parsed.data.query;

  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  // -----------------------------
  // Filters
  // -----------------------------
  const filter: any = {};

  if (q.status) filter.status = q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
  if (q.paymentMethod) filter.paymentMethod = q.paymentMethod;
  if (q.currency) filter.currency = q.currency;

  if (q.userId) {
    if (!Types.ObjectId.isValid(q.userId)) {
      throw createError(400, req.t("INVALID_USER_ID"));
    }
    filter.userId = q.userId;
  }

  if (q?.productId) {
    if (!Types.ObjectId.isValid(q?.productId)) {
      throw createError(400, req.t("INVALID_PRODUCT_ID"));
    }
    filter["items.productId"] = new Types.ObjectId(String(q?.productId));
  }

  if (q.minTotal || q.maxTotal) {
    filter.total = {};
    if (q.minTotal) filter.total.$gte = Number(q.minTotal);
    if (q.maxTotal) filter.total.$lte = Number(q.maxTotal);
  }

  if (q.fromDate || q.toDate) {
    filter.createdAt = {};
    if (q.fromDate) filter.createdAt.$gte = new Date(q.fromDate);
    if (q.toDate) filter.createdAt.$lte = new Date(q.toDate);
  }

  // -----------------------------
  // Search
  // -----------------------------
  if (q.search) {
    const s = String(q.search);
    filter.$or = [
      Types.ObjectId.isValid(s) ? { _id: new Types.ObjectId(s) } : null,
      { "items.productName": { $regex: s, $options: "i" } },
    ].filter(Boolean);
  }

  // -----------------------------
  // Sorting
  // -----------------------------
  let sort: any = { createdAt: -1 };

  switch (q.sort) {
    case "date_oldest":
      sort = { createdAt: 1 };
      break;
    case "total_high_to_low":
      sort = { total: -1 };
      break;
    case "total_low_to_high":
      sort = { total: 1 };
      break;
    case "date_latest":
    default:
      sort = { createdAt: -1 };
      break;
  }

  // -----------------------------
  // Query
  // -----------------------------
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    items: orders,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});


/**
 * Admin: update order status
 */
export const adminUpdateOrderStatus = asyncHandler(async (req: any, res: Response) => {
  const actor = await getActor(req);
  if (!isAdminRole(actor.role)) {
    throw createError(403, req.t("FORBIDDEN"));
  }

  const { id } = req.params;
  const { status: newStatus } = req.body;

  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_ORDER_ID"));
  }

  const order = await Order.findById(id);
  if (!order) {
    throw createError(404, req.t("ORDER_NOT_FOUND"));
  }

  const currentStatus = order.status;

  // -----------------------------
  //  HARD STOPS
  // -----------------------------
  if (["cancelled", "refunded"].includes(currentStatus)) {
    throw createError(
      400,
      req.t("ORDER_ALREADY_FINALIZED") || "Order is already finalized"
    );
  }

  if (currentStatus === "delivered") {
    throw createError(
      400,
      req.t("DELIVERED_ORDER_CANNOT_CHANGE") || "Delivered order cannot be updated"
    );
  }

  // -----------------------------
  //  VALID STATUS TRANSITIONS
  // -----------------------------
  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["cancelled"],
    paid: ["processing", "cancelled"],
    processing: ["shipped"],
    shipped: ["delivered"],
    delivered: [],
    cancelled: [],
    refunded: [],
  };
  const allowedNext = allowedTransitions[currentStatus] || [];

  if (!allowedNext.includes(newStatus)) {
    throw createError(
      400,
      req.t("INVALID_ORDER_STATUS_TRANSITION") ||
        `Cannot change status from ${currentStatus} to ${newStatus}`
    );
  }

  // 🔧 FIX: admin NEVER mutates paymentStatus
  order.status = newStatus;
  await order.save();

  res.json({
    success: true,
    message: req.t("ORDER_STATUS_UPDATED") || "Order status updated",
    data: order,
  });
});

export const buySingleItem = asyncHandler(async (req: any, res: Response) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const { productId, quantity, addressId, notes, paymentMethod } = req.body;
    const actor = await getActor(req);

    const address = await Address.findOne({
      _id: addressId,
      userId: actor._id,
    }).lean();

    if (!address) throw createError(404, req.t("ADDRESS_NOT_FOUND"));

    const product = await Product.findOne(
      {
        _id: productId,
        isActive: true,
        stockQty: { $gte: quantity },
      },
      null,
      { session }
    );

    if (!product)
      throw createError(409, req.t("INSUFFICIENT_STOCK"));

    const order = await Order.create([{
      userId: actor._id,
      items: [{
        productId: product._id,
        productName: product.name,
        productImage: product.images?.[0],
        unitPrice: product.price,
        quantity,
        lineTotal: product.price * quantity,
        currency: product.currency,
      }],
      subtotal: product.price * quantity,
      shippingFee: 0,
      taxAmount: 0,
      total: product.price * quantity,
      currency: product.currency,
      status: "pending",
      paymentStatus: "pending",
      paymentMethod,
      reservedUntil: new Date(Date.now() + 15 * 60 * 1000),
      shippingAddress: address,
      notes,
    }], { session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: order[0], publicKey: process.env.STRIPE_PUBLIC_KEY ?? "" });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});

export const cancelOrder = asyncHandler(async (req: any, res: Response) => {
  const session = await Order.startSession();
  session.startTransaction();

  try {
    const actor = await getActor(req);
    const { id } = req.params;

    if (!Types.ObjectId.isValid(id)) {
      throw createError(400, req.t("INVALID_ORDER_ID"));
    }

    /**
     *  Access control
     * - User can cancel ONLY own order
     * - Admin cancellation should use a separate admin API
     */
    const order = await Order.findOne(
      { _id: id, userId: actor._id },
      null,
      { session }
    );

    if (!order) {
      throw createError(404, req.t("ORDER_NOT_FOUND"));
    }

    /**
     *  Idempotency
     * If already cancelled → safe no-op
     */
    if (order.status === "cancelled") {
      await session.commitTransaction();
      session.endSession();

      return res.json({
        success: true,
        message:
          req.t("ORDER_ALREADY_CANCELLED") || "Order already cancelled",
      });
    }

    /**
     *  Cancellation allowed only in safe states
     */
    if (!["pending", "paid"].includes(order.status)) {
      throw createError(
        400,
        req.t("ORDER_CANNOT_BE_CANCELLED") ||
          "Order can no longer be cancelled"
      );
    }

    if (order.paymentStatus === "pending") {
      order.status = "cancelled";
      order.paymentStatus = "failed";
    } else {
    
      await stripe.refunds.create({
        payment_intent: order.payment?.intentId,
      });
      order.status = "cancelled";
    }

    await order.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message:
        req.t("ORDER_CANCELLED") || "Order cancelled successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
});


export const createPaymentIntent = async (req: any, res: Response) => {
  const { id } = req.params;
  const userId = req.user.id;

  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, "INVALID_ORDER_ID");
  }

  const order = await Order.findOne({
    _id: id,
    userId,
    status: "pending",
    paymentStatus: "pending",
  });

  if (!order || !order._id) {
    throw createError(404, "ORDER_NOT_PAYABLE");
  }

  const amount = Math.round(order.total * 100); // card-only, 2 decimals

  const intent = await stripe.paymentIntents.create({
    amount,
    currency: order.currency.toLowerCase(),
    payment_method_types: ["card"],
    automatic_payment_methods: {
      enabled: true,
    },    
    metadata: {
      orderId: order._id.toString(),
      userId: order.userId.toString(),
    },
    },
    {idempotencyKey: `order_${order._id}`,
  });

  order.payment = {
    provider: "stripe",
    intentId: intent.id,
  };

  await order.save();

  res.json({
    success: true,
    clientSecret: intent.client_secret,
  });
};


export const stripeWebhookHandler = async (req: any, res: Response) => {
  const sig = req.headers["stripe-signature"];

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return res.status(400).send("Invalid signature");
  }

  const data = event.data.object as any;

  if (event.type === "payment_intent.succeeded") {
    const session = await Order.startSession();
    session.startTransaction();

    try {
      const order = await Order.findById(data.metadata?.orderId).session(session);
      if (!order) {
        await session.commitTransaction();
        return res.json({ received: true });
      }

    if (order.payment?.lastEventId === event.id) {
        await session.commitTransaction();
      return res.json({ received: true });
    }

    for (const item of order.items) {
      const updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          stockQty: { $gte: item.quantity },
        },
        { $inc: { stockQty: -item.quantity } }
        ,  { session }
      );

      if (!updated) {
        await stripe.refunds.create({
          payment_intent: data.id,
        });
        throw new Error("STOCK_FAILED");
      }
    }

    order.status = "paid";
    order.paymentStatus = "succeeded";
    order.payment.chargeId = data.latest_charge;
    order.payment.lastEventId = event.id;

      await order.save({ session });
      await session.commitTransaction();
    } catch {
      await session.abortTransaction();
    } finally {
      session.endSession();
    }
  }

  if (event.type === "charge.refunded") {
    const order = await Order.findOne({
      "payment.intentId": data.payment_intent,
    });

    if (order && !order.stockReleased) {
      for (const item of order.items) {
        await Product.updateOne(
          { _id: item.productId },
          { $inc: { stockQty: item.quantity } }
        );
      }

      order.status = "refunded";
      order.paymentStatus = "refunded";
      order.stockReleased = true;
      order.payment.lastEventId = event.id;

      await order.save();
    }
  }

  res.json({ received: true });
};

export const getSingleItemSummary = asyncHandler(async (req: any, res: Response) => {
  const { productId, quantity } = req.body;

  if (!productId || !Types.ObjectId.isValid(productId)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID"));
  }

  const product = await Product.findOne({
    _id: productId,
    isActive: true,
  }).lean();

  if (!product) {
    throw createError(404, req.t("PRODUCT_NOT_FOUND"));
  }

  if (!quantity || isNaN(quantity?.toString())) {
    throw createError(404, req.t("INVALID_QUANTITY"));
  }

  if (product.stockQty < quantity) {
    throw createError(409, req.t("INSUFFICIENT_STOCK"));
  }

  const subtotal = product.price * quantity;
  const shippingFee = 0;
  const taxAmount = 0;
  const total = subtotal + shippingFee + taxAmount;

  res.json({
    success: true,
    summary: {
      items: [
        {
          productId: product._id,
          name: product.name,
          image: product.images?.[0],
          unitPrice: product.price,
          quantity,
          lineTotal: subtotal,
          currency: product.currency,
        },
      ],
      subtotal,
      shippingFee,
      taxAmount,
      total,
      currency: product.currency,
    },
  });
});

export const getCartSummary = asyncHandler(async (req: any, res: Response) => {
  const actor = await getActor(req);

  const cart = await Cart.findOne({ userId: actor._id }).lean();
  if (!cart || cart.items.length === 0) {
    throw createError(400, req.t("CART_EMPTY"));
  }

  let subtotal = 0;
  const items: any[] = [];
  const currency = cart.items[0].currency;

  for (const item of cart.items) {
    const product = await Product.findOne({
      _id: item.productId,
      isActive: true,
    }).lean();

    if (!product) {
      throw createError(404, req.t("PRODUCT_NOT_FOUND"));
    }

    if (product.currency !== currency) {
      throw createError(400, req.t("CART_CURRENCY_MISMATCH"));
    }

    if (product.stockQty < item.quantity) {
      throw createError(409, req.t("INSUFFICIENT_STOCK"));
    }

    const lineTotal = product.price * item.quantity;
    subtotal += lineTotal;

    items.push({
      productId: product._id,
      name: product.name,
      image: product.images?.[0],
      unitPrice: product.price,
      quantity: item.quantity,
      lineTotal,
      currency,
    });
  }

  const shippingFee = 0;
  const taxAmount = 0;
  const total = subtotal + shippingFee + taxAmount;

  res.json({
    success: true,
    summary: {
      items,
      subtotal,
      shippingFee,
      taxAmount,
      total,
      currency,
    },
  });
});
