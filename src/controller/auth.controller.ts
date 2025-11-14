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

  const { otp, expiresAt } = generateOtp();

  const assistant = await UserModel.create({
    email: data.accountType === 'email' ? data.email : undefined,
    phone: data.accountType === 'phone' ? data.phone : undefined,
    countryCode: data.accountType === 'phone' ? data.countryCode : undefined,
    fullPhone: data.accountType === 'phone' ? data.fullPhone : undefined,
    password: hashedPassword,
    role: 'assistant',
    ownerId: owner._id,
    animalType: owner.animalType,
    language: data?.language ?? owner.language,
    otp,
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

  res.status(200).json({
    success: true,
    user: sanitized,
  });
});


function sanitizeUserForResponse(userDoc: any) {
  const u = userDoc.toObject ? userDoc.toObject() : { ...userDoc };
  delete u.password;
  delete u.otp;
  delete u.otpExpiresAt;
  delete u.refreshToken;
  delete u.__v;
  return u;
}