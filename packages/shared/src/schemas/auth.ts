import { z } from 'zod';

export const companySlug = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and dashes');

export const loginSchema = z.object({
  slug: companySlug,
  username: z.string().trim().min(1, 'Enter your username').max(60),
  password: z.string().min(1, 'Enter your password').max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
