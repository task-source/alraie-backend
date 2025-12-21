import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAnimalReport extends Document {
  animalId: Types.ObjectId;
  ownerId: Types.ObjectId;

  temperature?: number;
  heartRate?: number;
  weight?: number;
  disease?: string;
  allergy?: string;
  vaccinated?: boolean;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}

const animalReportSchema = new Schema<IAnimalReport>(
  {
    animalId: {
      type: Schema.Types.ObjectId,
      ref: "Animal",
      required: true,
      unique: true, // 🔒 ONE report per animal
      index: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    temperature: { type: Number },
    heartRate: { type: Number },
    weight: { type: Number },
    disease: { type: String, trim: true },
    allergy: { type: String, trim: true },
    vaccinated: { type: Boolean },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

/**
 * REPORT → ANIMAL sync (vaccinated)
 */
animalReportSchema.post("save", async function () {
  if (this.vaccinated !== undefined) {
    await mongoose.model("Animal").updateOne(
      { _id: this.animalId },
      { $set: { hasVaccinated: this.vaccinated } }
    );
  }
});

export default mongoose.model<IAnimalReport>(
  "AnimalReport",
  animalReportSchema
);
