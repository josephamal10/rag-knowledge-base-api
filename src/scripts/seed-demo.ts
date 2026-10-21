/**
 * Load the fictional "demo-club" knowledge base (all five topics) so the project can be tried right away.
 *
 * Usage:
 *   npm run seed                 # replace demo-club's content with the sample documents
 *   npm run seed -- --if-empty   # only seed when demo-club has no rows (used on deploy start-up)
 *
 * Re-seeding is cheap: chunks are identified by a hash of their text, so vectors that already
 * exist in Upstash are kept and not re-embedded.
 */
import { config as loadEnv } from 'dotenv';
import { mkdirSync } from 'fs';
import { join } from 'path';

loadEnv({ path: join(process.cwd(), '.env') });
mkdirSync(join(process.cwd(), 'data'), { recursive: true });                    // SQLite folder (fresh deploys)

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { ChunkingService } from '../chunking/chunking.service';
import { IndexingService } from '../indexing/indexing.service';
import { RulesService } from '../rules/rules.service';
import { DEMO_CLUB_DOCUMENTS } from './seed-data/demo-club';

const COURSE_ID = 'demo-club';

async function main(): Promise<void> {
  const ifEmpty = process.argv.includes('--if-empty');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const rules = app.get(RulesService);
    const existing = await rules.countByCourseId(COURSE_ID);

    if (ifEmpty && existing > 0) {
      console.log(`Seed skipped: ${COURSE_ID} already has ${existing} chunk(s).`);
      return;
    }

    const removed = await rules.deleteByCourseId(COURSE_ID);
    if (removed) {
      console.log(`Removed ${removed} existing ${COURSE_ID} chunk(s).`);
    }

    // Save every chunk first, then index once — reindexing per document would briefly treat the
    // other documents' vectors as orphans, delete them and pay to re-embed them.
    const chunking = app.get(ChunkingService);
    for (const doc of DEMO_CLUB_DOCUMENTS) {
      const chunks = chunking.chunkText(doc.text, 500, 50);
      for (const content of chunks) {
        await rules.addRule({ content, courseId: COURSE_ID, category: doc.category, sourceType: 'text' });
      }
      console.log(`  ${doc.category.padEnd(17)} ${chunks.length} chunk(s)`);
    }

    const indexed = await app.get(IndexingService).reindexAll(COURSE_ID);
    console.log(
      `Done. ${COURSE_ID} is ready — embedded ${indexed.added} new, reused ${indexed.skipped}, ` +
        `removed ${indexed.deleted} stale vector(s).`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
