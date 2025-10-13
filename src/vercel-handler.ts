

import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { initSentry } from './utils/sentry';
import { initMetrics } from './utils/metrics';
import { connectDB } from './utils/db';


initSentry(process.env.SENTRY_DSN);


initMetrics();


(async () => {
  try {
    await connectDB();

  } catch (err) {

    console.error('❌ Failed to connect DB in vercel-handler', err);
  }
})();

export default app;
