import { RequestHandler } from 'express';
import { z, ZodType } from 'zod';
import createError from 'http-errors';

export const signupSchema = z.object({
  accountType: z.enum(['email', 'phone']),
  role: z.enum(['assistant', 'owner', 'admin', 'superadmin']).default('owner'),
  animalType: z.enum(['farm', 'pet']).optional(),
  language: z.enum(['en', 'ar']).default('en'),
  email: z.email().optional(),
  phone: z.string().optional(), // can add regex for phone validation
  password: z.string().min(6).optional(),
});

export const loginSchema = z.object({
  accountType: z.enum(['email', 'phone']),
  language: z.enum(['en', 'ar']).default('en'),
  email: z.email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string('Old Password is required'),
  newPassword: z
    .string('New password is required')
    .min(6, 'New password must be at least 6 characters.')
    .refine((val) => /[A-Z]/.test(val) && /\d/.test(val), {
      message: 'Password must include at least one uppercase letter and one number.',
    }),
});

export const upsertTermsSchema = z.object({
  language: z.enum(['en', 'ar']),
  html: z.string().min(1, 'HTML content is required'),
  active: z.boolean().optional().default(true),
});

export const addAssistantSchema = z.object({
  accountType: z.enum(['email', 'phone'], 'account_type_required'),
  email: z.email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
  language: z.enum(['en', 'ar']).optional(), // optional, will inherit from owner if missing
});

export const userListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 1))
    .refine((v) => v > 0, { message: 'Page must be greater than 0' }),

  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 10))
    .refine((v) => v > 0 && v <= 100, { message: 'Limit must be between 1 and 100' }),

  role: z.enum(['owner', 'assistant', 'admin', 'superadmin']).optional(),
  search: z.string().optional(),
});

export const createAnimalTypeSchema = z.object({
    name_en: z.string('English name is required').min(1),
    name_ar: z.string('Arabic name is required').min(1),
    key: z.string().min(1),
    category: z.enum(['farm', 'pet']),
});

export const updateAnimalTypeSchema = z.object({
    name_en: z.string().optional(),
    name_ar: z.string().optional(),
    category: z.enum(['farm', 'pet']).optional(),
});

export const validate = <T>(schema: ZodType<T>): RequestHandler => {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return next(createError(400, result.error.issues.map((e) => e.message).join(', ')));
    }

    req.body = result.data;
    next();
  };
};
