import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import UserModel from '../models/user';
import bcrypt from 'bcryptjs';
import { generateOtp } from '../utils/otp';
import { generateTokens } from '../utils/token';
import createError from 'http-errors';
import mongoose, {Types} from 'mongoose';
import animalModel from '../models/animal.model';
import geofenceModel from '../models/geofence.model';
import gpsModel from '../models/gps.model';
import fs from "fs";
import { FileService } from "../services/fileService";
import animalReportModel from '../models/animalReport.model';
import deletedUsersModel from '../models/deletedUsers.model';
import { assertQuota } from '../services/quotaGuard';
import { assignFreeTrial } from '../services/subscriptionBootstrap';

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

  if (data.accountType === 'phone' && !data?.countryCode) {
    throw createError(400, req.t('country_code_required'));
  }

  if (data.role === 'assistant') {
    throw createError(401, req.t('require_owner_to_signup'));
  }

  let fullPhone: string | undefined;
  if (data.accountType === 'phone' && data.phone && data.countryCode) {
    fullPhone = `${data.countryCode}${data.phone}`.replace(/\s+/g, '');
    data.fullPhone = fullPhone;
  }

  // Hash password
  let hashedPassword: string | undefined = undefined;
  if (data.password) {
    hashedPassword = await bcrypt.hash(data.password, 10);
  }

  // Generate OTP
  const { otp, expiresAt } = generateOtp();

  // Find existing user by email or phone
  const existingQuery =
    data.accountType === 'email'
      ? { email: data.email?.toLowerCase() }
      : { fullPhone: fullPhone };

  const existingUser = await UserModel.findOne(existingQuery);

  // If existing and already verified: block signup (same behavior as before)
  if (existingUser) {
    // Email-based signup: block if email already verified
    if (data.accountType === 'email' && existingUser.isEmailVerified) {
      throw createError(400, req.t('EMAIL_ALREADY_REGISTERED'));
    }

    // Phone-based signup: block if phone already verified
    if (data.accountType === 'phone' && existingUser.isPhoneVerified) {
      throw createError(400, req.t('PHONE_ALREADY_REGISTERED'));
    }

    // If we reached here → existing user exists but NOT verified for the current account type.
    // We will update the existing user with provided fields and send a fresh OTP.

    // Apply updates: only set fields that are meaningful for signup
    if (data.accountType === 'email' && data.email) {
      existingUser.email = data.email.toLowerCase();
    }
    if (data.accountType === 'phone' && fullPhone) {
      existingUser.phone = data.phone;
      existingUser.countryCode = data.countryCode;
      existingUser.fullPhone = fullPhone;
    }

    if (hashedPassword) existingUser.password = hashedPassword;

    // Update role / owner / assistant relationships carefully:
    if (data.role) existingUser.role = data.role;
    // if new ownerId provided (for assistant creation), set it
    if (data.ownerId) existingUser.ownerId = data.ownerId;

    // If role is owner, clear ownerId to avoid confusion
    if (data.role === 'owner') existingUser.ownerId = null;

    // Update animalType & language if provided; otherwise keep the old value
    if (data.animalType) existingUser.animalType = data.animalType;
    if (data.language && ['en', 'ar'].includes(data.language)) existingUser.language = data.language;

    // Assign new OTP and expiry
    existingUser.otp = otp;
    existingUser.otpExpiresAt = expiresAt;
    // keep verified flags as-is (they should be false for this flow)
    existingUser.isEmailVerified = existingUser.isEmailVerified ?? false;
    existingUser.isPhoneVerified = existingUser.isPhoneVerified ?? false;

    await existingUser.save();

    // TODO: send OTP via email or SMS
    console.log(`Send OTP ${otp} to ${data.email ?? fullPhone}`);

    return res.status(200).json({
      message: req.t('OTP_SENT'),
      success:true,
      id: existingUser._id,
      reusedAccount: true,
    });
  }

  // No existing user → create normally (same as before)
  const user = await UserModel.create({
    email: data.accountType === 'email' ? data.email?.toLowerCase() : undefined,
    phone: data.accountType === 'phone' ? data.phone : undefined,
    countryCode: data.accountType === 'phone' ? data.countryCode : undefined,
    fullPhone: data.accountType === 'phone' ? fullPhone : undefined,
    password: hashedPassword,
    role: data.role,
    animalType: data?.animalType ?? undefined,
    language: data.language,
    otp,
    otpExpiresAt: expiresAt,
    isEmailVerified: false,
    isPhoneVerified: false,
  });
  await assignFreeTrial(user._id?.toString());

  // TODO: send OTP via email or SMS
  console.log(`Send OTP ${otp} to ${data.email ?? fullPhone}`);

  res.status(201).json({
    message: req.t('OTP_SENT'),
    id: user._id,
    success:true
  });
});

export const addAssistant = async (req: any, res: Response) => {
  const ownerId = req.user?.id;
  const data = req.body;

  if (data?.language && ['en', 'ar'].includes(data.language)) {
    req.language = data.language;
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(data.language);
    }
  }
  if (!ownerId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));
  const owner = await UserModel.findById(ownerId);

  if (!owner) throw createError(404, req.t('OWNER_NOT_FOUND'));

  if (owner.role !== 'owner') throw createError(403, req.t('NOT_OWNER_ACCOUNT'));
  
  await assertQuota(ownerId, "assistant",req.t);

  if (data.role && data.role !== 'assistant')
    throw createError(400, req.t('ONLY_ASSISTANT_ALLOWED'));

  if (data.accountType === 'email' && !data.email)
    throw createError(400, req.t('email_is_required'));
  if (data.accountType === 'email' && !data.password)
    throw createError(400, req.t('password_is_required'));
  if (data.accountType === 'phone' && !data.phone)
    throw createError(400, req.t('phone_number_is_required'));

  if (data.accountType === 'phone' && !data.countryCode) {
    throw createError(400, req.t('country_code_required'));
  }

  // Check for duplicates
  if (data.email) {
    const existingEmail = await UserModel.findOne({ email: data.email });
    if (existingEmail) throw createError(400, req.t('EMAIL_ALREADY_REGISTERED'));
  }
  if (data.phone && data.countryCode) {
    const fullPhone = `${data.countryCode}${data.phone}`.replace(/\s+/g, '');
    const existingPhone = await UserModel.findOne({ fullPhone });
    if (existingPhone) throw createError(400, req.t('PHONE_ALREADY_REGISTERED'));
    data.fullPhone = fullPhone;
  }

  let hashedPassword: string | undefined = undefined;
  if (data.password) {
    hashedPassword = await bcrypt.hash(data.password, 10);
  }

  if (typeof data?.name !== 'undefined') {
    data.name = String(data.name).trim();
  }

  const fileService = new FileService();
  let profileImage: string | undefined = undefined;
  
  if (req.file) {
  try {
    const file = req.file;
    const safeName = `users/${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;

    const uploadedUrl = await fileService.uploadFile(
      file.path,
      safeName,
      file.mimetype
    );

    profileImage = uploadedUrl;

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

  } catch (err: any) {
    console.error("Profile image upload failed:", err.message);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw createError(500, req.t("IMAGE_UPLOAD_FAILED"));
  }
  }

  const { otp, expiresAt } = generateOtp();

  const assistant = await UserModel.create({
    email: (data?.email) ? data.email : undefined,
    phone: (data?.phone && data?.countryCode) ? data.phone : undefined,
    countryCode: (data?.phone && data?.countryCode) ? data.countryCode : undefined,
    fullPhone: (data?.phone && data?.countryCode) ? data.fullPhone : undefined,
    password: hashedPassword,
    role: 'assistant',
    ownerId: owner._id,
    animalType: owner.animalType,
    language: data?.language ?? owner.language,
    otp,
    name:data?.name ?? null,
    profileImage,
    otpExpiresAt: expiresAt,
    isEmailVerified: false,
    isPhoneVerified: false,
  });

  await UserModel.findByIdAndUpdate(owner._id, {
    $addToSet: { assistantIds: assistant._id },
  });

  console.log(`Send OTP ${otp} to assistant ${data.email ?? data.phone}`);

  res.status(201).json({
    message: req.t('ASSISTANT_ADDED_OTP_SENT'),
    success: true,
    assistantId: assistant._id,
  });
};

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, fullPhone, otp, language } = req.body;

  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  if (!otp || (!email && !fullPhone)) {
    throw createError(400, req.t('OTP_AND_EMAIL_OR_PHONE_REQUIRED'));
  }

  // Find user
  const user = await UserModel.findOne(email ? { email } : { fullPhone: `${fullPhone}`.replace(/\s+/g, '') });
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
  if (fullPhone) user.isPhoneVerified = true;

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
  const { email, fullPhone, language } = req.body;

  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req?.i18n?.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  if (!email && !fullPhone) throw createError(400, req.t('EMAIL_OR_PHONE_REQUIRED'));

  const user = await UserModel.findOne(email ? { email } : { fullPhone: `${fullPhone}`.replace(/\s+/g, '') });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  const { otp, expiresAt } = generateOtp();
  user.otp = otp;
  user.otpExpiresAt = expiresAt;
  await user.save();

  console.log(`Resend OTP ${otp} to ${email ?? fullPhone}`);
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
  const { accountType, email, fullPhone, password, language } = req.body;

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
    if (!fullPhone) throw createError(400, req.t('phone_number_is_required'));
  } else {
    throw createError(400, req.t('invalid_account_type'));
  }

  // Find user
  const user = await UserModel.findOne(accountType === 'email' ? { email } : { fullPhone: `${fullPhone}`.replace(/\s+/g, '') });

  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  if (['admin', 'superadmin'].includes(user.role)) {
    throw createError(403, req.t('ADMIN_LOGIN_NOT_ALLOWED_HERE'));
  }

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
    console.log(`Send OTP ${otp} to ${fullPhone}`);

    return res.json({
      message: req.t('OTP_SENT'),
      success: true,
      id: user._id,
    });
  }
});

export const adminLogin = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, language } = req.body;

  // Language handling
  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n?.changeLanguage) {
      await req.i18n.changeLanguage(language);
    }
  }

  // Validations
  if (!email) throw createError(400, req.t('email_is_required'));
  if (!password) throw createError(400, req.t('password_is_required'));

  // Find user
  const user = await UserModel.findOne({ email });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  // 🔥 MUST BE admin or superadmin
  if (!['admin', 'superadmin'].includes(user.role)) {
    throw createError(403, req.t('FORBIDDEN'));
  }

  // 🔐 Check password
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
    role: user.role,
  });
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
  user.passwordResetVerified = false;
  await user.save();

  // TODO: Send OTP via email (for now log it)
  console.log(`Forgot password OTP for ${email}: ${otp}`);

  res.json({ message: req.t('OTP_SENT_FOR_PASSWORD_RESET'), success: true });
});

export const verifyResetOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, language } = req.body;

  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    await req.i18n?.changeLanguage(language);
  }

  if (!email || !otp) {
    throw createError(400, req.t('EMAIL_AND_OTP_REQUIRED'));
  }

  const user = await UserModel.findOne({ email });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  if (!user.otp || user.otp !== otp) {
    throw createError(400, req.t('INVALID_OTP'));
  }

  if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw createError(400, req.t('OTP_EXPIRED'));
  }

  // ✅ OTP verified successfully
  user.passwordResetVerified = true;

  // 🔥 Clear OTP so it can't be reused
  user.otp = undefined;
  user.otpExpiresAt = undefined;

  await user.save();

  return res.json({
    success: true,
    message: req.t('OTP_VERIFIED_SUCCESSFULLY'),
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, newPassword, language } = req.body;

  // Apply language
  if (language && ['en', 'ar'].includes(language)) {
    req.language = language;
    if (req?.i18n && typeof req.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(language);
    }
  }

  if (!email) throw createError(400, req.t('email_is_required'));
  if (!newPassword) throw createError(400, req.t('NEW_PASSWORD_REQUIRED'));

  const user = await UserModel.findOne({ email });
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  if (!user.passwordResetVerified) {
    throw createError(403, req.t('OTP_NOT_VERIFIED'));
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  user.password = hashedPassword;
  user.passwordResetVerified = false;
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

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await UserModel.findById(id);
  if (!user) throw createError(404, req.t("USER_NOT_FOUND"));

  await UserModel.findOneAndDelete({ _id: id });

  res.status(200).json({
    success: true,
    message: req.t("USER_DELETED_SUCCESSFULLY"),
  });
});

export const updateProfile = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user?.id;
  if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

  const allowedUpdates = [
    'name',
    'gender',
    'email',
    'phone',
    'countryCode',
    'language',
    'animalType',
    'profileImage',
    'country',
    'preferredCurrency',
  ];

  const data = req.body || {};

  // Prevent updating protected fields via body (explicit check)
  const forbiddenFields = ['role', 'ownerId', 'assistantIds', 'otp', 'otpExpiresAt', 'refreshToken', 'password'];
  for (const f of forbiddenFields) {
    if (Object.prototype.hasOwnProperty.call(data, f)) {
      throw createError(400, req.t('INVALID_UPDATE_FIELD'));
    }
  }

  // Find user
  const user = await UserModel.findById(userId);
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  // Apply language change if requested
  if (data?.language && ['en', 'ar'].includes(data.language)) {
    req.language = data.language;
    if (req?.i18n && typeof req?.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(data.language);
    }
  }

  let verificationRequired = {
    email: false,
    phone: false,
  };
  let otpGenerated = false;
  let otp: string = user?.otp ?? "";
  let expiresAt: Date = user?.otpExpiresAt ?? new Date;

  //
  // EMAIL handling: uniqueness & marking unverified when changed
  //
  if (typeof data.email !== 'undefined' && data.email !== user.email) {
    const newEmail = String(data.email).toLowerCase();
    // check uniqueness excluding self
    const existing = await UserModel.findOne({ email: newEmail?.toLowerCase() });
    
    if (existing) {
      throw createError(400, req.t('EMAIL_ALREADY_REGISTERED'));
    }

    // ~not updating email now

    // user.email = newEmail;
    // user.isEmailVerified = false;

    // generate OTP to re-verify email
 if (!otpGenerated) ({ otp, expiresAt } = generateOtp());
    user.otp = otp;
    user.otpExpiresAt = expiresAt;
    otpGenerated = true;
    verificationRequired.email = true;
    console.log(`Send verification OTP ${otp} to email ${newEmail}`);

  }

  //
  // PHONE handling: build fullPhone, uniqueness & marking unverified when changed
  //

  if (typeof data.phone !== 'undefined' || typeof data.countryCode !== 'undefined') {
    // require both to be present (validate schema already enforces this)
    if (!data.phone || !data.countryCode) {
      throw createError(400, req.t('phone_and_country_code_required'));
    }
    const newPhone = String(data.phone).replace(/\s+/g, '');
    const newCountryCode = String(data.countryCode).replace(/\s+/g, '');
    const newFullPhone = `${newCountryCode}${newPhone}`;

    if (newFullPhone !== user.fullPhone) {
      // check uniqueness excluding self
      const existing = await UserModel.findOne({ fullPhone: newFullPhone });
      if (existing) {
        throw createError(400, req.t('PHONE_ALREADY_REGISTERED'));
      }

    // ~not updating phone now
      // user.phone = newPhone;
      // user.countryCode = newCountryCode;
      // user.fullPhone = newFullPhone;
      // user.isPhoneVerified = false;

 if (!otpGenerated) ({ otp, expiresAt } = generateOtp());
      user.otp = otp;
      user.otpExpiresAt = expiresAt;
      otpGenerated = true;
      verificationRequired.phone = true;

      console.log(`Send verification OTP ${otp} to phone ${newFullPhone}`);
    }
  }

  // Other simple fields
  if (typeof data.name !== 'undefined') {
    user.name = String(data.name).trim();
  }
  if (typeof data.gender !== 'undefined') {
    if (!['male', 'female', 'unknown'].includes(data.gender)) {
      throw createError(400, req.t('INVALID_GENDER'));
    }
    user.gender = data.gender;
  }
  if (typeof data.language !== 'undefined') {
    if (['en', 'ar'].includes(data.language)) user.language = data.language;
  }
  if (typeof data.animalType !== 'undefined') {
    if (!['farm', 'pet'].includes(data.animalType))
      throw createError(400, req.t('INVALID_ANIMAL_TYPE'));
    user.animalType = data.animalType;
  }


if (typeof data.country !== 'undefined') {
  user.country = String(data.country).trim();
}

if (typeof data.preferredCurrency !== 'undefined') {
  user.preferredCurrency = data.preferredCurrency;
}
const fileService = new FileService();

if (req.file) {
  try {
    // delete old image if exists
    if (user.profileImage) {
      try {
        await fileService.deleteFile(user.profileImage);
        console.log("Old profile image deleted");
      } catch (err) {
        console.error("Failed to delete old profile image:", err);
      }
    }

    const file = req.file;
    const safeName = `users/${user._id}_${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;

    const uploadedUrl = await fileService.uploadFile(
      file.path,
      safeName,
      file.mimetype
    );

    user.profileImage = uploadedUrl;

    // cleanup tmp file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

  } catch (err: any) {
    console.error("Profile image upload failed:", err.message);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw createError(500, req.t("IMAGE_UPLOAD_FAILED"));
  }
  }

  await user.save();

  const sanitized = sanitizeUserForResponse(user);

  const responsePayload: any = {
    message: req.t('PROFILE_UPDATED_SUCCESS'),
    success: true,
    user: sanitized,
  };

  if (verificationRequired.email || verificationRequired.phone) {
    responsePayload.verificationRequired = verificationRequired;
    // In case of email/phone change, you may choose to not return tokens until verified.
  }

  return res.status(200).json(responsePayload);
});

export const verifyContactUpdate = asyncHandler(async (req: any, res: Response) => {
  const { email, phone, countryCode, otp } = req.body;
  const userId = req.user?.id;
  if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

  if (!otp || (!email && !phone)) {
    throw createError(400, req.t('OTP_AND_EMAIL_OR_PHONE_REQUIRED'));
  }

  const user = await UserModel.findById(userId);
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  // Build fullPhone if phone provided
  let fullPhone = '';
  if (phone) {
    if (!countryCode) {
      throw createError(400, req.t('phone_and_country_code_required'));
    }
    fullPhone = `${String(countryCode).replace(/\s+/g, '')}${String(phone).replace(/\s+/g, '')}`;
  }

  // Uniqueness checks
  if (email) {
    
    const existing = await UserModel.findOne({ email:email?.toLowerCase() });
    if (existing) throw createError(400, req.t('EMAIL_ALREADY_REGISTERED'));
  }

  if (fullPhone) {
    const existing = await UserModel.findOne({ fullPhone });
    if (existing) throw createError(400, req.t('PHONE_ALREADY_REGISTERED'));
  }

  // OTP validation
  if (user.otp !== otp) throw createError(400, req.t('invalid_otp'));
  if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw createError(400, req.t('otp_expired'));
  }

  // Update verified fields
  if (email) {
    user.email = email;
    user.isEmailVerified = true;
  }
  if (fullPhone) {
    user.phone = phone;
    user.countryCode = countryCode;
    user.fullPhone = fullPhone;
    user.isPhoneVerified = true;
  }

  // Clear OTP
  user.otp = undefined;
  user.otpExpiresAt = undefined;

  await user.save();

  res.json({
    message: req.t('PROFILE_UPDATED_SUCCESS'),
    success: true,
  });
});

export const getMyAssistants = asyncHandler(async (req: any, res: Response) => {
  const ownerId = req.user?.id;
  if (!ownerId) throw createError.Unauthorized(req.t("UNAUTHORIZED"));

  const {
    page = 1,
    limit = 10,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    language,
    animalType,
    isEmailVerified,
    isPhoneVerified,
  } = req.query;

  const pageNum = Math.max(Number(page), 1);
  const limitNum = Math.min(Number(limit), 50);
  const skip = (pageNum - 1) * limitNum;

  const query: any = {
    ownerId,
    role: "assistant",
  };

  if (language) query.language = language;
  if (animalType) query.animalType = animalType;

  if (typeof isEmailVerified !== "undefined") {
    query.isEmailVerified = (isEmailVerified === "true" || isEmailVerified === true);
  }

  if (typeof isPhoneVerified !== "undefined") {
    query.isPhoneVerified = (isPhoneVerified === "true" || isPhoneVerified === true);
  }

  if (search) {
    const regex = new RegExp(search, "i");
    query.$or = [
      { name: regex },
      { email: regex },
      { phone: regex },
      { fullPhone: regex },
    ];
  }

  const sort: any = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };

  const [items, total] = await Promise.all([
    UserModel.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum),
    UserModel.countDocuments(query),
  ]);

  const sanitized = items.map(sanitizeUserForResponse);

  res.status(200).json({
    success: true,
    data: sanitized,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});


export const getMe = asyncHandler(async (req: any, res: Response) => {
  const userId = req.user?.id;  
  if (!userId) throw createError.Unauthorized(req.t('UNAUTHORIZED'));

  const user = await UserModel.findById(userId);
  if (!user) throw createError(404, req.t('USER_NOT_FOUND'));

  const sanitized = sanitizeUserForResponse(user);

  if (sanitized.animalType) {
    sanitized.category = sanitized.animalType;
    delete sanitized.animalType;
  }

  const subscription = req.subscription ?? null;

  if (user.role === "owner") {
    return res.status(200).json({
      success: true,
      user: sanitized,
      subscription: subscription
        ? {
            planKey: subscription.planKey,
            cycle: subscription.cycle,
            expiresAt: subscription.expiresAt,
            remaining: subscription.remaining,
          }
        : null,
    });
  }

  if (user.role === "assistant") {
    return res.status(200).json({
      success: true,
      user: sanitized,
      subscription: subscription
        ? {
            planKey: subscription.planKey,
            expiresAt: subscription.expiresAt,
            remaining: {
              animals: subscription.remaining.animals, 
            },
          }
        : null,
    });
  }

  return res.status(200).json({
    success: true,
    user: sanitized,
  });
});


export const deleteUserSafe = async (req: any, res: Response) => {
  const targetUserId = req.params.id;
  const authUserId = req.user?.id;
  const authUserRole = req.user?.role;
  const { reason } = req.body;

  if (!reason || typeof reason !== "string") {
    throw createError(400, req.t("DELETION_REASON_REQUIRED"));
  }

  if (!targetUserId) throw createError(400, req.t("USER_ID_REQUIRED"));

  const targetUser = await UserModel.findById(targetUserId).lean();
  if (!targetUser) throw createError(404, req.t("USER_NOT_FOUND"));

  // ------------------------------------
  // ASSISTANT PERMISSIONS
  // ------------------------------------
  if (authUserRole === "assistant") {
    if (String(authUserId) !== String(targetUserId)) {
      throw createError(403, req.t("ASSISTANT_CAN_DELETE_ONLY_SELF"));
    }

    if (targetUser.ownerId) {
      await UserModel.updateOne(
        { _id: targetUser.ownerId },
        { $pull: { assistantIds: targetUser._id } }
      );
    }

    const fileService = new FileService();

    if (targetUser.profileImage) {
      try {
        await fileService.deleteFile(targetUser.profileImage);
        console.log("🗑️ User profile image deleted");
      } catch (err) {
        console.error("❌ Failed to delete user profile image:", err);
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await deletedUsersModel.create(
        [
          {
            userId: targetUser._id,
            role: targetUser.role,
            name: targetUser.name,
            email: targetUser.email,
            phone: targetUser.phone,
            fullPhone: targetUser.fullPhone,
            country: targetUser.country,
            preferredCurrency: targetUser.preferredCurrency,
            animalType: targetUser.animalType,
            language: targetUser.language,
            deletionReason: reason,
            deletedBy: authUserId,
          },
        ],
        { session }
      );

      const result = await UserModel.collection.deleteOne(
        { _id: new Types.ObjectId(String(targetUserId)) },
        { session }
      );

      if (result.deletedCount === 0) {
        throw new Error("USER_NOT_DELETED");
      }

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    return res.json({
      success: true,
      message: req.t("ACCOUNT_DELETED"),
    });
  }

  // ------------------------------------
  // OWNER PERMISSIONS
  // ------------------------------------
  if (authUserRole === "owner" && String(authUserId) !== String(targetUserId)) {
    if (targetUser.role !== "assistant") {
      throw createError(403, req.t("OWNER_CAN_DELETE_ONLY_ASSISTANTS"));
    }

    if (String(targetUser.ownerId) !== String(authUserId)) {
      throw createError(403, req.t("NOT_YOUR_ASSISTANT"));
    }

    await UserModel.updateOne(
      { _id: authUserId },
      { $pull: { assistantIds: targetUser._id } }
    );

    const fileService = new FileService();

    if (targetUser.profileImage) {
      try {
        await fileService.deleteFile(targetUser.profileImage);
        console.log("🗑️ User profile image deleted");
      } catch (err) {
        console.error("❌ Failed to delete user profile image:", err);
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await deletedUsersModel.create(
        [
          {
            userId: targetUser._id,
            role: targetUser.role,
            name: targetUser.name,
            email: targetUser.email,
            phone: targetUser.phone,
            fullPhone: targetUser.fullPhone,
            country: targetUser.country,
            preferredCurrency: targetUser.preferredCurrency,
            animalType: targetUser.animalType,
            language: targetUser.language,
            deletionReason: reason,
            deletedBy: authUserId,
          },
        ],
        { session }
      );

      const result = await UserModel.collection.deleteOne({ _id: new Types.ObjectId(String(targetUserId)) },{ session });

      if (result.deletedCount === 0) {
        throw new Error("USER_NOT_DELETED");
      }
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    return res.json({
      success: true,
      message: req.t("ASSISTANT_DELETED_SUCCESSFULLY"),
    });
  }

  // ------------------------------------
  // FULL CASCADE DELETE FOR OWNER (ADMIN/SUPERADMIN or OWNER SELF)
  // ------------------------------------
  const ownerId = targetUser._id;

  const fileService = new FileService();

  // 🔥 DELETE ASSISTANTS PROFILE IMAGES (ADDED)
  const assistants = await UserModel.find({ ownerId }).select("profileImage").lean();
  for (const assistant of assistants) {
    if (assistant.profileImage) {
      try {
        await fileService.deleteFile(assistant.profileImage);
        console.log("🗑️ Assistant profile image deleted");
      } catch (err) {
        console.error("❌ Failed to delete assistant profile image:", err);
      }
    }
  }

  // 1) Assistants
  await UserModel.collection.deleteMany({ ownerId });

  // 2) Unlink animals
  await animalModel.collection.updateMany(
    { ownerId },
    { $set: { gpsDeviceId: null, gpsSerialNumber: null } }
  );

  // 3) Delete animals (works even if 0)
  await animalModel.collection.deleteMany({ ownerId });
  await animalReportModel.collection.deleteMany({ ownerId });
  // 4) Geofences (works even if 0)
  await geofenceModel.collection.deleteMany({ ownerId });
  
  // 5) GPS devices (works even if 0)
  await gpsModel.collection.deleteMany({ ownerId });

  // 🔥 DELETE OWNER PROFILE IMAGE (ALREADY PRESENT, KEPT)
  if (targetUser.profileImage) {
    try {
      await fileService.deleteFile(targetUser.profileImage);
      console.log("🗑️ User profile image deleted");
    } catch (err) {
      console.error("❌ Failed to delete user profile image:", err);
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await deletedUsersModel.create(
      [
        {
          userId: targetUser._id,
          role: targetUser.role,
          name: targetUser.name,
          email: targetUser.email,
          phone: targetUser.phone,
          fullPhone: targetUser.fullPhone,
          country: targetUser.country,
          preferredCurrency: targetUser.preferredCurrency,
          animalType: targetUser.animalType,
          language: targetUser.language,
          deletionReason: reason,
          deletedBy: authUserId,
        },
      ],
      { session }
    );

    const result = await UserModel.collection.deleteOne({ _id: new Types.ObjectId(String(targetUserId)) },{ session });
  if (result.deletedCount === 0) {
      throw new Error("USER_NOT_DELETED");
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return res.json({
    success: true,
    message: req.t("USER_DELETED_SUCCESSFULLY"),
  });
};

export const removeProfileImage = asyncHandler(async (req: any, res: Response) => {
  const authUserId = req.user?.id;
  const authUserRole = req.user?.role;

  if (!authUserId) throw createError.Unauthorized(req.t("UNAUTHORIZED"));

  // target user (admin can pass userId, normal user cannot)
  const targetUserId =
    authUserRole === "admin" || authUserRole === "superadmin"
      ? (req.query.userId as string) || authUserId
      : authUserId;

  // permission check
  if (
    authUserRole !== "admin" &&
    authUserRole !== "superadmin" &&
    String(targetUserId) !== String(authUserId)
  ) {
    throw createError(403, req.t("FORBIDDEN"));
  }

  const user = await UserModel.findById(targetUserId);
  if (!user) throw createError(404, req.t("USER_NOT_FOUND"));

  if (!user.profileImage) {
    return res.status(200).json({
      success: true,
      message: req.t("PROFILE_IMAGE_ALREADY_REMOVED"),
    });
  }

  const fileService = new FileService();

  try {
    await fileService.deleteFile(user.profileImage);
    console.log("🗑️ Profile image removed from bucket");
  } catch (err) {
    console.error("❌ Failed to delete profile image:", err);
    throw createError(500, req.t("PROFILE_IMAGE_DELETE_FAILED"));
  }

  user.profileImage = undefined;
  await user.save();

  return res.status(200).json({
    success: true,
    message: req.t("PROFILE_IMAGE_REMOVED_SUCCESSFULLY"),
  });
});



function sanitizeUserForResponse(userDoc: any) {
  const u = userDoc.toJSON();
  delete u.password;
  delete u.otp;
  delete u.otpExpiresAt;
  delete u.refreshToken;
  delete u.__v;
  delete u.passwordResetVerified;
  return u;
}