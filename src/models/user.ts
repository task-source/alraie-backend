import mongoose, { Schema, Document, Types } from 'mongoose';

export type UserRole = 'assistant' | 'owner' | 'admin' | 'superadmin';
export type AnimalType = 'farm' | 'pet';
export type Language = 'en' | 'ar';

export interface IUser {
  email?: string;
  phone?: string;
  password?: string;
  role: UserRole;
  animalType: AnimalType;
  language: Language;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  otp?: string;
  otpExpiresAt?: Date;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Add _id typing here
export interface IUserDocument extends IUser, Document {
  _id: Types.ObjectId; 
}

const userSchema = new Schema<IUserDocument>(
  {
    email: { type: String, lowercase: true, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    password: { type: String },
    role: { type: String, enum: ['assistant', 'owner', 'admin', 'superadmin'], default: 'owner' },
    animalType: { type: String, enum: ['farm', 'pet'] },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpiresAt: { type: Date },
    refreshToken: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model<IUserDocument>('User', userSchema);