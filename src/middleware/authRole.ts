import { Request, Response, NextFunction } from 'express';
import createError from 'http-errors';

export const requireRole = (role: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req?.user;
      if (!user) return next(createError(401, req.t ? req.t('UNAUTHORIZED') : 'Unauthorized'));
      if (!('role' in user) || !role?.includes((user as any)?.role)) {
        if ((user as any)?.role !== 'superadmin') {
          return next(createError(403, req.t ? req.t('FORBIDDEN') : 'Forbidden'));
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
