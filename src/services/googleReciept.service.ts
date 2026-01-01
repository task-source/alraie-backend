import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/androidpublisher"];

function getAuthClient() {
  const raw = Buffer.from(
    process.env.GOOGLE_SERVICE_ACCOUNT_BASE64!,
    "base64"
  ).toString("utf8");

  const credentials = JSON.parse(raw);

  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  });
}

export interface GoogleReceiptResult {
  valid: boolean;
  expiresAt?: Date;
  productId?: string;
  isTrial?: boolean;
  raw?: any;
}

export async function verifyGoogleSubscription(
  purchaseToken: string,
  productId: string
): Promise<GoogleReceiptResult> {
  const auth = getAuthClient();
  const androidPublisher = google.androidpublisher({
    version: "v3",
    auth,
  });

  const res =
    await androidPublisher.purchases.subscriptions.get({
      packageName: process.env.GOOGLE_PACKAGE_NAME!,
      subscriptionId: productId,
      token: purchaseToken,
    });

  const data = res.data;

  if (!data || data.paymentState !== 1) {
    return { valid: false, raw: data };
  }

  return {
    valid: Number(data.expiryTimeMillis) > Date.now(),
    expiresAt: new Date(Number(data.expiryTimeMillis)),
    productId,
    isTrial: data.introductoryPriceInfo !== undefined,
    raw: data,
  };
}
