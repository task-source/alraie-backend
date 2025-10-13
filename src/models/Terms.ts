import mongoose, { Schema, Document } from 'mongoose';

export type Language = 'en' | 'ar';

export interface ITerms extends Document {
  language: Language;
  html: string; // sanitized HTML
  version: number; // increment on update
  active: boolean; // only one active per language
  updatedBy?: string | null; // admin id
  createdAt: Date;
  updatedAt: Date;
}

const termsSchema = new Schema<ITerms>(
  {
    language: { type: String, enum: ['en', 'ar'], required: true },
    html: { type: String, required: true },
    version: { type: Number, required: true, default: 1 },
    active: { type: Boolean, default: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true },
);

// keep at most one active per language (app-level enforcement)
termsSchema.index({ language: 1, version: -1 });

export default mongoose.model<ITerms>('Terms', termsSchema);