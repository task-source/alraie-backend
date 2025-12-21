import mongoose, { Schema, Document, Types } from "mongoose";
import { AnimalType } from "./user";

export type Gender = "male" | "female" | "unknown";
export type Status = "active" | "sold" | "dead" | "lost";
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
  gpsDeviceId?: Types.ObjectId | null;
  reportId?: Types.ObjectId | null;
  gpsSerialNumber?: string | null;
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
    gpsDeviceId: { type: Schema.Types.ObjectId, ref: "GpsDevice", default: null },
    reportId: { type: Schema.Types.ObjectId, ref: "AnimalReport", default: null },
    gpsSerialNumber: { type: String, default: null },
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
    animalStatus: { type: String, enum: ["active", "sold", "dead", "lost"], default: "active" },
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

animalSchema.index({ gpsDeviceId: 1 });
animalSchema.index({ gpsSerialNumber: 1 });
animalSchema.index({ reportId: 1 });

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

      await mongoose.model("AnimalReport").deleteOne({ animalId });

      next();
    } catch (err: any) {
      next(err);
    }
  }
);

animalSchema.post("save", async function () {
  if (this.isModified("hasVaccinated")) {
    await mongoose.model("AnimalReport").updateOne(
      { animalId: this._id },
      { $set: { vaccinated: this.hasVaccinated } }
    );
  }
});

animalSchema.set("toJSON", {
  virtuals: true,
  transform: (_doc, ret) => {
    const defaultFields = {
      ownerId: null,
      createdBy: null,
      typeId: null,
      gpsDeviceId: null,
      gpsSerialNumber: null,
      reportId: null,
      typeKey: null,
      typeNameEn: null,
      typeNameAr: null,
      breedId: null,
      breedKey: null,
      breedNameEn: null,
      breedNameAr: null,
      uniqueAnimalId: null,
      profilePicture: null,
      images: [],
      name: null,
      gender: null,
      dob: null,
      animalStatus: null,
      country: null,
      fatherName: null,
      motherName: null,
      relations: [],
      hasVaccinated: null,
      reproductiveStatus: null,
      purpose: null,
      tagId: null,
      category: null,
      metadata: null,
      createdAt: null,
      updatedAt: null,
    };

    // Fill missing keys with null
    for (const key of Object.keys(defaultFields) as (keyof typeof defaultFields)[]) {
      if (ret[key] === undefined) {
        //@ts-ignore 
        ret[key] = defaultFields[key];
      }
    }

    return ret;
  },
});

export default mongoose.model<IAnimal>("Animal", animalSchema);
