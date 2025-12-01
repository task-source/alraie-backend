
import { runTrackingPass } from "../services/tracking.service";
import { logger } from "../utils/logger";

let isRunning = false;
let lastRunStartedAt: Date | null = null;

export function startTrackingRealtime() {
  const intervalMs = Number(process.env.GPS_TRACKING_INTERVAL_MS || 15000);

  logger.info(
    `📡 Starting real-time GPS tracking loop (every ${intervalMs} ms)`
  );

  const tick = async () => {
    if (isRunning) {
      logger.warn(
        "[tracking] Previous pass still running – skipping this tick"
      );
      return;
    }

    isRunning = true;
    lastRunStartedAt = new Date();

    try {
      logger.debug?.(
        "[tracking] pass started at",
        lastRunStartedAt.toISOString()
      );
      await runTrackingPass(logger);
      logger.debug?.("[tracking] pass finished at", new Date().toISOString());
    } catch (err) {
      logger.error("[tracking] pass crashed", { error: err });
    } finally {
      isRunning = false;
    }
  };

  void tick();
  setInterval(tick, intervalMs);
}