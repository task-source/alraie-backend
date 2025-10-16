import { Request, Response } from 'express';
import UserModel from '../models/user';
import createError from 'http-errors';
import { userListQuerySchema } from '../middleware/validate';

export const getUsersList = async (req: Request, res: Response) => {
  const adminId = req.user?.id;
  if (!adminId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

  const adminUser = await UserModel.findById(adminId);
  if (!adminUser) throw createError.NotFound(req.t('USER_NOT_FOUND'));

  if (!['admin', 'superadmin'].includes(adminUser.role))
    throw createError.Forbidden(req.t('FORBIDDEN_ACCESS'));

  // ✅ Validate query params
  const parsed = userListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw createError(400, parsed.error.issues.map((e) => e.message).join(', '));
  }

  const { page, limit, role, search } = parsed.data;

  const query: any = {
    role: { $ne: 'superadmin' },
  };
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { name: { $regex: search, $options: 'i' } },
    ];
  }

  // Pagination
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    UserModel.find(query)
      .select('-password -refreshToken -otp -otpExpiresAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    UserModel.countDocuments(query),
  ]);

  res.json({
    success: true,
    page,
    totalPages: Math.ceil(total / limit),
    totalUsers: total,
    users,
  });
};