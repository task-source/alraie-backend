import mongoose, { Schema, Document, Types } from "mongoose";

export interface IContactUs extends Document {
  userId?: Types.ObjectId | null;
  name: string;
  email?: string;
  phone?: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactUsSchema = new Schema<IContactUs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },

    name: { type: String, required: true, trim: true },

    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },

    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

contactUsSchema.index({ email: 1 });
contactUsSchema.index({ phone: 1 });
contactUsSchema.index({ createdAt: -1 });

contactUsSchema.pre("validate", function (next) {
  if (!this.email && !this.phone) {
    next(new Error("Email or phone is required"));
  } else {
    next();
  }
});

export default mongoose.model<IContactUs>("ContactUs", contactUsSchema);
