// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config();

import app from '../src/app'; 
import { initSentry } from '../dist/utils/sentry.js';
import { initMetrics } from '../dist/utils/metrics.js';
import { connectDB } from '../dist/utils/db.js';

initSentry(process.env.SENTRY_DSN);
initMetrics();

(async () => {
  try {
    await connectDB();
  } catch (err) {
    console.error('❌ Failed to connect DB in vercel handler', err);
  }
})();

export default app;
