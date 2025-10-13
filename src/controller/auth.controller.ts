import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import UserModel from '../models/user';
import bcrypt from 'bcryptjs';
import { generateOtp } from '../utils/otp';
import { generateTokens } from '../utils/token';
import createError from 'http-errors';

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body;

  if (data.language && ['en', 'ar'].includes(data.language)) {
    req.language = data.language;
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(data.language);
    }
  }

  if (data.accountType === 'email' && !data.email) {
    throw createError(400, req.t('email_is_required'));
  }
  if (data.accountType === 'email' && !data.password) {
    throw createError(400, req.t('password_is_required'));
  }

  if (data.accountType === 'phone' && !data.phone) {
    throw createError(400, req.t('phone_number_is_required'));
  }

  // Check duplicates
  if (data.accountType === 'email' && data.email) {
    const existing = await UserModel.findOne({ email: data.email });
    if (existing) throw createError(400, req.t('EMAIL_ALREADY_REGISTERED'));
  }
  if (data.accountType === 'phone' && data.phone) {
    const existing = await UserModel.findOne({ phone: data.phone });
    if (existing) throw createError(400, req.t('PHONE_ALREADY_REGISTERED'));
  }

  // Hash password
  let hashedPassword: string | undefined = undefined;
  if (data.password) {
    hashedPassword = await bcrypt.hash(data.password, 10);
  }

  // Generate OTP
  const { otp, expiresAt } = generateOtp();

  const user = await UserModel.create({
    email: data.accountType === 'email' ? data.email : undefined,
    phone: data.accountType === 'phone' ? data.phone : undefined,
    password: hashedPassword,
    role: data.role,
    animalType: data?.animalType ?? undefined,
    language: data.language,
    otp,
    otpExpiresAt: expiresAt,
    isEmailVerified: false,
    isPhoneVerified: false,
  });

  // TODO: send OTP via email or SMS
  console.log(`Send OTP ${otp} to ${data.email ?? data.phone}`);

  res.status(201).json({
    message: req.t('OTP_SENT'),
    id: user._id,
  });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, phone, otp, language } = req.body;

  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  if (!otp || (!email && !phone)) {
    throw createError(400, req.t('OTP_AND_EMAIL_OR_PHONE_REQUIRED'));
  }

  // Find user
  const user = await UserModel.findOne(email ? { email } : { phone });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));
  if (!!email && user.isEmailVerified) throw createError(404, req.t('email_already_verified'));
  // Check OTP validity
  if (user.otp !== otp) {
    throw createError(400, req.t('invalid_otp'));
  }

  if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw createError(400, req.t('otp_expired'));
  }

  // Mark verified
  if (email) user.isEmailVerified = true;
  if (phone) user.isPhoneVerified = true;

  // Clear OTP after successful verification
  user.otp = undefined;
  user.otpExpiresAt = undefined;

  // Generate tokens
  const tokens = generateTokens(user._id.toString());
  user.refreshToken = tokens.refreshToken;
  await user.save();

  res.json({
    message: req.t('verified_success'),
    success: true,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, phone, language } = req.body;

  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  if (!email && !phone) throw createError(400, req.t('EMAIL_OR_PHONE_REQUIRED'));

  const user = await UserModel.findOne(email ? { email } : { phone });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  const { otp, expiresAt } = generateOtp();
  user.otp = otp;
  user.otpExpiresAt = expiresAt;
  await user.save();

  console.log(`Resend OTP ${otp} to ${email ?? phone}`);
  res.json({ message: req.t('OTP_SENT'), success: true });
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw createError(400, 'Refresh token required');

  const user = await UserModel.findOne({ refreshToken });
  if (!user) throw createError(401, 'Invalid refresh token');

  const tokens = generateTokens(user._id.toString());
  user.refreshToken = tokens.refreshToken;
  await user.save();

  res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, success: true });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { accountType, email, phone, password, language } = req.body;

  // Set language if provided
  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  // Validate input
  if (accountType === 'email') {
    if (!email) throw createError(400, req.t('email_is_required'));
    if (!password) throw createError(400, req.t('password_is_required'));
  } else if (accountType === 'phone') {
    if (!phone) throw createError(400, req.t('phone_number_is_required'));
  } else {
    throw createError(400, req.t('invalid_account_type'));
  }

  // Find user
  const user = await UserModel.findOne(accountType === 'email' ? { email } : { phone });

  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  // Email login
  if (accountType === 'email') {
    if (!user.isEmailVerified) throw createError(401, req.t('EMAIL_NOT_VERIFIED'));

    const match = await bcrypt.compare(password, user.password ?? '');
    if (!match) throw createError(401, req.t('WRONG_PASSWORD'));

    // Generate tokens
    const tokens = generateTokens(user._id.toString());
    user.refreshToken = tokens.refreshToken;
    await user.save();

    return res.json({
      message: req.t('LOGIN_SUCCESS'),
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }

  // Phone login → send OTP
  if (accountType === 'phone') {
    const { otp, expiresAt } = generateOtp();
    user.otp = otp;
    user.otpExpiresAt = expiresAt;
    await user.save();

    // TODO: send OTP via SMS service
    console.log(`Send OTP ${otp} to ${phone}`);

    return res.json({
      message: req.t('OTP_SENT'),
      success: true,
      id: user._id,
    });
  }
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, language } = req.body;

  // Apply language
  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  if (!email) throw createError(400, req.t('email_is_required'));

  const user = await UserModel.findOne({ email });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));
  if (!user.isEmailVerified) throw createError(400, req.t('EMAIL_NOT_VERIFIED'));

  const { otp, expiresAt } = generateOtp();
  user.otp = otp;
  user.otpExpiresAt = expiresAt;
  await user.save();

  // TODO: Send OTP via email (for now log it)
  console.log(`Forgot password OTP for ${email}: ${otp}`);

  res.json({ message: req.t('OTP_SENT_FOR_PASSWORD_RESET'), success: true });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, newPassword, language } = req.body;

  // Apply language
  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  if (!email) throw createError(400, req.t('email_is_required'));
  if (!otp) throw createError(400, req.t('OTP_REQUIRED'));
  if (!newPassword) throw createError(400, req.t('NEW_PASSWORD_REQUIRED'));

  const user = await UserModel.findOne({ email });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  if (!user.otp || user.otp !== otp) throw createError(400, req.t('INVALID_OTP'));
  if (!user.otpExpiresAt || user.otpExpiresAt < new Date())
    throw createError(400, req.t('OTP_EXPIRED'));

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;

  // Clear OTP fields
  user.otp = undefined;
  user.otpExpiresAt = undefined;

  await user.save();

  res.json({ message: req.t('PASSWORD_RESET_SUCCESS'), success: true });
});

export const changePassword = asyncHandler(async (req: any, res) => {
  const userId = req.user?.id;
  if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

  // Validate input
  const { oldPassword, newPassword } = req.body;

  // Find user
  const user = await UserModel.findById(userId);
  if (!user) throw createError.NotFound(req.t('USER_NOT_FOUND'));

  // Ensure user has password-based account
  if (!user.password) throw createError.BadRequest(req.t('PASSWORD_ACCOUNT_REQUIRED'));

  // Check old password
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) throw createError.BadRequest(req.t('WRONG_PASSWORD'));

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Save
  user.password = hashedPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: req.t('PASSWORD_CHANGED_SUCCESS'),
  });
});
