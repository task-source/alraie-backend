// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config();

import app from '../src/app'; 
import { initSentry } from '../src/utils/sentry';
import { initMetrics } from '../src/utils/metrics';
import { connectDB } from '../src/utils/db';

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
