/**
 * One-time migration: SQLite rules → Upstash Vector (Hybrid), per course namespace.
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/migrate-to-upstash.ts [courseId]
 *
 * If courseId is omitted, migrates each distinct courseId found in SQLite.
 * Requires .env: GEMINI_API_KEY, UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
 */
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

loadEnv({ path: join(process.cwd(), '.env') });

import 'reflect-metadata';
import { createHash } from 'crypto';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { normalizeCourseId } from '../common/course-id';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RulesService } from '../rules/rules.service';
import { VectorStoreService } from '../vector-store/vector-store.service';

async function migrateCourse(
  courseId: string,
  rulesService: RulesService,
  embeddingsService: EmbeddingsService,
  vectorStoreService: VectorStoreService,
): Promise<void> {
  const normalized = normalizeCourseId(courseId);
  const rules = await rulesService.getRulesByCourseId(normalized);
  console.log(`\nMigrating courseId=${normalized}: ${rules.length} SQLite rules → Upstash…`);

  const existingIds = new Set(await vectorStoreService.getAllChunkIds(normalized));
  console.log(`Already in namespace: ${existingIds.size} ids (will skip)`);

  const seen = new Set<string>();
  let migrated = 0;
  let skippedExisting = 0;
  let skippedDup = 0;
  let failed = 0;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 5): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1));
        console.warn(`  retry ${attempt}/${attempts} ${label}: ${err instanceof Error ? err.message : err}`);
        await sleep(delay);
      }
    }
    throw lastErr;
  }

  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    const id = createHash('sha256').update(rule.content).digest('hex');

    if (seen.has(id)) {
      skippedDup += 1;
      continue;
    }
    seen.add(id);

    if (existingIds.has(id)) {
      skippedExisting += 1;
      continue;
    }

    try {
      const embedding = await withRetry(
        () => embeddingsService.getEmbedding(rule.content, 'RETRIEVAL_DOCUMENT'),
        `embed ${id.slice(0, 12)}`,
      );
      await withRetry(
        () =>
          vectorStoreService.upsertChunk({
            courseId: normalized,
            id,
            embedding,
            text: rule.content,
            metadata: {
              ruleId:     rule.id,
              region:     rule.region,
              courseId:   rule.courseId,
              category:   rule.category,
              ruleNumber: rule.ruleNumber ?? '',
              title:      rule.title ?? '',
              sourceType: rule.sourceType ?? 'document',
            },
          }),
        `upsert ${id.slice(0, 12)}`,
      );
      migrated += 1;
      existingIds.add(id);
      if (migrated % 25 === 0 || migrated === 1) {
        console.log(`  progress: ${migrated} upserted (row ${i + 1}/${rules.length})`);
      }
    } catch (err) {
      failed += 1;
      console.error(`  FAILED id=${id.slice(0, 12)}…`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`--- courseId=${normalized}`);
  console.log(`upserted: ${migrated}`);
  console.log(`skipped (already in Upstash): ${skippedExisting}`);
  console.log(`skipped (duplicate content hash): ${skippedDup}`);
  console.log(`failed: ${failed}`);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const rulesService = app.get(RulesService);
  const embeddingsService = app.get(EmbeddingsService);
  const vectorStoreService = app.get(VectorStoreService);

  await vectorStoreService.initCollection();
  await rulesService.backfillMissingCourseIds();

  const argCourseId = process.argv[2];
  const courseIds = argCourseId
    ? [normalizeCourseId(argCourseId)]
    : await rulesService.getDistinctCourseIds();

  if (!courseIds.length) {
    console.log('No courseIds found in SQLite. Nothing to migrate.');
    await app.close();
    return;
  }

  for (const courseId of courseIds) {
    await migrateCourse(courseId, rulesService, embeddingsService, vectorStoreService);
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
