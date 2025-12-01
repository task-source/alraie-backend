import mongoose, { Schema, Document, Types } from "mongoose";

export interface IGpsDevice extends Document {
  serialNumber: string;
  ownerId: Types.ObjectId;
  animalId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  isLinked: boolean;
  linkedAt?: Date| null;

  encryptedUsername?: string | null;
  encryptedPassword?: string | null;
  encryptedClientToken?: string | null;
  lastCredsUpdatedAt?: Date | null;

  lastKnownLatitude?: number;
  lastKnownLongitude?: number;
  dataHash?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

const gpsSchema = new Schema<IGpsDevice>(
  {
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    animalId: {
      type: Schema.Types.ObjectId,
      ref: "Animal",
      default: null,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isLinked: {
      type: Boolean,
      default: false,
    },
    linkedAt: { type: Date },

    encryptedUsername: { type: String, default: null },
    encryptedPassword: { type: String, default: null },
    encryptedClientToken: { type: String, default: null },
    lastCredsUpdatedAt: { type: Date, default: null },

    lastKnownLatitude: { type: Number },
    lastKnownLongitude: { type: Number },
    dataHash: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

gpsSchema.index({ serialNumber: 1 }, { unique: true });

export default mongoose.model<IGpsDevice>("GpsDevice", gpsSchema);
