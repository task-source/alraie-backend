import mongoose, { Schema, Document } from "mongoose";

export interface IDeletedUser extends Document {
  userId: mongoose.Types.ObjectId;
  role: string;

  // snapshot of user data
  name?: string;
  email?: string;
  phone?: string;
  fullPhone?: string;
  country?: string;
  preferredCurrency?: string;
  animalType?: string;
  language?: string;

  // deletion metadata
  deletionReason: string;
  deletedBy?: mongoose.Types.ObjectId; // admin / self
  deletedAt: Date;
}

const deletedUserSchema = new Schema<IDeletedUser>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: { type: String, required: true },

    name: { type: String },
    email: { type: String },
    phone: { type: String },
    fullPhone: { type: String },
    country: { type: String },
    preferredCurrency: { type: String },
    animalType: { type: String },
    language: { type: String },

    deletionReason: { type: String, required: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

deletedUserSchema.index({ deletedAt: -1 });
deletedUserSchema.index({ role: 1 });

export default mongoose.model<IDeletedUser>(
  "DeletedUser",
  deletedUserSchema,
);
    