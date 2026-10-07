// external modules
import { z } from 'zod';

/**
 * Fixed KB category taxonomy (not free text).
 */
export const KB_CATEGORIES = [
  'golf-rules',
  'lodging-info',
  'events-info',
  'contact-info',
  'real-estate-info',
] as const;

export type KbCategory = (typeof KB_CATEGORIES)[number];

export const KbCategorySchema = z.enum(KB_CATEGORIES);

/**
 * Human-readable label (used in clarification replies) and a description the
 * classifier reads so it can route on meaning rather than the bare slug.
 */
export const KB_CATEGORY_INFO: Record<KbCategory, { label: string; description: string }> = {
  'golf-rules': {
    label:       'golf and course rules',
    description: 'Playing golf and using the grounds: course rules, tee times, green fees and rates, ' +
      'golf carts, dress code, course conditions and closures, practice range, etiquette, ' +
      'pets and walking trails on the property.',
  },
  'lodging-info': {
    label:       'lodging',
    description: 'Staying overnight: rooms, suites, RV sites, check-in and check-out, amenities, ' +
      'stay-and-play packages, lodging rates, pet policy for accommodation.',
  },
  'events-info': {
    label:       'events',
    description: 'Tournaments, weddings, corporate events, banquets, seasonal events and private bookings.',
  },
  'contact-info': {
    label:       'contact details',
    description: 'Phone numbers, email, address, directions, opening hours and who to contact.',
  },
  'real-estate-info': {
    label:       'real estate',
    description: 'Homes, lots and property for sale or rent in or near the community, HOA and buying process.',
  },
};

/**
 * Used only for legacy SQLite/Upstash backfill when category is missing.
 * New ingest always requires an explicit category (no silent default on APIs).
 */
export const DEFAULT_KB_CATEGORY: KbCategory = 'golf-rules';
