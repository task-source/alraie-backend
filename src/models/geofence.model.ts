import mongoose, { Schema, Types, Document } from "mongoose";

export interface IGeofence extends Document {
  name: string;
  ownerId: Types.ObjectId;
  createdBy: Types.ObjectId;
  center: { lat: number; lng: number };
  radiusKm: number;
  animals: Types.ObjectId[]; 
  createdAt: Date;
  updatedAt: Date;
}

const geofenceSchema = new Schema<IGeofence>(
  {
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    center: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    radiusKm: { type: Number, required: true, min: 0.1 },
    animals: [{ type: Schema.Types.ObjectId, ref: "Animal" }],
  },
  { timestamps: true }
);

geofenceSchema.index({ animals: 1 });

// Remove geofences when owner removed
geofenceSchema.pre("deleteMany", async function (next) {
  const query = this.getQuery();
  if (query.ownerId) {
    await mongoose.model("Geofence").deleteMany({ ownerId: query.ownerId });
  }
  next();
});

// When animal deleted → remove from geofences
mongoose.model("Animal").watch().on("change", async (change) => {
  if (change.operationType === "delete") {
    const animalId = change.documentKey._id;
    await mongoose.model("Geofence").updateMany(
      {},
      { $pull: { animals: animalId } }
    );
  }
});

export default mongoose.model<IGeofence>("Geofence", geofenceSchema);
