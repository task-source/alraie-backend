import mongoose, { Schema, Document, Types } from "mongoose";
import { AnimalType } from "./user";

export type Gender = "male" | "female" | "unknown";
export type Status = "active" | "sold" | "dead" | "transferred";
export type ReproductiveStatus = "pregnant" | "nursing mother" | "other";
export type Purpose = "race" | "production"| "beauty"| "surrogate" | "other";

export interface IRelation {
  relation: "father" | "mother" | "sibling";
  animalId: Types.ObjectId | null;
  uniqueAnimalId?: string;
  name?: string;
}

export interface IAnimal extends Document {
  ownerId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  typeId: Types.ObjectId;     // ref to AnimalType
  typeKey?: string;          // convenience
  typeNameEn?: string;
  typeNameAr?: string;
  breedId?: Types.ObjectId;  
  breedKey?: string;
  breedNameEn?: string;
  breedNameAr?: string;
  uniqueAnimalId: string;    // auto-generated
  profilePicture?: string;   // URL
  images: string[];
  name?: string;
  gender?: Gender;
  dob?: Date;
  animalStatus?: Status;
  country?: string;
  fatherName?: string;
  motherName?: string;
  relations?: IRelation[];
  hasVaccinated?: boolean;
  reproductiveStatus?: ReproductiveStatus;
  purpose?: Purpose;
  tagId?: string;
  category?: AnimalType;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const relationSchema = new Schema(
  {
    relation: { type: String, enum: ["father", "mother", "sibling"], required: true },
    animalId: { type: Schema.Types.ObjectId, ref: "Animal", required: true },
    uniqueAnimalId: { type: String },
    name: { type: String },
  },
  { _id: false }
);

const MAX_IMAGES = 6;

const animalSchema = new Schema<IAnimal>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },

    typeId: { type: Schema.Types.ObjectId, ref: "AnimalType", required: true, index: true },
    typeKey: { type: String }, // denormalized key
    typeNameEn: { type: String },
    typeNameAr: { type: String },

    breedId: { type: Schema.Types.ObjectId, ref: "Breed" },
    breedKey: { type: String },
    breedNameEn: { type: String },
    breedNameAr: { type: String },

    uniqueAnimalId: { type: String, required: true, unique: true, index: true }, // AN-...
    profilePicture: { type: String },
    images: {
      type: [String],
      validate: [
        {
          validator: (arr: string[]) => arr.length <= MAX_IMAGES,
          message: `Maximum ${MAX_IMAGES} images allowed`,
        },
      ],
      default: [],
    },
    name: { type: String, index: true },
    gender: { type: String, enum: ["male", "female", "unknown"], default: "unknown" },
    dob: { type: Date },
    animalStatus: { type: String, enum: ["active", "sold", "dead", "transferred"], default: "active" },
    country: { type: String },
    fatherName: { type: String },
    motherName: { type: String },
    relations: { type: [relationSchema], default: [] },

    hasVaccinated: { type: Boolean, default: false },
    reproductiveStatus: { type: String, enum: ["pregnant" , "nursing mother" , "other"], default: "other" },
    purpose: { type: String, enum: ["race" , "production", "beauty", "surrogate" , "other"], default: "other" },

    category:{ type: String, enum: ['farm', 'pet'] },
    tagId: { type: String, sparse: true }, // not globally unique
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// unique tag per owner (sparse: only when tagId exists)
animalSchema.index(
  { ownerId: 1, tagId: 1 },
  {
    unique: true,
    partialFilterExpression: { tagId: { $exists: true, $type: "string" } },
  }
);

// Hooks: placeholder to cleanup related resources when animal deleted (extend as needed)
animalSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    try {
      const animalId = this._id;

    
      await mongoose.model("Geofence").updateMany(
        { animals: animalId },        
        { $pull: { animals: animalId } } 
      );

      next();
    } catch (err: any) {
      next(err);
    }
  }
);

export default mongoose.model<IAnimal>("Animal", animalSchema);
