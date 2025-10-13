import client from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Initialize Prometheus metrics
export const initMetrics = () => {
  client.collectDefaultMetrics();
};

// HTTP request metrics
export const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [50, 100, 200, 300, 400, 500, 1000, 2000, 5000],
});

// Middleware to measure request duration
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path || req.path, status_code: res.statusCode });
  });
  next();
};

// /metrics endpoint handler
export const metricsEndpoint = async (_req: Request, res: Response) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
};
