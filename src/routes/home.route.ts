import { Router } from 'express';
import { getHomepageWeather, getWeather } from '../controller/home.controller';
import { authenticate } from '../middleware/authMiddleware';
import { setUserLanguage } from '../middleware/setUserLanguage';

export const homeRouter = Router();
homeRouter.use(authenticate);
homeRouter.use(setUserLanguage);
homeRouter.get("/",getHomepageWeather)
homeRouter.get("/weather", getWeather);
