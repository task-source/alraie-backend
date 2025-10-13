import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import createError from 'http-errors';
import UserModel from '../models/user';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createError(401, 'Unauthorized');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };

    const user = await UserModel.findById(decoded.id).select('-password -otp -otpExpiresAt');
    if (!user) throw createError(401, 'Unauthorized');

    req.user = { id: user._id.toString(), email: user.email, phone: user.phone, role: user.role };
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return next(createError(401, 'Token expired'));
    }
    next(createError(401, 'Unauthorized'));
  }
};
