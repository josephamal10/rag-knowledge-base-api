// external modules
import { z } from 'zod';

export const envValidationSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),

  UPSTASH_VECTOR_REST_URL:   z.string().url(),
  UPSTASH_VECTOR_REST_TOKEN: z.string().min(1),

  // Must match the dense dimension of the Upstash Hybrid index (default 1536).
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1536),

  PORT: z.coerce.number().int().optional(),
});

export type EnvValidation = z.infer<typeof envValidationSchema>;
