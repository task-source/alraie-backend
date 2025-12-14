// controller/product.controller.ts
import { Request, Response } from "express";
import createError from "http-errors";
import Product from "../models/product.model";
import UserModel from "../models/user";
import { asyncHandler } from "../middleware/asyncHandler";
import { Types } from "mongoose";
import { listProductsQuerySchema } from "../middleware/validate";
import { FileService } from "../services/fileService";
import fs from 'fs';
import orderModel from "../models/order.model";

// Helpers
function isAdminRole(role: string) {
  return role === "admin" || role === "superadmin";
}

/**
 * Public + Admin: list products with filters, pagination & sorting
 */
export const listProducts = asyncHandler(async (req: any, res: Response) => {
  const parsed = listProductsQuerySchema.safeParse({ query: req.query });
  if (!parsed.success) {
    throw createError(400, parsed.error.issues.map((e: any) => e.message).join(", "));
  }
  const q = parsed.data.query;

  const user = req.user;
  const actor = user ? await UserModel.findById(user.id) : null;

  const page = Math.max(1, Number(q.page || 1));
  const limit = Math.min(100, Number(q.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};

  // search
  if (q.search) {
    filter.$text = { $search: q.search };
  }

  // category
  if (q.categoryId && Types.ObjectId.isValid(q.categoryId)) {
    filter.categoryId = q.categoryId;
  }

  // currency filter (optional)
  if (q.currency) filter.currency = q.currency;

  // price range
  if (q.minPrice || q.maxPrice) {
    filter.price = {};
    if (q.minPrice) filter.price.$gte = Number(q.minPrice);
    if (q.maxPrice) filter.price.$lte = Number(q.maxPrice);
  }

  // Only admins can see inactive products unless explicitly asked
  const includeInactive = q.includeInactive === "true";
  if (!includeInactive || !actor || !isAdminRole(actor.role)) {
    filter.isActive = true;
  }

  // sorting
  const sortBy = q.sortBy || "createdAt";
  const sortOrder = q.sortOrder === "asc" ? 1 : -1;
  const sort: any = { [sortBy]: sortOrder };

  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

/**
 * Public: get single product
 */
export const getProduct = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID") || "Invalid product id");
  }

  const actor = await UserModel.findById(req.user?.id);

  const product = await Product.findById(id).lean();
  if (!product) {
    throw createError(404, req.t("PRODUCT_NOT_FOUND") || "Product not found");
  }

  // 🔒 If product is inactive → only admin/superadmin can view
  if (!product.isActive) {
    if (!actor || !isAdminRole(actor.role)) {
      throw createError(404, req.t("PRODUCT_NOT_FOUND") || "Product not found");
    }
  }

  res.json({ success: true, data: product });
});

/**
 * Admin: create product
 */
export const createProduct = asyncHandler(async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));

  if (!isAdminRole(actor.role)) {
    throw createError(403, req.t("FORBIDDEN"));
  }

  const data = req.body;
  const exists = await Product.findOne({ slug: data.slug });
  if (exists) {
    throw createError(400, req.t("PRODUCT_SLUG_EXISTS") || "Slug already exists");
  }

  if (data.stockQty !== undefined) {
    data.stockQty = parseInt(data.stockQty);
  }
  if (data.price !== undefined) {
    data.price = parseFloat(data.price);
  }

  let imageUrls: string[] = [];

  if (req.files && Array.isArray(req.files)) {
   const fileService = new FileService();

 for (const file of req.files.slice(0, 10)) {
   try {
     const safeName = `products/${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
     const uploadedUrl = await fileService.uploadFile(file.path, safeName, file.mimetype);
     imageUrls.push(uploadedUrl);
   } catch (err: any) {
     console.error(`❌ Failed to upload ${file.originalname}:`, err.message);
     if (file.path && fs.existsSync(file.path)) {
       fs.unlinkSync(file.path); // cleanup failed upload
       }
     }
   }
   data.images = imageUrls;
 }
  const product = await Product.create(data);

  res.status(201).json({
    success: true,
    message: req.t("PRODUCT_CREATED") || "Product created",
    data: product,
  });
});

/**
 * Admin: update product
 */
export const updateProduct = asyncHandler(async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));
  if (!isAdminRole(actor.role)) throw createError(403, req.t("FORBIDDEN"));

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID"));
  }

  const product = await Product.findById(id);
  if (!product) throw createError(404, req.t("PRODUCT_NOT_FOUND"));

  if(req?.body?.slug){
    const exists = await Product.findOne({ slug: req?.body?.slug });
  if (exists) {
    throw createError(400, req.t("PRODUCT_SLUG_EXISTS") || "Slug already exists");
  }

  };

  // Parse numeric fields
  if (req.body.stockQty !== undefined) {
    req.body.stockQty = parseInt(req.body.stockQty);
  }
  if (req.body.price !== undefined) {
    req.body.price = parseFloat(req.body.price);
  }

  const fileService = new FileService();
  const newUrls: string[] = [];
  let imagesToDelete: string[] = [];

  // 🧠 Parse imagesToDelete safely
  try {
    if (typeof req.body.imagesToDelete === "string") {
      imagesToDelete = JSON.parse(req.body.imagesToDelete);
    } else if (Array.isArray(req.body.imagesToDelete)) {
      imagesToDelete = req.body.imagesToDelete;
    }
  } catch {
    console.warn("⚠️ Invalid imagesToDelete format");
  }

  // 🗑️ Delete selected images
  if (imagesToDelete.length > 0) {
    await Promise.allSettled(
      imagesToDelete.map(async (url) => {
        try {
          await fileService.deleteFile(url);
          console.log(`🗑️ Deleted product image: ${url}`);
        } catch (err) {
          console.error(`❌ Failed to delete image ${url}`, err);
        }
      })
    );

    product.images = (product.images || []).filter(
      (url) => !imagesToDelete.includes(url)
    );
  }

  // 📤 Upload new images
  if (req.files && Array.isArray(req.files)) {
    for (const file of req.files.slice(0, 10)) {
      try {
        const safeName = `products/${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;
        const uploadedUrl = await fileService.uploadFile(
          file.path,
          safeName,
          file.mimetype
        );
        newUrls.push(uploadedUrl);
      } catch (err: any) {
        console.error(`❌ Upload failed: ${file.originalname}`, err.message);
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }
    }

    product.images = [...(product.images || []), ...newUrls].slice(0, 10);
  }

  // 🔁 Replace all images (optional)
  const replaceImages =
    req.body.replaceImages === true ||
    req.body.replaceImages === "true";

  if (replaceImages && newUrls.length > 0) {
    for (const oldUrl of product.images || []) {
      if (!newUrls.includes(oldUrl)) {
        try {
          await fileService.deleteFile(oldUrl);
        } catch (err) {
          console.error("❌ Failed to delete old image on replace", err);
        }
      }
    }
    product.images = newUrls;
  }

  // ✍️ Apply remaining fields
  const fields = [
    "name",
    "slug",
    "description",
    "price",
    "currency",
    "stockQty",
    "isActive",
    "categoryId",
    "metadata",
  ];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      (product as any)[field] = req.body[field];
    }
  }

  await product.save();

  res.json({
    success: true,
    message: req.t("PRODUCT_UPDATED") || "Product updated",
    data: product,
  });
});

/**
 * Admin: delete product (soft delete via isActive=false OR hard delete)
 * For v1, let's soft delete by default.
 */
export const deactivateProduct = asyncHandler(async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));
  if (!isAdminRole(actor.role)) throw createError(403, req.t("FORBIDDEN"));

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID") || "Invalid product id");
  }

  const product = await Product.findById(id);
  if (!product) throw createError(404, req.t("PRODUCT_NOT_FOUND"));

  await Product.updateOne({ _id: id }, { $set: { isActive: false } });

  res.json({
    success: true,
    message: req.t("PRODUCT_DEACTIVATED") || "Product deactivated",
  });
});

export const activateProduct = asyncHandler(async (req: any, res: Response) => {
  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));
  if (!isAdminRole(actor.role)) throw createError(403, req.t("FORBIDDEN"));

  const { id } = req.params;
  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID") || "Invalid product id");
  }

  const product = await Product.findById(id);
  if (!product) throw createError(404, req.t("PRODUCT_NOT_FOUND"));

  await Product.updateOne({ _id: id }, { $set: { isActive: true } });

  res.json({
    success: true,
    message: req.t("PRODUCT_ACTIVATED") || "Product deactivated",
  });
});


export const deleteProduct = asyncHandler(async (req: any, res: Response) => {
  const { id } = req.params;

  if (!Types.ObjectId.isValid(id)) {
    throw createError(400, req.t("INVALID_PRODUCT_ID"));
  }

  const actor = await UserModel.findById(req.user.id);
  if (!actor) throw createError(401, req.t("UNAUTHORIZED"));
  if (!["admin", "superadmin"].includes(actor.role)) {
    throw createError(403, req.t("FORBIDDEN"));
  }

  const product = await Product.findById(id);
  if (!product) throw createError(404, req.t("PRODUCT_NOT_FOUND"));

  const hasOrders = await orderModel.exists({
    "items.productId": product._id,
  });

  if (hasOrders) {
    throw createError(
      400,
      req.t("PRODUCT_USED_IN_ORDERS") ||
        "Product is used in orders. Please deactivate instead."
    );
  }

  const fileService = new FileService();

  // 🔥 Delete product images from bucket
  if (product.images && product.images.length > 0) {
    await Promise.allSettled(
      product.images.map(async (url) => {
        try {
          await fileService.deleteFile(url);
          console.log(`🗑️ Deleted product image: ${url}`);
        } catch (err: any) {
          console.error(`❌ Failed to delete image ${url}:`, err.message);
        }
      })
    );
  }

  try {
    await product.deleteOne();
  } catch (err: any) {
    console.error("❌ Failed to delete product:", err.message);
    throw createError(500, req.t("DELETE_FAILED") || "Failed to delete product");
  }

  res.json({
    success: true,
    message: req.t("PRODUCT_DELETED") || "Product permanently deleted",
  });
});