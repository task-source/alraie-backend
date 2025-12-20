import { Request, Response } from 'express';
import createError from 'http-errors';
import AboutUsModel from '../models/aboutUs.model';
import { sanitize } from '../utils/sanitizeHTML';

/**
 * GET /about-us?lang=en
 */
export const getAboutUs = async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || req.language || 'en';

  if (!['en', 'ar'].includes(lang)) {
    throw createError(400, req.t('INVALID_LANGUAGE'));
  }

  const about = await AboutUsModel.findOne({
    language: lang,
    active: true,
  })
    .sort({ version: -1 })
    .lean();

  if (!about) {
    return res.status(404).json({
      success: false,
      message: req.t('ABOUT_US_NOT_FOUND'),
    });
  }

  res.json({
    success: true,
    language: about.language,
    html: about.html,
    version: about.version,
    updatedAt: about.updatedAt,
  });
};

/**
 * POST /about-us/update
 */
export const upsertAboutUs = async (req: Request, res: Response) => {
  const { language, html, active = true } = req.body;

  if (!['en', 'ar'].includes(language)) {
    throw createError(400, req.t('INVALID_LANGUAGE'));
  }

  if (!html) {
    throw createError(400, req.t('HTML_REQUIRED'));
  }

  const cleanedHtml = sanitize(html);

  const latest = await AboutUsModel.findOne({ language })
    .sort({ version: -1 })
    .lean();

  const nextVersion = latest ? latest.version + 1 : 1;

  // deactivate old active versions
  if (active) {
    await AboutUsModel.updateMany(
      { language, active: true },
      { $set: { active: false } },
    );
  }

  const created = await AboutUsModel.create({
    language,
    html: cleanedHtml,
    version: nextVersion,
    active,
    updatedBy: req.user?.id || null,
  });

  res.status(201).json({
    success: true,
    message: req.t('ABOUT_US_UPDATED'),
    aboutUs: {
      id: created._id,
      language: created.language,
      version: created.version,
      active: created.active,
      updatedAt: created.updatedAt,
    },
  });
};

/**
 * GET /about-us/history?lang=en
 */
export const getAboutUsHistory = async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || req.language || 'en';

  if (!['en', 'ar'].includes(lang)) {
    throw createError(400, req.t('INVALID_LANGUAGE'));
  }

  const history = await AboutUsModel.find({ language: lang })
    .sort({ version: -1 })
    .lean();

  res.json({
    success: true,
    data: history.map((a) => ({
      id: a._id,
      version: a.version,
      active: a.active,
      updatedBy: a.updatedBy,
      updatedAt: a.updatedAt,
    })),
  });
};
