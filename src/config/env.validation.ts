// external modules
import { z } from 'zod';

export const envValidationSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),

  UPSTASH_VECTOR_REST_URL:   z.string().url(),
  UPSTASH_VECTOR_REST_TOKEN: z.string().min(1),

  // Must match the dense dimension of the Upstash Hybrid index (default 1536).
  EMBEDDING_DIMENSION: z.coerce.number().int().positive().default(1536),

  PORT: z.coerce.number().int().optional(),

  // --- Public deployment safety (all optional; unset = open local development) ---
  // Required in the x-admin-key header for ingest / edit / delete / reindex when set.
  ADMIN_API_KEY: z.string().optional(),
  // Requests allowed per client IP per minute (applies to all API routes).
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  // Comma-separated frontend origins allowed by CORS.
  CORS_ORIGIN: z.string().optional(),
  // "true" behind a reverse proxy (Render, nginx) so rate limiting sees the real client IP.
  TRUST_PROXY: z.string().optional(),
});

export type EnvValidation = z.infer<typeof envValidationSchema>;
