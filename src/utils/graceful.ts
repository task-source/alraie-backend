import { Server } from 'http';
import { logger } from './logger';
import mongoose from 'mongoose';
export const setupGracefulShutdown = (server: Server) => {
  const shutdown = async (signal: string) => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed due to app termination');
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    server.close((err) => {
      if (err) {
        logger.error('Error during server close', { err });
        process.exit(1);
      }
      logger.info('Closed out remaining connections. Exiting.');
      process.exit(0);
    });

    // Force exit if not closed in time
    setTimeout(() => {
      logger.error('Forcing shutdown due to timeout');
      process.exit(1);
    }, 30_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};
