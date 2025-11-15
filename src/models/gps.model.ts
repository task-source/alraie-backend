import mongoose, { Schema, Document, Types } from "mongoose";

export interface IGpsDevice extends Document {
  serialNumber: string;
  ownerId: Types.ObjectId;
  animalId?: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  isLinked: boolean;
  linkedAt?: Date| null;
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
    },
    animalId: {
      type: Schema.Types.ObjectId,
      ref: "Animal",
      default: null,
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
  },
  { timestamps: true }
);

gpsSchema.index({ serialNumber: 1 });

export default mongoose.model<IGpsDevice>("GpsDevice", gpsSchema);
