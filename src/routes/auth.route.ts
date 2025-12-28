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
} from '../controller/auth.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import {
  signupSchema,
  validate,
  loginSchema,
  changePasswordSchema,
  addAssistantSchema,
  updateProfileSchema,
} from '../middleware/validate';
import { authenticate } from '../middleware/authMiddleware';
import { setUserLanguage } from '../middleware/setUserLanguage';
import { requireRole } from '../middleware/authRole';
import multer from 'multer';

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
  validate(changePasswordSchema),
  setUserLanguage,
  asyncHandler(changePassword),
);

authRouter.post(
  '/addAssistant',
  authenticate,
  requireRole(['owner']),
  validate(addAssistantSchema),
  setUserLanguage,
  asyncHandler(addAssistant),
);

authRouter.put(
  '/updateProfile',
  authenticate,
  upload.single("profileImage"), 
  validate(updateProfileSchema),
  setUserLanguage,
  asyncHandler(updateProfile),
);

authRouter.post(
  '/contactVerification',
  authenticate,
  setUserLanguage,
  asyncHandler(verifyContactUpdate),
);

authRouter.get(
  "/myAssistants",
  authenticate,
  requireRole(["owner"]),
  setUserLanguage,
  asyncHandler(getMyAssistants)
);

authRouter.get(
  '/myDetails',
  authenticate,
  setUserLanguage,
  asyncHandler(getMe),
);

authRouter.delete(
  "/removeProfileImage",
  authenticate,
  setUserLanguage,
  asyncHandler(removeProfileImage)
);


authRouter.post(
  "/:id/delete",
  authenticate,
  setUserLanguage,
  asyncHandler(deleteUserSafe)
);