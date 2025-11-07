import mongoose, { Schema, Document, Types } from 'mongoose';

export type Category = 'farm' | 'pet';

export interface IBreed extends Document {
  key: string;
  name_en: string;
  name_ar: string;
  animalTypeKey: string;
  animalTypeId?: Types.ObjectId;
  category: Category;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const breedSchema = new Schema<IBreed>(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, immutable: true },
    name_en: { type: String, required: true, trim: true },
    name_ar: { type: String, required: true, trim: true },
    animalTypeKey: { type: String, required: true, trim: true, index: true },
    animalTypeId: { type: Schema.Types.ObjectId, ref: 'AnimalType' },
    category: { type: String, enum: ['farm', 'pet'], required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

breedSchema.index({ key: 1 });
breedSchema.index({ name_en: 'text', name_ar: 'text', animalTypeKey: 1 });


breedSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  try {
    const breedDoc = this as IBreed;
    if (!breedDoc?.key) return next();

    await mongoose.model('Animal').updateMany(
      { $or: [{ breedKey: breedDoc.key }, { breedId: breedDoc._id }] },
      { $unset: { breedKey: "", breedNameEn: "", breedNameAr: "", breedId: "" } },
    );

    next();
  } catch (err:any) {
    console.error('🐪 Error cleaning up animals on breed delete:', err);
    next(err);
  }
});

export default mongoose.model<IBreed>('Breed', breedSchema);
