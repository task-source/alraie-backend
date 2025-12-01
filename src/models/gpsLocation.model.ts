import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGpsLocation extends Document {
  gpsDeviceId: Types.ObjectId;
  serialNumber: string;
  latitude: number;
  longitude: number;
  raw: Record<string, any>;
  trackedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const gpsLocationSchema = new Schema<IGpsLocation>({
  gpsDeviceId: { type: Schema.Types.ObjectId, ref: 'GpsDevice', required: true, index: true },
  serialNumber: { type: String, required: true, index: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  raw: { type: Schema.Types.Mixed, default: {} },
  trackedAt: { type: Date, required: true, index: true },
}, { timestamps: true });

gpsLocationSchema.index({ gpsDeviceId: 1, trackedAt: -1 });

export default mongoose.model<IGpsLocation>('GpsLocation', gpsLocationSchema);
