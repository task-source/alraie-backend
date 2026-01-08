import { Router } from 'express';
import { metricsRouter } from './metrics.route';
import { healthRouter } from './health.route';
import { authRouter } from './auth.route';
import { termsRouter } from './terms.route';
import { privacyPolicyRouter } from './privacyPolicy.route';
import { languageRouter } from './language.route';
import { adminRouter } from './admin.route';
import {animalRouter} from "./animal.route";
import { geofenceRouter } from './geofence.route';
import { gpsRouter } from './gps.route';
import { homeRouter } from './home.route';
import { productRouter } from './product.route';
import { cartRouter } from './cart.route';
import { orderRouter } from './order.route';
import { addressRouter } from './address.route';
import { aboutUsRouter } from './aboutUs.route';
import { accountDeletionReasonRouter } from './accountDeletionReason.route';
import { animalReportRouter } from './animalReport.route';
import { contactUsRouter } from './contactUs.route';
import { adminSubscriptionPlanRouter } from './subscriptionPlan.route';
import { subscriptionRouter } from './subscription.route';
import { adminUserSubscriptionRouter } from './userSubscription.route';
import { deliveryZoneRouter } from './deliveryZone.route';
// import { uploadRouter } from './upload.route';
const router = Router();

router.use('/auth', authRouter);
router.use('/language', languageRouter);
router.use('/metrics', metricsRouter);
router.use('/health', healthRouter);
router.use('/terms', termsRouter);
router.use('/aboutUs', aboutUsRouter);
router.use('/deleteReason', accountDeletionReasonRouter);
router.use('/privacyPolicy', privacyPolicyRouter);
router.use('/contactUs', contactUsRouter);
router.use('/admin', adminRouter);
router.use("/animals", animalRouter);
router.use("/animalReport", animalReportRouter);
router.use("/geofence", geofenceRouter);
router.use("/gps", gpsRouter);
router.use("/home", homeRouter);

//E-Commerce
router.use("/deliveryZone",deliveryZoneRouter);
router.use("/products", productRouter);
router.use("/cart", cartRouter);
router.use("/orders", orderRouter);
router.use("/address", addressRouter);

//Subscription
router.use("/subscriptionPlan",adminSubscriptionPlanRouter);
router.use("/userSubscriptions",adminUserSubscriptionRouter);
router.use("/subscriptions",subscriptionRouter);
// router.use('/upload', uploadRouter);
export default router;
