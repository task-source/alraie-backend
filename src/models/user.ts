import mongoose, { Schema, Document, Types } from 'mongoose';

export type UserRole = 'assistant' | 'owner' | 'admin' | 'superadmin';
export type Gender = 'male' | 'female' | 'unknown';
export type AnimalType = 'farm' | 'pet';
export type Language = 'en' | 'ar';

export interface IUser {
  name?: string;
  gender?: Gender;
  email?: string;
  phone?: string;
  profileImage?: string;      
  country?: string;    
  preferredCurrency?: string;
  countryCode?: string; 
  fullPhone?: string; 
  password?: string;
  role: UserRole;
  animalType: AnimalType;
  language: Language;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  passwordResetVerified?: boolean;
  otp?: string;
  otpExpiresAt?: Date;
  refreshToken?: string;
  ownerId?: Types.ObjectId | null; // only for assistants
  assistantIds?: Types.ObjectId[]; // only for owners
  createdAt: Date;
  updatedAt: Date;
}

// Add _id typing here
export interface IUserDocument extends IUser, Document {
  _id: Types.ObjectId; 
}

const userSchema = new Schema<IUserDocument>(
  {
    name: { type: String, trim: true },
    gender: { type: String, enum: ['male', 'female', 'unknown'], default: 'unknown' },
    email: { type: String, lowercase: true, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    countryCode: { type: String, trim: true },
    fullPhone: { type: String, unique: true, sparse: true },
    password: { type: String },
    role: { type: String, enum: ['assistant', 'owner', 'admin', 'superadmin'], default: 'owner' },
    animalType: { type: String, enum: ['farm', 'pet'] },
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    otp: { type: String },
    otpExpiresAt: { type: Date },
    refreshToken: { type: String },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // for assistant
    assistantIds: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }], // for owner
    profileImage: { type: String, trim: true },
    country: { type: String, trim: true },
    preferredCurrency: { type: String, trim: true },
    passwordResetVerified: { type: Boolean, default: false },
  },
  { timestamps: true },
);

//
// --- Indexes ---
//
userSchema.index({ role: 1 });
userSchema.index({ ownerId: 1 });
userSchema.index({ email: 1, phone: 1 });
userSchema.index({ fullPhone: 1 });

userSchema.pre("findOneAndDelete", async function (next) {
  const query = this.getQuery();
  const owner = await mongoose.model("User").findOne(query);
  if (!owner) return next();

  const FileService = require("../services/fileService").FileService;
  const fileService = new FileService();

  // ----------------------------------
  // Delete user's own profile image
  // ----------------------------------
  if (owner.profileImage) {
    try {
      await fileService.deleteFile(owner.profileImage);
      console.log("🗑️ Deleted user profile image");
    } catch (err) {
      console.error("❌ Failed to delete user profile image:", err);
    }
  }

  // ----------------------------------
  // OWNER CASCADE DELETE
  // ----------------------------------
  if (owner.role === "owner") {
    const ownerId = owner._id;
    const assistants = await mongoose
      .model("User")
      .find({ ownerId })
      .select("profileImage")
      .lean();

    for (const a of assistants) {
      if (a.profileImage) {
        try {
          await fileService.deleteFile(a.profileImage);
        } catch (err) {
          console.error("❌ Failed to delete assistant profile image:", err);
        }
      }
    }

    // Delete assistants
    await mongoose.model("User").deleteMany({ ownerId });

    // Delete animals
    await mongoose.model("AnimalReport").deleteMany({ ownerId });
    await mongoose.model("Animal").deleteMany({ ownerId });
    await mongoose.model("Geofence").deleteMany({ ownerId }); 
  }

  next();
});

userSchema.pre('save', async function (next) {

  if (this.phone && this.countryCode) {
    this.fullPhone = `${this.countryCode}${this.phone}`.replace(/\s+/g, '');
  } else {
    this.fullPhone = undefined;
  }

  if (this.role === 'assistant' && !this.ownerId) {
    return next(new Error('Assistant must have an ownerId assigned.'));
  }

  // If user is owner → clear any existing ownerId to avoid confusion
  if (this.role === 'owner' && this.ownerId) {
    this.ownerId = null;
  }

  next();
});

userSchema.post('save', async function (doc) {
  const User = mongoose.model<IUserDocument>('User');

  try {
    // If this user is assistant → add them to their owner's assistantIds list if not already added
    if (doc.role === 'assistant' && doc.ownerId) {
      await User.updateOne({ _id: doc.ownerId }, { $addToSet: { assistantIds: doc._id } });
    }

    // If this user is owner → ensure all its assistants reference this ownerId
    if (doc.role === 'owner' && Array.isArray(doc.assistantIds) && doc.assistantIds.length > 0) {
      await User.updateMany({ _id: { $in: doc.assistantIds } }, { $set: { ownerId: doc._id } });
    }
  } catch (err) {
    console.error('Relationship sync failed:', err);
  }
});

userSchema.virtual('owner', {
  ref: 'User',
  localField: 'ownerId',
  foreignField: '_id',
  justOne: true,
});

userSchema.virtual('assistants', {
  ref: 'User',
  localField: 'assistantIds',
  foreignField: '_id',
});

userSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    const defaultFields = {
      _id: null,
      name: null,
      gender: null,
      email: null,
      phone: null,
      countryCode: null,
      fullPhone: null,
      role: null,
      animalType: null,
      language: null,
      isEmailVerified: null,
      isPhoneVerified: null,
      ownerId: null,
      profileImage: null,
      country: null,
      preferredCurrency: null,
      assistantIds: [],
      createdAt: null,
      updatedAt: null,

      // MUST NEVER EXPOSE: but set null so key exists
      password: null,
      passwordResetVerified: null,
      otp: null,
      otpExpiresAt: null,
      refreshToken: null,
      __v: null,
    };

    for (const key of Object.keys(defaultFields) as (keyof typeof defaultFields)[]) {
      if (ret[key] === undefined) {
        //@ts-ignore
        ret[key] = defaultFields[key];
      }
    }

    // Remove sensitive fields (value is already null)
    delete ret.password;
    delete ret.passwordResetVerified;
    delete ret.otp;
    delete ret.otpExpiresAt;
    delete ret.refreshToken;
    delete ret.__v;

    return ret;
  }
});

export default mongoose.model<IUserDocument>('User', userSchema);