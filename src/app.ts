import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { limiter } from './middleware/rateLimiter';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { metricsMiddleware } from './utils/metrics';
import { initI18n } from './utils/i18n';
import indexRouter from './routes/index.route';
import { stripeWebhookHandler } from './controller/order.controller';
import { asyncHandler } from './middleware/asyncHandler';
const app = express();
app.set('trust proxy', 1); //for vercel proxy

app.use(helmet());
app.use(cors());
app.use(compression());

app.use(express.json());
app.use(limiter);
app.use(metricsMiddleware);

(async () => {
  const i18nMiddleware = await initI18n();
  app.use(i18nMiddleware);
  app.get('/', (_req, res) => {
    res.json({ message: _req.t('WELCOME'), success: true });
  });
  app.use('/', indexRouter);
  app.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    asyncHandler(stripeWebhookHandler)
  );
  app.use(notFoundHandler);
  app.use(errorHandler);
})();

export default app;
