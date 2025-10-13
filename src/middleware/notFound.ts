import { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';

export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction) => {
  next(createError(404, 'Not Found'));
};
