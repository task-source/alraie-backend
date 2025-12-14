// models/address.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAddress extends Document {
  userId: Types.ObjectId;
  label?: string;      // "Home", "Farm", "Office" etc
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IAddress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "" },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String },
    city: { type: String, required: true, trim: true },
    state: { type: String },
    country: { type: String, required: true, trim: true },
    postalCode: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

addressSchema.index({ userId: 1, isDefault: 1 });

export default mongoose.model<IAddress>("Address", addressSchema);
