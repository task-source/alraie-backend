import PendingDowngrade from "../models/pendingDowngrade.model";
import UserSubscription from "../models/userSubscription.model";
import SubscriptionPlan from "../models/subscriptionPlan.model";
import deletionJobModel from "../models/deletionJob.model";
import { logger } from "../utils/logger";

export async function processDowngrades() {
  const now = new Date();

  const downgrades = await PendingDowngrade.find({ effectiveAt: { $lte: now } });

  for (const downgrade of downgrades) {
    try {
      const locked = await PendingDowngrade.findOneAndDelete({
        _id: downgrade._id,
        effectiveAt: downgrade.effectiveAt,
      });

      if (!locked) continue; 

      const active = await UserSubscription.findOne({
        ownerId: locked.ownerId,
        status: "active",
      });

      if (!active) {
        logger.info(
          `Downgrade removed — no active subscription for owner ${locked.ownerId}`
        );
        continue;
      }

      const plan = await SubscriptionPlan.findOne({
        planKey: locked.targetPlanKey,
        isActive: true,
      });

      if (!plan) {
        logger.warn(
          `Downgrade skipped: invalid plan ${locked.targetPlanKey}`
        );
        continue;
      }


      await UserSubscription.updateMany(
        { ownerId: locked.ownerId, status: "active" },
        { $set: { status: "expired" } }
      );


      const expiresAt = new Date();
      if (locked.targetCycle === "yearly") {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
      }

    await UserSubscription.create({
      ownerId: locked.ownerId,
      planKey: plan.planKey,
      cycle: locked.targetCycle,
      priceSnapshot: {
        amount: 0,
        currency: "N/A",
        platform: "admin",
      },
      startedAt: new Date(),
      expiresAt,
      status: "active",
      isTrial: false,
      source: "admin",
    });

        await deletionJobModel.deleteMany({
        ownerId: locked.ownerId,
        status: { $in: ["pending", "processing"] },
      });

      await deletionJobModel.create([
        {
          ownerId: locked.ownerId,
          target: "animal",
          keep: plan.maxAnimals,
        },
        {
          ownerId: locked.ownerId,
          target: "assistant",
          keep: plan.maxAssistants,
        },
      ]);

      logger.info(
        `Downgrade processed for owner ${locked.ownerId.toString()}`
      );
    } catch (err) {
      logger.error(
        `Failed to process downgrade for ${downgrade.ownerId}`,
        err
      );
    }
  }
}
