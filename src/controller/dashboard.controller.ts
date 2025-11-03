import { Request, Response } from 'express';
import UserModel from '../models/user';
import createError from 'http-errors';
import Animal from '../models/animal.model';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

    const adminUser = await UserModel.findById(userId);
    if (!adminUser) throw createError.NotFound(req.t('USER_NOT_FOUND'));

    if (!['admin', 'superadmin'].includes(adminUser.role))
      throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));

    // ----- User Stats -----
    const [totalUsers, totalOwners, totalAssistants, totalAdmins] = await Promise.all([
      UserModel.countDocuments({}),
      UserModel.countDocuments({ role: 'owner' }),
      UserModel.countDocuments({ role: 'assistant' }),
      UserModel.countDocuments({ role: 'admin' }),
    ]);

    // ----- Animal Stats -----
    const totalAnimals = await Animal.countDocuments({});
    const farmAnimals = await Animal.countDocuments({ category: 'farm' });
    const petAnimals = await Animal.countDocuments({ category: 'pet' });

    // Group animals by typeKey
    const animalTypeCounts = await Animal.aggregate([
      {
        $group: {
          _id: '$typeKey',
          count: { $sum: 1 },
          typeName_en: { $first: '$typeNameEn' },
          typeName_ar: { $first: '$typeNameAr' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        users: {
          totalUsers,
          totalOwners,
          totalAssistants,
          totalAdmins,
        },
        animals: {
          totalAnimals,
          farmAnimals,
          petAnimals,
          types: animalTypeCounts.map((t) => ({
            key: t._id,
            name_en: t.typeName_en,
            name_ar: t.typeName_ar,
            count: t.count,
          })),
        },
      },
    });
  } catch (error: any) {
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


const getLast12Months = () => {
  const months: { label: string; year: number; month: number }[] = [];
  const now = new Date();

  for (let i = 11; i >= 0; i--) {
    const date = subMonths(now, i);
    months.push({
      label: format(date, 'MMM'),
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    });
  }

  return months;
};

export const getUserGrowthStats = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

    const adminUser = await UserModel.findById(userId);
    if (!adminUser) throw createError.NotFound(req.t('USER_NOT_FOUND'));

    if (!['admin', 'superadmin'].includes(adminUser.role))
      throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));

    const now = new Date();
    const lastYear = subMonths(now, 11);

    // Aggregate users by month for last 12 months
    const userGrowth = await UserModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth(lastYear), $lte: endOfMonth(now) },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    // Fill missing months with 0s
    const months = getLast12Months();
    const data = months.map((m) => {
      const found = userGrowth.find(
        (g) => g._id.year === m.year && g._id.month === m.month
      );
      return {
        month: m.label,
        value: found ? found.count : 0,
      };
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('User growth stats error:', error);

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

export const getAnimalStatusSummary = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

    const user = await UserModel.findById(userId);
    if (!user) throw createError.NotFound(req.t('USER_NOT_FOUND'));

    const filter: Record<string, any> = {};

    if (['owner', 'assistant'].includes(user.role)) {
      const ownerId =
        user.role === 'assistant' ? user.ownerId : user._id;
      filter.owner = ownerId;
    } else if (['admin', 'superadmin'].includes(user.role)) {
      if (req.query.ownerId) {
        filter.owner = req.query.ownerId;
      }
    } else {
      throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));
    }

    const result = await Animal.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$animalStatus',
          count: { $sum: 1 },
        },
      },
    ]);

    const summary: Record<string, number> = {
      active: 0,
      sold: 0,
      dead: 0,
      transferred: 0,
      total: 0,
    };

    result.forEach((r) => {
      if (r._id && summary.hasOwnProperty(r._id)) {
        summary[r._id] = r.count;
      }
      summary.total += r.count;
    });

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('Animal status summary error:', error);

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
