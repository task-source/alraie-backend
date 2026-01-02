import { Schema, model, Types } from "mongoose";

export type DeletionTarget = "animal" | "assistant";

const deletionJobSchema = new Schema(
  {
    ownerId: { type: Types.ObjectId, required: true, index: true },
    target: {
      type: String,
      enum: ["animal", "assistant"],
      required: true,
    },
    keep: { type: Number, required: true }, // max allowed
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    lastProcessedId: { type: Types.ObjectId, default: null },
    error: { type: String },
  },
  { timestamps: true }
);

deletionJobSchema.index({ ownerId: 1, target: 1, status: 1 });
export default model("DeletionJob", deletionJobSchema);
