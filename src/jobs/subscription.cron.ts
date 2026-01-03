import cron from "node-cron";
import { processDowngrades } from "../jobs/subscriptionDowngrade.cron";
import { processDeletionJobs } from "../jobs/deletionWorker";
import { logger } from "../utils/logger";

let downgradeRunning = false;
let deletionRunning = false;

export function startSubscriptionCron() {
  cron.schedule("*/10 * * * *", async () => {
    if (downgradeRunning) {
      logger.warn("⏭️ Downgrade cron skipped (already running)");
      return;
    }
    downgradeRunning = true;
    logger.info("🔁 Subscription downgrade cron started");
    try {
    await processDowngrades();
    } catch (err) {
      logger.error("❌ Subscription downgrade cron failed", err);
    } finally {
      downgradeRunning = false;
    }
  });

  cron.schedule("*/5 * * * *", async () => {
    if (deletionRunning) {
      logger.warn("⏭️ Deletion cron skipped (already running)");
      return;
    }

    deletionRunning = true;
    logger.info("🧹 Background deletion worker started");

    try {
      await processDeletionJobs();
    } catch (err) {
      logger.error("❌ Deletion cron failed", err);
    } finally {
      deletionRunning = false;
    }
  });
}
