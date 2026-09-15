import { z } from 'zod';

// bcrypt only uses the first 72 BYTES of a password and silently ignores the rest.
const MAX_PASSWORD_BYTES = 72;

// Normalise first, then validate: "  Alice@Example.com " and "alice@example.com"
// must be treated as the same account.
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Must be a valid email address'));

// In utf-8 not each character is considered one byte for that reason
// we didn't use .length method
const passwordBytesLimit = (value: string) =>
  Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES;

export const registerSchema = z.object({
  body: z.object({
    email: emailField,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .refine(passwordBytesLimit, 'Password must be at most 72 bytes'),
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: emailField,
    password: z
      .string()
      .min(1, 'Password is required')
      .refine(passwordBytesLimit, 'Password must be at most 72 bytes'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];