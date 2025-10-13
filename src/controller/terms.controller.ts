import { Request, Response } from 'express';
import createError from 'http-errors';
import TermsModel from '../models/Terms';
import { sanitize } from '../utils/sanitizeHTML';

export const getTerms = async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || req.language || req.i18n?.language || 'en';
  if (lang && ['en', 'ar'].includes(lang)) {
    req.language = lang;
    if (req?.i18n && typeof req.i18n.changeLanguage === 'function') {
      await req.i18n.changeLanguage(lang);
    }
  }
  if (!['en', 'ar'].includes(lang)) throw createError(400, req.t('INVALID_LANGUAGE'));

  // prefer the latest active version
  const terms = await TermsModel.findOne({ language: lang, active: true })
    .sort({ version: -1 })
    .lean();
  if (!terms) {
    // optional: fallback to other language or return 404
    return res.status(404).json({ message: req.t('TERMS_NOT_FOUND') });
  }

  res.json({
    language: terms.language,
    html: terms.html, 
    version: terms.version,
    updatedAt: terms.updatedAt,
    success: true,
  });
};

export const upsertTerms = async (req: Request, res: Response) => {
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
  const latest = await TermsModel.findOne({ language }).sort({ version: -1 }).lean();
  const nextVersion = latest ? latest?.version + 1 : 1;

  // If active true, deactivate previous active docs for the language
  if (active) {
    await TermsModel.updateMany({ language, active: true }, { $set: { active: false } });
  }

  const created = await TermsModel.create({
    language,
    html: cleaned,
    version: nextVersion,
    active,
    updatedBy: req.user?.id || null,
  });

  res.status(201).json({
    message: req.t ? req.t('TERMS_UPDATED') : 'Terms and conditions updated successfully',
    success: true,
    terms: {
      id: created._id,
      language: created.language,
      version: created.version,
      active: created.active,
      updatedAt: created.updatedAt,
    },
  });
};

export const getTermsHistory = async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || req.language || 'en';

  const all = await TermsModel.find({ language: lang }).sort({ version: -1 }).lean();
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
