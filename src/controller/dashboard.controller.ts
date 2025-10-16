import { Request, Response } from 'express';
import UserModel from '../models/user';
import createError from 'http-errors';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw createError.Unauthorized(req.t('UNAUTHORIZED'));
    }

    const adminUser = await UserModel.findById(userId);
    if (!adminUser) {
      throw createError.NotFound(req.t('USER_NOT_FOUND'));
    }

    if (!['admin', 'superadmin'].includes(adminUser.role)) {
      throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));
    }

    const [totalUsers, totalOwners, totalAssistants, totalAdmins] = await Promise.all([
      UserModel.countDocuments({}),
      UserModel.countDocuments({ role: 'owner' }),
      UserModel.countDocuments({ role: 'assistant' }),
      UserModel.countDocuments({ role: 'admin' }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalOwners,
        totalAssistants,
        totalAdmins,
      },
    });
  } catch (error: any) {
    // Log error
    console.error('Dashboard stats error:', error);

    if (createError.isHttpError(error)) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Something went wrong',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
};