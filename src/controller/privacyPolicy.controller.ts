import { Request, Response } from 'express';
import createError from 'http-errors';
import PrivacyPolicyModel from '../models/PrivacyPolicy';
import { sanitize } from '../utils/sanitizeHTML';

export const getPrivacyPolicy = async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || req.language || req.i18n?.language || 'en';
  if (lang && ['en', 'ar'].includes(lang)) {
    req.language = lang;
    if (req?.i18n && typeof req.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(lang);
    }
  }
  if (!['en', 'ar'].includes(lang)) throw createError(400, req.t('INVALID_LANGUAGE'));

  // prefer the latest active version
  const privacyPolicy = await PrivacyPolicyModel.findOne({ language: lang, active: true })
    .sort({ version: -1 })
    .lean();
  if (!privacyPolicy) {
    // optional: fallback to other language or return 404
    return res.status(404).json({ message: req.t('PRIVACY_POLICY_NOT_FOUND'), success:false });
  }

  res.json({
    language: privacyPolicy.language,
    html: privacyPolicy.html, // frontend will render this using renderHtml
    version: privacyPolicy.version,
    updatedAt: privacyPolicy.updatedAt,
    success: true,
  });
};

export const upsertPrivacyPolicy = async (req: Request, res: Response) => {
  const { language, html, active } = req.body;

  if (!language || !['en', 'ar'].includes(language)) {
    throw createError(400, req.t ? req.t('INVALID_LANGUAGE') : 'Invalid language');
  }

  if (!html) {
    throw createError(400, req.t ? req.t('HTML_REQUIRED') : 'HTML content is required');
  }

  // sanitize HTML
  const cleaned = sanitize(html);

  // find current highest version for language
  const latest = await PrivacyPolicyModel.findOne({ language }).sort({ version: -1 }).lean();
  const nextVersion = latest ? latest?.version + 1 : 1;

  // If active true, deactivate previous active docs for the language
  if (active) {
    await PrivacyPolicyModel.updateMany({ language, active: true }, { $set: { active: false } });
  }

  const created = await PrivacyPolicyModel.create({
    language,
    html: cleaned,
    version: nextVersion,
    active,
    updatedBy: req.user?.id || null,
  });

  res.status(201).json({
    message: req.t ? req.t('PRIVACY_POLICY_UPDATED') : 'Privacy Policy updated successfully',
    success: true,
    privacyPolicy: {
      id: created._id,
      language: created.language,
      version: created.version,
      active: created.active,
      updatedAt: created.updatedAt,
    },
  });
};

export const getPrivacyPolicyHistory = async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || req.language || 'en';

  const all = await PrivacyPolicyModel.find({ language: lang }).sort({ version: -1 }).lean();
  res.json({
    succeess: true,
    data: all.map((t) => ({
      id: t._id,
      language: t.language,
      version: t.version,
      active: t.active,
      updatedBy: t.updatedBy,
      updatedAt: t.updatedAt,
    })),
  });
};