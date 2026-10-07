/**
 * Copy vectors from Upstash default namespace ("") → named course namespace
 * WITHOUT re-embedding (reuses dense + sparse vectors).
 *
 * Default namespace is left intact as a backup until you verify search works.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/migrate-default-ns-to-course.ts demo-club
 *
 * Requires .env: UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
 * (GEMINI not required — no re-embed)
 */
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

loadEnv({ path: join(process.cwd(), '.env') });

import 'reflect-metadata';
import { Index } from '@upstash/vector';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { DEFAULT_KB_CATEGORY } from '../common/kb-category';
import { normalizeCourseId } from '../common/course-id';
import { RulesService } from '../rules/rules.service';

const PAGE_SIZE = 100;

type SourceVector = {
  id: string | number;
  vector?: number[];
  sparseVector?: { indices: number[]; values: number[] };
  metadata?: Record<string, unknown>;
  data?: string;
};

async function main(): Promise<void> {
  const targetRaw = process.argv[2];
  if (!targetRaw) {
    throw new Error('Usage: migrate-default-ns-to-course.ts <courseId>');
  }
  const targetCourseId = normalizeCourseId(targetRaw);

  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are required');
  }

  const index = new Index({ url, token });
  const targetNs = index.namespace(targetCourseId);

  console.log(`Source: default namespace ("")`);
  console.log(`Target: namespace "${targetCourseId}"`);
  console.log(`Default namespace will NOT be deleted (backup retained).`);
  console.log('---');

  // Inventory target so we can skip already-copied ids.
  const targetExisting = new Set<string>();
  {
    let cursor: string | number = 0;
    for (;;) {
      const page = await targetNs.range({ cursor, limit: PAGE_SIZE });
      for (const v of page.vectors ?? []) {
        targetExisting.add(String(v.id));
      }
      if (!page.nextCursor || page.nextCursor === '0' || !(page.vectors?.length)) {
        break;
      }
      cursor = page.nextCursor;
    }
  }
  console.log(`Already in "${targetCourseId}": ${targetExisting.size} vector(s)`);

  let scanned = 0;
  let copied = 0;
  let skippedExisting = 0;
  let skippedNoVector = 0;
  let failed = 0;

  let cursor: string | number = 0;
  for (;;) {
    const page = await index.range({
      cursor,
      limit:          PAGE_SIZE,
      includeVectors: true,
      includeMetadata: true,
      includeData:    true,
    });

    const vectors = (page.vectors ?? []) as SourceVector[];
    if (!vectors.length) {
      break;
    }

    for (const item of vectors) {
      scanned += 1;
      const id = String(item.id);

      if (targetExisting.has(id)) {
        skippedExisting += 1;
        continue;
      }

      if (!item.vector?.length) {
        skippedNoVector += 1;
        console.warn(`  skip ${id.slice(0, 12)}… — no dense vector in fetch`);
        continue;
      }

      const meta = { ...(item.metadata ?? {}) } as Record<string, string | number | boolean>;
      meta.courseId = targetCourseId;
      meta.region = targetCourseId;
      if (!meta.category) {
        meta.category = DEFAULT_KB_CATEGORY;
      }

      try {
        const upsertPayload: {
          id: string;
          vector: number[];
          sparseVector?: { indices: number[]; values: number[] };
          data?: string;
          metadata: Record<string, string | number | boolean>;
        } = {
          id,
          vector:   item.vector,
          metadata: meta,
        };

        if (item.sparseVector?.indices?.length) {
          upsertPayload.sparseVector = item.sparseVector;
        }
        if (typeof item.data === 'string') {
          upsertPayload.data = item.data;
        }

        await targetNs.upsert(upsertPayload);
        targetExisting.add(id);
        copied += 1;

        if (copied === 1 || copied % 25 === 0) {
          console.log(`  progress: copied=${copied} scanned=${scanned}`);
        }
      } catch (err) {
        failed += 1;
        console.error(
          `  FAILED id=${id.slice(0, 12)}…`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    if (!page.nextCursor || page.nextCursor === '0') {
      break;
    }
    cursor = page.nextCursor;
  }

  console.log('--- Upstash copy ---');
  console.log(`scanned (default): ${scanned}`);
  console.log(`copied → ${targetCourseId}: ${copied}`);
  console.log(`skipped (already in target): ${skippedExisting}`);
  console.log(`skipped (no dense vector): ${skippedNoVector}`);
  console.log(`failed: ${failed}`);

  // Align SQLite course identity with the target namespace.
  console.log('--- SQLite backfill ---');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const rulesService = app.get(RulesService);

  await rulesService.backfillMissingCategories();
  const courseIdsBefore = await rulesService.getDistinctCourseIds();
  console.log(`Distinct courseIds before: [${courseIdsBefore.join(', ') || '(none)'}]`);

  const aligned = await rulesService.alignAllRowsToCourseId(targetCourseId);
  console.log(`SQLite rows set to courseId/region="${targetCourseId}": ${aligned}`);

  const courseIdsAfter = await rulesService.getDistinctCourseIds();
  console.log(`Distinct courseIds after: [${courseIdsAfter.join(', ') || '(none)'}]`);

  await app.close();

  console.log('---');
  console.log('Done. Verify with:');
  console.log(`  POST /ask  { "question": "...", "courseId": "${targetCourseId}" }`);
  console.log('Default namespace left intact as backup.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
