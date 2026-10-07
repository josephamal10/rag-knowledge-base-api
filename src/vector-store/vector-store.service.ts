// external modules
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FusionAlgorithm, Index, WeightingStrategy } from '@upstash/vector';

// utils/helpers
import { CourseId, normalizeCourseId } from '../common/course-id';
import { ErrorService } from '../common/error.service';
import { textToSparseVector } from './sparse-encoder';

export type VectorStoreMetadata = Record<string, string | number | boolean | null>;

export type VectorStoreQueryResult = {
  distance?: number;                                                             // 1 - score (lower = closer; kept for sort compat)
  id: string;
  metadata?: VectorStoreMetadata;
  score?: number;                                                                // Upstash similarity score (0–1, higher = better)
  text?: string;
};

export type VectorQueryOptions = {
  courseId: string;                                                              // Required: Upstash namespace (= course)
  filter?: string;                                                               // Upstash metadata filter expression
  queryText?: string;                                                            // Raw text for sparse/keyword hybrid arm
};

@Injectable()
export class VectorStoreService implements OnModuleInit {
  private readonly logger = new Logger(VectorStoreService.name);
  private readonly index: Index;

  constructor(
    private readonly configService: ConfigService,
    private readonly errorService: ErrorService,
  ) {
    const url = this.configService.get<string>('UPSTASH_VECTOR_REST_URL');
    const token = this.configService.get<string>('UPSTASH_VECTOR_REST_TOKEN');
    if (!url || !token) {
      throw this.errorService.invalidRequest(
        'UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are required',
      );
    }

    this.index = new Index({ url, token });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.initCollection();
    } catch (err) {
      console.error('Upstash Vector init deferred until first use:', err);
    }
  }

  /** Verifies connectivity / hybrid index shape (no local server to start). */
  async initCollection(): Promise<void> {
    const info = (await this.index.info()) as {
      indexType?: string;
      dimension?: number;
      vectorCount?: number;
    };
    this.logger.log(
      `Upstash ready: type=${info.indexType ?? 'unknown'} dim=${info.dimension} vectors=${info.vectorCount}`,
    );
    if (info.indexType && info.indexType !== 'HYBRID') {
      this.logger.warn(
        'Index is not HYBRID — create a Hybrid index in the Upstash console for dense+sparse search',
      );
    }
  }

  /** Resolve courseId → namespaced index client (same hybrid index, partitioned). */
  private ns(courseId: string) {
    let normalized: CourseId;
    try {
      normalized = normalizeCourseId(courseId);
    } catch {
      throw this.errorService.invalidRequest('courseId is invalid', { courseId });
    }
    return this.index.namespace(normalized);
  }

  async upsertChunk(args: {
    courseId: string;
    id: string;
    embedding: number[];
    metadata?: VectorStoreMetadata;
    text: string;
  }): Promise<void> {
    if (!args.id) {
      throw this.errorService.invalidRequest('Vector id is required');
    }
    if (!args.embedding?.length) {
      throw this.errorService.invalidRequest('Vector embedding is required');
    }

    // Dense = Gemini embedding; sparse = hashed TF keyword vector; data = raw text for includeData.
    const sparseVector = textToSparseVector(args.text);
    const metadata = this.sanitizeMetadata(args.metadata);

    await this.ns(args.courseId).upsert({
      id:           args.id,
      vector:       args.embedding,
      sparseVector,
      data:         args.text,
      metadata,
    });
  }

  async deleteChunk(courseId: string, id: string): Promise<void> {
    if (!id) {
      throw this.errorService.invalidRequest('Vector id is required');
    }
    await this.ns(courseId).delete(id);
  }

  /** Patch metadata only (no re-embed) — used when backfilling category on existing vectors. */
  async updateChunkMetadata(
    courseId: string,
    id: string,
    metadata: VectorStoreMetadata,
  ): Promise<void> {
    if (!id) {
      throw this.errorService.invalidRequest('Vector id is required');
    }

    await this.ns(courseId).update({
      id,
      metadata:           this.sanitizeMetadata(metadata),
      metadataUpdateMode: 'OVERWRITE',
    });
  }

  /**
   * Hybrid query inside one course namespace.
   * Optional metadata `filter` (e.g. category) is applied by Upstash, not client-side.
   */
  async queryByEmbedding(
    embedding: number[],
    topK: number,
    whereDocumentContains?: string,
    whereMetadata?: Record<string, string | number | boolean>,
    options?: VectorQueryOptions,
  ): Promise<VectorStoreQueryResult[]> {
    if (!embedding?.length) {
      throw this.errorService.invalidRequest('Vector embedding is required');
    }
    if (!Number.isInteger(topK) || topK < 1) {
      throw this.errorService.invalidRequest('topK must be a positive integer');
    }
    if (!options?.courseId) {
      throw this.errorService.invalidRequest('courseId is required for vector query');
    }

    const queryText =
      options?.queryText?.trim() ||
      whereDocumentContains?.trim() ||
      '';

    const sparseVector = textToSparseVector(
      queryText || 'golf rules',                                                 // Fallback sparse probe if no text
    );

    const filter =
      options?.filter?.trim() ||
      this.buildMetadataFilter(whereMetadata) ||
      undefined;

    const results = await this.ns(options.courseId).query({
      vector:             embedding,
      sparseVector,
      topK,
      includeMetadata:    true,
      includeData:        true,
      filter,
      // RRF fuses dense semantic ranks with sparse keyword ranks into one list.
      fusionAlgorithm:    FusionAlgorithm.RRF,
      // IDF boosts rare terms (e.g. "17.1b") when matching sparse dimensions.
      weightingStrategy:  WeightingStrategy.IDF,
    });

    return results.map((row) => ({
      id:       String(row.id),
      text:     row.data ?? undefined,
      metadata: (row.metadata as VectorStoreMetadata | undefined) ?? undefined,
      score:    row.score,
      distance: typeof row.score === 'number' ? 1 - row.score : undefined,
    }));
  }

  async getAllChunkIds(courseId: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | number = 0;
    const ns = this.ns(courseId);

    // Paginate with range() — Upstash has no single "get all ids" like Chroma.
    for (;;) {
      const page = await ns.range({
        cursor,
        limit: 1000,
      });
      for (const vector of page.vectors ?? []) {
        ids.push(String(vector.id));
      }
      if (!page.nextCursor || page.nextCursor === '0' || !(page.vectors?.length)) {
        break;
      }
      cursor = page.nextCursor;
    }

    return ids;
  }

  private sanitizeMetadata(
    metadata?: VectorStoreMetadata,
  ): Record<string, string | number | boolean> {
    const cleaned: Record<string, string | number | boolean> = {};
    if (!metadata) {
      return cleaned;
    }
    for (const [key, value] of Object.entries(metadata)) {
      if (value === null || value === undefined) {
        cleaned[key] = '';
        continue;
      }
      cleaned[key] = value;
    }
    return cleaned;
  }

  private buildMetadataFilter(
    whereMetadata?: Record<string, string | number | boolean>,
  ): string | undefined {
    if (!whereMetadata) {
      return undefined;
    }
    const parts: string[] = [];
    for (const [key, value] of Object.entries(whereMetadata)) {
      if (typeof value === 'string') {
        const escaped = value.replace(/'/g, "\\'");
        parts.push(`${key} = '${escaped}'`);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        parts.push(`${key} = ${value}`);
      }
    }
    return parts.length ? parts.join(' AND ') : undefined;
  }
}
