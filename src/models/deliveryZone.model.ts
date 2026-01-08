import mongoose, { Schema, Document } from "mongoose";

export interface IDeliveryZone extends Document {
  country: string;            // ISO code: IN, AE
  state?: string;             // optional
  city?: string;              // optional

  currency: string;           // INR, AED
  deliveryFee: number;        // flat fee
  taxPercent: number;         // 0–100

  deliveryTimeMin?: number;   // days
  deliveryTimeMax?: number;   // days

  isActive: boolean;
  priority: number;

  createdAt: Date;
  updatedAt: Date;
}

const deliveryZoneSchema = new Schema<IDeliveryZone>(
  {
    country: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },

    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
    },

    taxPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    deliveryTimeMin: {
      type: Number,
      min: 0,
    },

    deliveryTimeMax: {
      type: Number,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    priority: {
      type: Number,
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * Priority:
 * 3 → city
 * 2 → state
 * 1 → country
 */
deliveryZoneSchema.pre("save", function (next) {
  if (this.city) this.priority = 3;
  else if (this.state) this.priority = 2;
  else this.priority = 1;
  next();
});

deliveryZoneSchema.index(
  { country: 1, state: 1, city: 1 },
  { unique: true }
);

export default mongoose.model<IDeliveryZone>(
  "DeliveryZone",
  deliveryZoneSchema
);
