// external modules
import { z } from 'zod';

/**
 * Course identity = Upstash namespace name.
 * Known at entry (phone → courseId later); never inferred from question text.
 */
export const CourseIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9][a-z0-9_-]*$/,
    'courseId must be lowercase alphanumeric, starting with a letter/digit (a-z0-9_-)',
  );

export type CourseId = z.infer<typeof CourseIdSchema>;

/** Normalize + validate; throws via Zod safeParse result for callers to handle. */
export function normalizeCourseId(raw: string): CourseId {
  return CourseIdSchema.parse(raw.trim().toLowerCase());
}

export function tryNormalizeCourseId(raw: unknown): CourseId | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const parsed = CourseIdSchema.safeParse(raw.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}
