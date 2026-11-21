import { z } from 'zod';
import { CourseLevel } from '../enums';

export const catalogQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  level: z
    .enum([CourseLevel.BEGINNER, CourseLevel.INTERMEDIATE, CourseLevel.ADVANCED, CourseLevel.ALL])
    .optional(),
  price: z.enum(['ALL', 'FREE', 'PAID']).default('ALL'),
  minRating: z.coerce.number().min(0).max(5).optional(),
  sort: z
    .enum(['POPULAR', 'NEWEST', 'RATING', 'PRICE_ASC', 'PRICE_DESC'])
    .default('POPULAR'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;
