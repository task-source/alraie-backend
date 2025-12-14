// models/order.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export type OrderStatus =
  | "pending"      // created, not yet paid
  | "paid"         // payment succeeded
  | "processing"   // preparing shipment
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded";

export type PaymentMethod =
  | "card"
  | "cod"
  | "paypal"
  | "other";

export interface IOrderItem {
  _id?: Types.ObjectId;
  productId: Types.ObjectId;
  productName: string;
  productImage?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  currency: string;
}

export interface IShippingAddressSnapshot {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
}

export interface IOrder extends Document {
  userId: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  shippingFee: number;
  taxAmount: number;
  total: number;
  currency: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  reservedUntil: Date,
  stockReleased: Boolean,
  paymentMethod: PaymentMethod;
  paymentReference?: string | null;
  shippingAddress: IShippingAddressSnapshot;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    productImage: { type: String },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
  },
  { _id: true }
);

const shippingAddressSchema = new Schema<IShippingAddressSnapshot>(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String },
    country: { type: String, required: true },
    postalCode: { type: String },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded"],
      default: "pending",
    },
    reservedUntil: { type: Date, index: true },
    stockReleased: { type: Boolean, default: false },
    paymentMethod: {
      type: String,
      enum: ["card", "cod", "knet", "paypal", "other"],
      default: "card",
    },
    paymentReference: { type: String, default: null },
    shippingAddress: { type: shippingAddressSchema, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ userId: 1, status: 1 });
export default mongoose.model<IOrder>("Order", orderSchema);
