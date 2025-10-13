import { Request, Response, NextFunction } from 'express';
import UserModel from '../models/user';

export const setUserLanguage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) return next();

    const user = await UserModel.findById(userId).select('language');
    if (user && user.language) {
      req.language = user.language; // attach to request
      req.i18n.changeLanguage(user.language); // set i18next language
    }
  } catch (err) {
    console.error('Error fetching user language:', err);
    // Do not block request, fallback to default language
  } finally {
    next();
  }
};
