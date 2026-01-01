import PendingDowngrade from "../models/pendingDowngrade.model";
import UserSubscription from "../models/userSubscription.model";
import SubscriptionPlan from "../models/subscriptionPlan.model";
import Animal from "../models/animal.model";
import User from "../models/user";
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
      expiresAt.setMonth(expiresAt.getMonth() + 1);

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

    
      const animals = await Animal.find({ ownerId: locked.ownerId })
        .sort({ createdAt: -1 });

      if (animals.length > plan.maxAnimals) {
        const overflow = animals.slice(plan.maxAnimals);
        await Animal.updateMany(
          { _id: { $in: overflow.map(a => a._id) } },
          { $set: { animalStatus: "inactive" } }
        );
      }


      const assistants = await User.find({
        ownerId: locked.ownerId,
        role: "assistant",
      }).sort({ createdAt: -1 });

      if (assistants.length > plan.maxAssistants) {
        const overflow = assistants.slice(plan.maxAssistants);

        await User.updateMany(
          { _id: { $in: overflow.map(a => a._id) } },
          { $set: { role: "disabled" } } // logical disable
        );
      }

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
