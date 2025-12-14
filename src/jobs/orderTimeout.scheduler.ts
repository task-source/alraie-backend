import cron from "node-cron";
import { cancelExpiredOrders } from "./orderTimeout.cron";
import { logger } from "../utils/logger";

export const startOrderTimeoutCron = () => {
  cron.schedule("*/5 * * * *", async () => {
    logger.info("⏰ Running order timeout cron");

    try {
      await cancelExpiredOrders();
    } catch (err) {
      logger.error("❌ Order timeout cron failed", { err });
    }
  });

  logger.info("✅ Order timeout cron scheduled (every 5 minutes)");
};
