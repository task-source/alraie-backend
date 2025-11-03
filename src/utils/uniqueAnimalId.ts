import shortid from "shortid";
import { Types } from "mongoose";

/**
 * Generate unique animal id: AN-{ownerShort}-{YYYYMMDD}-{4chars}
 * ownerShort: first 4 chars of owner._id (or 'OWN' fallback)
 */
export const generateUniqueAnimalId = (ownerId?: string) => {
  const ownerShort = ownerId ? ownerId.toString().slice(-6) : "OWN";
  const date = new Date();
  const yyyy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const rand = shortid.generate().slice(0, 4);
  return `AN-${ownerShort}-${yyyy}${mm}${dd}-${rand}`.toUpperCase();
};
