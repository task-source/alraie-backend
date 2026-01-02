import dotenv from 'dotenv';
dotenv.config();

import { createServer } from 'http';
import app from './app';
import { logger } from './utils/logger';
import { setupGracefulShutdown } from './utils/graceful';
import { initMetrics } from './utils/metrics';
import { initSentry } from './utils/sentry';
import { connectDB } from './utils/db';
import { startTrackingRealtime } from './jobs/tracking.cron';
import { startOrderTimeoutCron } from "./jobs/orderTimeout.scheduler";
import { startSubscriptionCron } from './jobs/subscription.cron';
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// Initialize Sentry first
initSentry(process.env.SENTRY_DSN);

// Initialize Metrics
initMetrics();

// Start server after connecting to MongoDB
const startServer = async () => {
  try {
    //  Connect to MongoDB
    await connectDB();
    startOrderTimeoutCron();
    // startSubscriptionCron();
    // Start GPS tracking cron AFTER DB is connected
    // startTrackingRealtime();
    // logger.info("📍 GPS Tracking Cron Started");

    //  Create HTTP server
    const server = createServer(app);

    server.listen(PORT, () => {
      logger.info(`✅ Server running on http://localhost:${PORT}`);
    });

    // Setup graceful shutdown
    setupGracefulShutdown(server);

    // Global crash handlers
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason });
      setTimeout(() => process.exit(1), 1000);
    });
  } catch (err) {
    logger.error('❌ Failed to start server', { error: err });
    process.exit(1); // Exit if DB connection failed
  }
};

// Start everything
startServer();