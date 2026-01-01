// models/pendingDowngrade.model.ts
import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPendingDowngrade extends Document {
  ownerId: Types.ObjectId;
  targetPlanKey: string;
  targetCycle: "monthly" | "yearly";
  effectiveAt: Date;
}

const schema = new Schema<IPendingDowngrade>({
  ownerId: { type: Schema.Types.ObjectId, ref: "User", unique: true },
  targetPlanKey: String,
  targetCycle: String,
  effectiveAt: Date,
});

export default mongoose.model<IPendingDowngrade>("PendingDowngrade", schema);
