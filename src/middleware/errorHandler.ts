import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Error handled', {
    status,
    message,
    stack: err.stack,
  });

  res.status(status).json({
    success: false,
    error: {
      status,
      message: status < 500 ? message : 'Internal Server Error',
    },
  });
};
