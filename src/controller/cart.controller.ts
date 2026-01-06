// controller/cart.controller.ts
import { Request, Response } from "express";
import createError from "http-errors";
import { asyncHandler } from "../middleware/asyncHandler";
import Cart from "../models/cart.model";
import Product from "../models/product.model";
import UserModel from "../models/user";
import { Types } from "mongoose";

/**
 * Helper: ensure user exists and return actor
 */
async function getActor(req: any) {
  const user = req.user;
  if (!user) throw createError(401, req.t("UNAUTHORIZED"));
  const actor = await UserModel.findById(user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));
  return actor;
}

/**
 * Get or create cart for user
 */
async function getOrCreateCart(userId: Types.ObjectId) {
  let cart = await Cart.findOne({ userId });
  if (!cart) {
    cart = await Cart.create({ userId, items: [] });
  }
  return cart;
}

export const getCart = asyncHandler(async (req: any, res: Response) => {
  const actor = await getActor(req);
  const cart = await Cart.findOne({ userId: actor._id }).populate("items.productId").lean();
  res.json({ success: true, cart: cart || { items: [] } });
});

export const addToCart = asyncHandler(async (req: any, res: Response) => {
  const { productId, quantity } = req.body;
  const actor = await getActor(req);

  if (!Types.ObjectId.isValid(productId)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID") || "Invalid product id");
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw createError(404, req.t("PRODUCT_NOT_FOUND") || "Product not found");
  }

  if (product.stockQty < quantity) {
    throw createError(400, req.t("INSUFFICIENT_STOCK") || "Not enough stock");
  }

  const cart = await getOrCreateCart(actor._id);

  // ensure all items in cart have same currency
  if (cart.items.length > 0 && cart.items[0].currency !== product.currency) {
    throw createError(
      400,
      req.t("CART_CURRENCY_MISMATCH") || "Cart already has items with different currency"
    );
  }

  const item = cart.items.find((i) => i.productId.toString() === (product._id as Types.ObjectId).toString());
  if (item) {
    item.quantity += quantity;
    item.unitPrice = product.price;
    item.currency = product.currency;
  } else {
    cart.items.push({
      productId: product._id,
      quantity,
      unitPrice: product.price,
      currency: product.currency,
    } as any);
  }

  await cart.save();

  res.json({
    success: true,
    message: req.t("CART_UPDATED") || "Cart updated",
    cart: cart,
  });
});

export const updateCartItem = asyncHandler(async (req: any, res: Response) => {

  const { productId, quantity } = req.body;
  const actor = await getActor(req);

  if (!Types.ObjectId.isValid(productId)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID") || "Invalid product id");
  }

  const product = await Product.findById(productId);
  if (!product || !product.isActive) {
    throw createError(404, req.t("PRODUCT_NOT_FOUND") || "Product not found");
  }

  if (product.stockQty < quantity) {
    throw createError(400, req.t("INSUFFICIENT_STOCK") || "Not enough stock");
  }

  const cart = await getOrCreateCart(actor._id);

  const item = cart.items.find((i) => i.productId.toString() === (product._id as Types.ObjectId).toString());
  if (!item) {
    throw createError(404, req.t("CART_ITEM_NOT_FOUND") || "Item not in cart");
  }

  item.quantity = quantity;
  item.unitPrice = product.price;
  item.currency = product.currency;

  await cart.save();

  await cart.populate({
    path: "items.productId",
  });

  res.json({
    success: true,
    message: req.t("CART_UPDATED") || "Cart updated",
    cart: cart,
  });
});

export const removeCartItem = asyncHandler(async (req: any, res: Response) => {

  const { productId } = req.body;
  const actor = await getActor(req);

  if (!Types.ObjectId.isValid(productId)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID") || "Invalid product id");
  }

  const cart = await Cart.findOne({ userId: actor._id });
  if (!cart) {
    return res.json({ success: true, message: req.t("CART_EMPTY") || "Cart empty" });
  }

  cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
  await cart.save();

  await cart.populate({
    path: "items.productId",
  });

  res.json({
    success: true,
    message: req.t("CART_UPDATED") || "Cart updated",
    cart: cart,
  });
});

export const clearCart = asyncHandler(async (req: any, res: Response) => {
  const actor = await getActor(req);
  const cart = await Cart.findOne({ userId: actor._id });
  if (cart) {
    cart.items = [];
    await cart.save();
  }
  res.json({
    success: true,
    message: req.t("CART_CLEARED") || "Cart cleared",
  });
});
