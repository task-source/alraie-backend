import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import UserModel from '../models/user';
import createError from 'http-errors';

export const setLanguage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const { language } = req.body;

  if (!userId) throw createError(401, req.t('UNAUTHORIZED'));
  if (!['en', 'ar'].includes(language)) throw createError(400, req.t('INVALID_LANGUAGE'));

  const user = await UserModel.findByIdAndUpdate(userId, { language }, { new: true });

  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  // Update i18n for this request
  req.i18n.changeLanguage(language);

  res.json({
    message: req.t('USER_LANGUAGE_UPDATED'),
    language: user.language,
    success: true,
  });
});
