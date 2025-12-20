import { Request, Response } from 'express';
import createError from 'http-errors';
import AccountDeletionReason from '../models/accountDeletionReason.model';

/**
 * GET /account-deletion-reasons?lang=en
 * Public – frontend dropdown
 */
export const getDeletionReasons = async (req: Request, res: Response) => {
  const lang = (req.query.lang as string) || req.language || 'en';

  if (!['en', 'ar'].includes(lang)) {
    throw createError(400, req.t('INVALID_LANGUAGE'));
  }

  const reasons = await AccountDeletionReason.find({
    language: lang,
    active: true,
  })
    .sort({ createdAt: 1 })
    .lean();

  res.json({
    success: true,
    data: reasons.map((r) => ({
      id: r._id,
      text: r.text,
    })),
  });
};

/**
 * POST /account-deletion-reasons
 * Admin – create new reason
 */
export const createDeletionReason = async (
  req: Request,
  res: Response,
) => {
  const { language, text, active = true } = req.body;

  if (!['en', 'ar'].includes(language)) {
    throw createError(400, req.t('INVALID_LANGUAGE'));
  }

  const created = await AccountDeletionReason.create({
    language,
    text,
    active,
  });

  res.status(201).json({
    success: true,
    message: req.t('DELETION_REASON_CREATED'),
    reason: {
      id: created._id,
      language: created.language,
      text: created.text,
      active: created.active,
    },
  });
};

/**
 * GET /account-deletion-reasons/admin?lang=en
 * Admin list (includes inactive)
 */
export const getDeletionReasonsAdmin = async (
  req: Request,
  res: Response,
) => {
  const lang = (req.query.lang as string) || 'en';

  const reasons = await AccountDeletionReason.find({ language: lang })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: reasons,
  });
};

/**
 * PATCH /account-deletion-reasons/:id
 * Enable / disable
 */
export const toggleDeletionReason = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;
  const { active } = req.body;

  const updated = await AccountDeletionReason.findByIdAndUpdate(
    id,
    { active },
    { new: true },
  );

  if (!updated) {
    throw createError(404, 'Reason not found');
  }

  res.json({
    success: true,
    message: req.t('DELETION_REASON_UPDATED'),
  });
};

export const deleteDeletionReason = async (
  req: Request,
  res: Response,
) => {
  const { id } = req.params;

  const deleted = await AccountDeletionReason.findByIdAndDelete(id);

  if (!deleted) {
    throw createError(404, 'Deletion reason not found');
  }

  res.json({
    success: true,
    message: req.t('DELETION_REASON_DELETED'),
  });
};