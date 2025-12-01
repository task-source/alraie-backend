// utils/crypto.ts
import crypto from "crypto";

const ALGO = "aes-256-gcm";

// Must be 32 bytes. We'll derive from hex string in env.
function getKey(): Buffer {
  const secret = process.env.GPS_CRED_SECRET;
  if (!secret) {
    throw new Error("GPS_CRED_SECRET is not set in environment");
  }
  const raw = Buffer.from(secret, "hex");
  if (raw.length !== 32) {
    throw new Error("GPS_CRED_SECRET must be 32 bytes (64 hex chars)");
  }
  return raw;
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12); // recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(payload: string): string {
  const key = getKey();
  const [ivHex, tagHex, encHex] = payload.split(":");
  if (!ivHex || !tagHex || !encHex) {
    throw new Error("Invalid encrypted payload format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
