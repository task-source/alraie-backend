import mongoose from 'mongoose';
import { logger } from './logger';

const env = process.env.NODE_ENV || 'development';

const MONGO_URI = env === 'production' ? process.env.MONGO_URI_PROD : process.env.MONGO_URI_DEV;

if (!MONGO_URI) {
  logger.error('MongoDB URI not set in environment variables');
  process.exit(1);
}

export const connectDB = async () => {
  try {
    mongoose.set('strictQuery', true);

    await mongoose.connect(MONGO_URI, {
      autoIndex: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000, // Fail fast if cannot connect
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });

    logger.info(`✅ MongoDB connected (${env})`);
  } catch (err) {
    logger.error('❌ MongoDB connection error', { error: err });
    process.exit(1); // Exit if DB cannot connect
  }

  // Handle connection errors after initial connect
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ MongoDB disconnected! Trying to reconnect...');
  });

  // Optional: reconnect logic
  mongoose.connection.on('reconnected', () => {
    logger.info('🔄 MongoDB reconnected');
  });
};
