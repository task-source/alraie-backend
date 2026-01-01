import cron from "node-cron";
import { processDowngrades } from "../jobs/subscriptionDowngrade.cron";
import { logger } from "../utils/logger";

export function startSubscriptionCron() {
  cron.schedule("*/10 * * * *", async () => {
    logger.info("🔁 Subscription downgrade cron started");
    try {
    await processDowngrades();
    } catch (err) {
      logger.error("❌ Subscription downgrade cron failed", err);
    }
  });
}
