import axios from "axios";

const PROD_URL = "https://buy.itunes.apple.com/verifyReceipt";
const SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

export interface AppleReceiptResult {
  valid: boolean;
  expiresAt?: Date;
  productId?: string;
  isTrial?: boolean;
  raw?: any;
}

export async function verifyAppleReceipt(
  receiptData: string
): Promise<AppleReceiptResult> {
  const payload = {
    "receipt-data": receiptData,
    password: process.env.APPLE_SHARED_SECRET,
    "exclude-old-transactions": true,
  };

  const post = (url: string) =>
    axios.post(url, payload, { timeout: 10000 });

  let response = await post(PROD_URL);

  if (response.data.status === 21007) {
    response = await post(SANDBOX_URL);
  }

  const data = response.data;

  if (data.status !== 0) {
    return { valid: false, raw: data };
  }

  const latest = data.latest_receipt_info?.[0];
  if (!latest) return { valid: false };

  const expiresMs = Number(latest.expires_date_ms);

  return {
    valid: expiresMs > Date.now(),
    expiresAt: new Date(expiresMs),
    productId: latest.product_id,
    isTrial: latest.is_trial_period === "true",
    raw: latest,
  };
}
