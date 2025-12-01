import mongoose, { Schema, Document, Types } from 'mongoose';

export type AlertType =
  | 'ANIMAL_IN'
  | 'ANIMAL_OUT'
  | 'ANIMAL_UNLINKED'
  | 'LOW_BATTERY'
  | 'DEVICE_LED_OFF'
  | 'DEVICE_IDLE';

export interface IAlert extends Document {
  accountId: Types.ObjectId; // owner
  animalId?: Types.ObjectId | null;
  gpsDeviceId?: Types.ObjectId | null;
  message: string;
  alertType: AlertType | string;
  acknowledged?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const alertSchema = new Schema<IAlert>({
  accountId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  animalId: { type: Schema.Types.ObjectId, ref: 'Animal', default: null },
  gpsDeviceId: { type: Schema.Types.ObjectId, ref: 'GpsDevice', default: null },
  message: { type: String, required: true },
  alertType: { type: String, required: true },
  acknowledged: { type: Boolean, default: false },
}, { timestamps: true });

alertSchema.index({ accountId: 1, alertType: 1, createdAt: -1 });

export default mongoose.model<IAlert>('Alert', alertSchema);
