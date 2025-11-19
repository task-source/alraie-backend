import mongoose, { Schema, Document } from "mongoose";

export interface ICounter extends Document {
  key: string;
  value: number;
}

const counterSchema = new Schema<ICounter>({
  key: { type: String, required: true, unique: true },
  value: { type: Number, required: true, default: 0 }, // start at 0 ⇒ next becomes 1
});

export default mongoose.model<ICounter>("Counter", counterSchema);
