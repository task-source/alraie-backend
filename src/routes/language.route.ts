import { Router } from 'express';
import { setLanguage } from '../controller/language.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/authMiddleware';
import { setUserLanguage } from '../middleware/setUserLanguage';

export const languageRouter = Router();

// Authenticated route to change language
languageRouter.post(
  '/set',
  authenticate, // sets req.user
  setUserLanguage, // sets req.i18n as well as set language in req
  asyncHandler(setLanguage), //change language in db for particual user
);