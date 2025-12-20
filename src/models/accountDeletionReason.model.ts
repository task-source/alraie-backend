import mongoose, { Schema, Document } from 'mongoose';

export type Language = 'en' | 'ar';

export interface IAccountDeletionReason extends Document {
  language: Language;
  text: string;     // plain string only
  active: boolean;  // admin can enable/disable
  createdAt: Date;
  updatedAt: Date;
}

const accountDeletionReasonSchema = new Schema<IAccountDeletionReason>(
  {
    language: { type: String, enum: ['en', 'ar'], required: true },
    text: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

accountDeletionReasonSchema.index({ language: 1, active: 1 });

export default mongoose.model<IAccountDeletionReason>(
  'AccountDeletionReason',
  accountDeletionReasonSchema,
);
