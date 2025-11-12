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
  countryCode:z.string().optional(),
});

export const loginSchema = z.object({
  accountType: z.enum(['email', 'phone']),
  language: z.enum(['en', 'ar']).default('en'),
  email: z.email().optional(),
  fullPhone: z.string().optional(),
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

export const updateProfileSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    gender: z.enum(['male', 'female', 'unknown']).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    countryCode: z.string().optional(),
    language: z.enum(['en', 'ar']).optional(),
    animalType: z.enum(['farm', 'pet']).optional(),
    // Do NOT allow role/ownerId/assistantIds/update of tokens through this endpoint
  })
  .refine(
    (data) => {
      // If phone is present, require countryCode as well and vice versa
      if (data.phone && !data.countryCode) return false;
      if (data.countryCode && !data.phone) return false;
      return true;
    },
    {
      message: 'Both phone and countryCode are required when updating phone.',
    },
  );

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
  countryCode:z.string().optional(),
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

// animal type
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

// add animal
export const createAnimalSchema =  z.object({
    ownerId: z.string().optional(), // admin only may pass
    typeKey: z.string().min(1),
    name: z.string().optional(),
    gender: z.enum(["male", "female", "unknown"]).optional(),
    dob: z.string().optional(), // ISO date string
    animalStatus: z.enum(["active", "sold", "dead", "transferred"]).optional(),
    breedKey: z.string().optional(),
    country: z.string().optional(),
    fatherName: z.string().optional(),
    motherName: z.string().optional(),
    relations: z.array(z.object({
      relation: z.enum(["father","mother","sibling"]),
      uniqueAnimalId: z.string().min(1),
    })).optional(),
    hasVaccinated: z.coerce.boolean().optional(),
    reproductiveStatus: z.enum(["race","production","beauty","surrogate","other"]).optional(),
    tagId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional()
    // profilePicture will be a file in multipart; not in body
  });

export const updateAnimalSchema = z.object({
    typeKey: z.string().optional(),
    name: z.string().optional(),
    gender: z.enum(["male", "female", "unknown"]).optional(),
    dob: z.string().optional(),
    animalStatus: z.enum(["active", "sold", "dead", "transferred"]).optional(),
    breedKey: z.string().optional(),
    country: z.string().optional(),
    fatherName: z.string().optional(),
    motherName: z.string().optional(),
    relations: z.array(z.object({
      relation: z.enum(["father","mother","sibling"]),
      uniqueAnimalId: z.string().min(1),
    })).optional(),
    hasVaccinated: z.coerce.boolean().optional(),
    replaceImages: z.coerce.boolean().optional(),
    imagesToDelete: z.union([
      z.array(z.string()),
      z.string().optional(),
    ]).optional(),
    reproductiveStatus: z.enum(["race","production","beauty","surrogate","other"]).optional(),
    tagId: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    ownerId: z.string().optional() // only admin can change if required
  });

export const listAnimalsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.string().optional(),
    typeKey: z.string().optional(),
    ownerId: z.string().optional(),
    search: z.string().optional(),
  })
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  })
});

//add geofence
export const createGeofenceSchema = z.object({
    ownerId: z.string().optional(),
    name: z.string().min(2),
    center: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    radiusKm: z.number().min(0.1),
  });

export const updateGeofenceSchema =z.object({
      name: z.string().optional(),
      center: z.object({
        lat: z.number(),
        lng: z.number(),
      }).optional(),
      radiusKm: z.number().min(0.1).optional()
 });

 export const linkAnimalSchema = z.object({
    uniqueAnimalId: z.string().min(1)
});


//breed
export const createBreedSchema = z.object({
    key: z.string().min(1, 'Key is required').transform((s) => s.toLowerCase().trim()),
    name_en: z.string().min(1, 'English name is required'),
    name_ar: z.string().min(1, 'Arabic name is required'),
    animalTypeKey: z.string().min(1, 'animalTypeKey is required'),
    category: z.enum(['farm', 'pet']),
    
    metadata: z.record(z.string(),z.any()).optional(),
});

export const updateBreedSchema = z.object({
    name_en: z.string().min(1).optional(),
    name_ar: z.string().min(1).optional(),
    animalTypeKey: z.string().min(1).optional(),
    category: z.enum(['farm', 'pet']).optional(),
    metadata: z.record(z.string(),z.any()).optional(),
});

//slides
export const createSlideSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
});

export const updateSlideSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  isActive: z.string().optional(),
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
