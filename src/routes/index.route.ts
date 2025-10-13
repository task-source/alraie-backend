import { Router } from 'express';
import { metricsRouter } from './metrics.route';
import { healthRouter } from './health.route';
import { authRouter } from './auth.route';
import { termsRouter } from './terms.route';
import { privacyPolicyRouter } from './privacyPolicy.route';
import { languageRouter } from './language.route';
// import { uploadRouter } from './upload.route';
const router = Router();

router.use('/auth', authRouter);
router.use('/language', languageRouter);
router.use('/metrics', metricsRouter);
router.use('/health', healthRouter);
router.use('/terms', termsRouter);
router.use('/privacyPolicy', privacyPolicyRouter);
// router.use('/upload', uploadRouter);
export default router;
