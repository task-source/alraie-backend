import { Router } from 'express';
import {
  signup,
  resendOtp,
  refreshToken,
  verifyOtp,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
  addAssistant,
  updateProfile,
  verifyContactUpdate,
  getMe,
  deleteUserSafe,
  adminLogin,
  removeProfileImage,
  verifyResetOtp,
  getMyAssistants,
  addAdmin,
  verifyAdminOtp,
  resendAdminOtp,
  deleteAdmin,
} from '../controller/auth.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  signupSchema,
  validate,
  loginSchema,
  changePasswordSchema,
  addAssistantSchema,
  updateProfileSchema,
  addAdminSchema,
  verifyAdminOtpSchema,
  resendAdminOtpSchema,
} from '../middleware/validate';
import { authenticate } from '../middleware/authMiddleware';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { requireRole } from '../middleware/authRole';
import multer from 'multer';
import { subscriptionContext } from '../middleware/subscriptionContext';
import { requireQuota } from '../middleware/requireSubscriptionQuota';

export const authRouter = Router();
const upload = multer({ dest: "/tmp/uploads" });

authRouter.post('/signup', validate(signupSchema), asyncHandler(signup));
authRouter.post('/login', validate(loginSchema), asyncHandler(login));
authRouter.post(
  '/adminLogin',
  asyncHandler(adminLogin)
);
authRouter.post('/resendOtp', asyncHandler(resendOtp));
authRouter.post('/refreshToken', asyncHandler(refreshToken));
authRouter.post('/verifyOtp', asyncHandler(verifyOtp));
authRouter.post('/forgotPassword', asyncHandler(forgotPassword));
authRouter.post('/verifyResetPasswordOtp', asyncHandler(verifyResetOtp));
authRouter.post('/resetPassword', asyncHandler(resetPassword));
authRouter.post(
  '/changePassword',
  authenticate,
  subscriptionContext,
  validate(changePasswordSchema),
  setUserLanguage,
  asyncHandler(changePassword),
);

authRouter.post(
  '/addAssistant',
  authenticate,
  subscriptionContext,
  requireQuota("assistant"),
  requireRole(['owner']),
  upload.single("profileImage"),
  validate(addAssistantSchema),
  setUserLanguage,
  asyncHandler(addAssistant),
);

authRouter.put(
  '/updateProfile',
  authenticate,
  subscriptionContext,
  upload.single("profileImage"), 
  validate(updateProfileSchema),
  setUserLanguage,
  asyncHandler(updateProfile),
);

authRouter.post(
  '/contactVerification',
  authenticate,
  subscriptionContext,
  setUserLanguage,
  asyncHandler(verifyContactUpdate),
);

authRouter.get(
  "/myAssistants",
  authenticate,
  subscriptionContext,
  requireRole(["owner"]),
  setUserLanguage,
  asyncHandler(getMyAssistants)
);

authRouter.get(
  '/myDetails',
  authenticate,
  subscriptionContext,
  setUserLanguage,
  asyncHandler(getMe),
);

authRouter.delete(
  "/removeProfileImage",
  authenticate,
  subscriptionContext,
  setUserLanguage,
  asyncHandler(removeProfileImage)
);


authRouter.post(
  "/addAdmin",
  authenticate,
  requireRole(["superadmin"]),
  validate(addAdminSchema),
  setUserLanguage,
  asyncHandler(addAdmin)
);

authRouter.post(
  "/verifyAdminOtp",
  validate(verifyAdminOtpSchema),
  asyncHandler(verifyAdminOtp)
);

authRouter.post(
  "/resendAdminOtp",
  validate(resendAdminOtpSchema),
  asyncHandler(resendAdminOtp)
);

authRouter.delete(
  "/admin/:id",
  authenticate,
  requireRole(["superadmin"]),
  setUserLanguage,
  asyncHandler(deleteAdmin)
);

authRouter.post(
  "/:id/delete",
  authenticate,
  subscriptionContext,
  setUserLanguage,
  asyncHandler(deleteUserSafe)
);