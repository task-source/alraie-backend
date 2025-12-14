// models/productCategory.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IProductCategory extends Document {
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

const productCategorySchema = new Schema<IProductCategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productCategorySchema.index({ slug: 1 }, { unique: true });
productCategorySchema.index({ isActive: 1, sortOrder: 1 });

export default mongoose.model<IProductCategory>(
  "ProductCategory",
  productCategorySchema
);
