import mongoose, { Schema, Document } from 'mongoose';

export interface IAnimalType extends Document {
  name_en: string;
  name_ar: string;
  key:string;
  category: 'farm' | 'pet';
  createdAt: Date;
  updatedAt: Date;
}

const animalTypeSchema = new Schema<IAnimalType>(
  {
    name_en: {
      type: String,
      required: [true, 'English name is required'],
      trim: true,
    },
    name_ar: {
      type: String,
      required: [true, 'Arabic name is required'],
      trim: true,
    },
    key: {
        type: String,
        required: [true, 'key is required'],
        trim: true,
        unique:true,
        lowercase: true,
        immutable: true,
    },
    category: {
      type: String,
      enum: ['farm', 'pet'],
      required: [true, 'Category is required'],
    },
  },
  { timestamps: true },
);

export const AnimalType = mongoose.model<IAnimalType>('AnimalType', animalTypeSchema);