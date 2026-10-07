// external modules
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

// utils/helpers
import { createHash } from 'crypto';
import { normalizeCourseId } from '../common/course-id';
import { RuleEntity } from '../rules/entities/rule.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { RulesService } from '../rules/rules.service';
import { VectorStoreService } from '../vector-store/vector-store.service';

@Injectable()
export class IndexingService implements OnModuleInit {
  private readonly logger = new Logger(IndexingService.name);

  constructor(
    private readonly rulesService: RulesService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  /** On boot: backfill category + courseId in SQLite; patch metadata per course namespace when possible. */
  async onModuleInit(): Promise<void> {
    try {
      const categoriesBackfilled = await this.rulesService.backfillMissingCategories();
      const coursesBackfilled = await this.rulesService.backfillMissingCourseIds();
      const courseIds = await this.rulesService.getDistinctCourseIds();

      let synced = 0;
      for (const courseId of courseIds) {
        // Vectors may still live in default namespace until Step 4 migration — patch only namespaced data.
        synced += await this.syncMetadataForExistingChunks(courseId);
      }

      if (categoriesBackfilled > 0 || coursesBackfilled > 0 || synced > 0) {
        this.logger.log(
          `Startup sync: categories=${categoriesBackfilled}, courseIds=${coursesBackfilled}, ` +
            `upstashMetadataPatched=${synced}`,
        );
      }
    } catch (err) {
      console.error('Category/course backfill / metadata sync deferred:', err);
    }
  }

  private computeContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private buildRuleMetadata(rule: RuleEntity) {
    return {
      ruleId:     rule.id,
      region:     rule.region,
      courseId:   rule.courseId,
      category:   rule.category,
      ruleNumber: rule.ruleNumber ?? '',
      title:      rule.title ?? '',
      sourceType: rule.sourceType ?? 'document',
    };
  }

  /** Per-course reindex: only SQLite rows + Upstash vectors in that namespace. */
  async reindexAll(courseId: string): Promise<{ skipped: number; added: number; deleted: number }> {
    const normalized = normalizeCourseId(courseId);
    await this.vectorStoreService.initCollection();

    const rules = await this.rulesService.getRulesByCourseId(normalized);

    const expectedIds = new Set<string>();
    const idToRule = new Map<string, (typeof rules)[number]>();

    for (const rule of rules) {
      const contentHash = this.computeContentHash(rule.content);
      expectedIds.add(contentHash);
      if (!idToRule.has(contentHash)) {
        idToRule.set(contentHash, rule);
      }
    }

    const existingIds = await this.vectorStoreService.getAllChunkIds(normalized);
    const existingSet = new Set(existingIds);

    let skipped = 0;
    let added = 0;

    for (const [contentHash, rule] of idToRule.entries()) {
      if (existingSet.has(contentHash)) {
        await this.vectorStoreService.updateChunkMetadata(
          normalized,
          contentHash,
          this.buildRuleMetadata(rule),
        );
        skipped += 1;
        continue;
      }

      const embedding = await this.embeddingsService.getEmbedding(
        rule.content,
        'RETRIEVAL_DOCUMENT',
      );

      await this.vectorStoreService.upsertChunk({
        courseId:  normalized,
        id:        contentHash,
        embedding,
        text:      rule.content,
        metadata:  this.buildRuleMetadata(rule),
      });
      added += 1;
    }

    let deleted = 0;
    for (const existingId of existingIds) {
      if (!expectedIds.has(existingId)) {
        await this.vectorStoreService.deleteChunk(normalized, existingId);
        deleted += 1;
      }
    }

    this.logger.log(
      `Reindex courseId=${normalized}: added=${added} skipped=${skipped} deleted=${deleted}`,
    );

    return { skipped, added, deleted };
  }

  /** Patch metadata on every known content-hash vector in one course namespace. */
  async syncMetadataForExistingChunks(courseId: string): Promise<number> {
    const normalized = normalizeCourseId(courseId);
    await this.vectorStoreService.initCollection();

    const rules = await this.rulesService.getRulesByCourseId(normalized);
    let existingIds: Set<string>;
    try {
      existingIds = new Set(await this.vectorStoreService.getAllChunkIds(normalized));
    } catch (err) {
      this.logger.warn(
        `Metadata sync skipped for courseId=${normalized} (namespace may be empty): ` +
          (err instanceof Error ? err.message : String(err)),
      );
      return 0;
    }

    let patched = 0;
    for (const rule of rules) {
      const contentHash = this.computeContentHash(rule.content);
      if (!existingIds.has(contentHash)) {
        continue;
      }

      await this.vectorStoreService.updateChunkMetadata(
        normalized,
        contentHash,
        this.buildRuleMetadata(rule),
      );
      patched += 1;
    }

    return patched;
  }
}
