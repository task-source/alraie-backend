import admin from "firebase-admin";
import AlertModel from "../models/alert.model";

export async function initFirebase() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) return;
  if (admin.apps.length) return;
  const raw = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!,
    "base64"
  ).toString("utf8");
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

export async function sendPushToUsers(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, any>
) {
  await initFirebase();
  if (!admin.apps.length) {
    console.warn("Firebase not configured - skipping push send");
    return;
  }

  // TODO: resolve tokens based on userIds from DB
  const tokens: string[] = []; // fill later

  if (!tokens.length) return;

  const messages = tokens.map((token) => ({
    token,
    notification: { title, body },
    data: data || {},
  }));

  try {
    const response = await admin.messaging().sendEach(messages);
    console.log("FCM multicast response:", response);
  } catch (err) {
    console.error("Push send error", err);
  }
}

export async function createAlert(
  accountId: any,
  animalId: any,
  gpsDeviceId: any,
  message: string,
  alertType: string
) {
  try {
    await AlertModel.create({
      accountId,
      animalId,
      gpsDeviceId,
      message,
      alertType,
    });
  } catch (err) {
    console.error("Failed to create alert record", err);
  }
}
