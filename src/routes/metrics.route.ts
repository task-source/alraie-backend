import { Router } from 'express';
import { metricsEndpoint } from '../utils/metrics';
import { authenticate } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/authRole';

export const metricsRouter = Router();

metricsRouter.get('/', authenticate, requireRole(['superadmin']), metricsEndpoint);