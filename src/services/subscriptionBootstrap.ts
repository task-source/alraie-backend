import { Types } from "mongoose";
import UserSubscription from "../models/userSubscription.model";

export async function assignFreeTrial(ownerId: string) {
    if (!Types.ObjectId.isValid(ownerId)) return;
  
    const existing = await UserSubscription.findOne({
      ownerId,
      status: "active",
    });
  
    if (existing) return; 
  
  const now = new Date();
  const trialEnd = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

  await UserSubscription.create({
    ownerId,
    planKey: "basic",
    cycle: "monthly",
    startedAt: now,
    expiresAt: trialEnd,
    isTrial: true,
    trialEndsAt: trialEnd,
    source: "admin",
    status: "active",
  });
}
