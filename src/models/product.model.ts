// models/product.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IProduct extends Document {
  name: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;          // price in product.currency
  currency: string;       // e.g. "AED", "USD", "INR"
  stockQty: number;       // integer, >=0
  isActive: boolean;
  categoryId?: Types.ObjectId | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const MAX_IMAGES = 10;

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    description: { type: String, default: "" },
    images: {
      type: [String],
      default: [],
      validate: [
        {
          validator: (arr: string[]) => arr.length <= MAX_IMAGES,
          message: `Maximum ${MAX_IMAGES} images allowed`,
        },
      ],
    },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "AED", trim: true },
    stockQty: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory", default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ name: "text", description: "text" });
productSchema.index({ isActive: 1, createdAt: -1 });

export default mongoose.model<IProduct>("Product", productSchema);
