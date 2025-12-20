import mongoose, { Schema, Document } from 'mongoose';

export type Language = 'en' | 'ar';

export interface IAboutUs extends Document {
  language: Language;
  html: string;          // sanitized HTML
  version: number;       // increment on update
  active: boolean;       // only one active per language
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const aboutUsSchema = new Schema<IAboutUs>(
  {
    language: { type: String, enum: ['en', 'ar'], required: true },
    html: { type: String, required: true },
    version: { type: Number, default: 1 },
    active: { type: Boolean, default: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// keep versions ordered per language
aboutUsSchema.index({ language: 1, version: -1 });

export default mongoose.model<IAboutUs>('AboutUs', aboutUsSchema);
