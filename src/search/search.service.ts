// external modules
import { Injectable } from '@nestjs/common';

// utils/helpers
import { normalizeCourseId } from '../common/course-id';
import { KbCategory } from '../common/kb-category';
import { ErrorService } from '../common/error.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { VectorStoreQueryResult, VectorStoreService } from '../vector-store/vector-store.service';

export type SearchOptions = {
  courseId: string;                                                              // Required: Upstash namespace
  category?: KbCategory;                                                         // Optional metadata filter inside namespace
};

@Injectable()
export class SearchService {
  constructor(
    private readonly errorService: ErrorService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  async search(
    question: string,
    topK = 3,
    options?: SearchOptions,
  ): Promise<VectorStoreQueryResult[]> {
    if (!question || !question.trim()) {
      return [];
    }
    if (!options?.courseId) {
      throw this.errorService.invalidRequest('courseId is required for search');
    }

    const courseId = normalizeCourseId(options.courseId);
    const category = options?.category;

    // Dense semantic embedding of the full question (Gemini).
    const queryEmbedding = await this.embeddingsService.getEmbedding(
      question,
      'RETRIEVAL_QUERY',
    );

    /*
     * Upstash Hybrid search inside one course namespace:
     * - Namespace = courseId (hard course isolation; known at entry)
     * - Metadata filter = category only (topic within that course)
     * - No question-text region detection — region == courseId on ingest
     */
    const metadataFilter = category ? { category } : undefined;

    const results = await this.vectorStoreService.queryByEmbedding(
      queryEmbedding,
      topK,
      undefined,
      metadataFilter,
      { courseId, queryText: question },
    );

    results.sort((a, b) => {
      const aDistance = a.distance ?? Number.POSITIVE_INFINITY;
      const bDistance = b.distance ?? Number.POSITIVE_INFINITY;
      return aDistance - bDistance;
    });

    return results.slice(0, topK);
  }

  /**
   * Search each category separately within one course namespace, then merge/dedupe.
   */
  async searchAcrossCategories(
    question: string,
    categories: KbCategory[],
    topK = 8,
    courseId: string,
  ): Promise<VectorStoreQueryResult[]> {
    if (!categories.length) {
      return [];
    }

    const perCategoryTopK = Math.max(4, Math.ceil(topK / categories.length));
    const batches = await Promise.all(
      categories.map((category) =>
        this.search(question, perCategoryTopK, { courseId, category }),
      ),
    );

    const byId = new Map<string, VectorStoreQueryResult>();
    for (const batch of batches) {
      for (const hit of batch) {
        const existing = byId.get(hit.id);
        if (!existing) {
          byId.set(hit.id, hit);
          continue;
        }
        const existingDistance = existing.distance ?? Number.POSITIVE_INFINITY;
        const hitDistance = hit.distance ?? Number.POSITIVE_INFINITY;
        if (hitDistance < existingDistance) {
          byId.set(hit.id, hit);
        }
      }
    }

    return [...byId.values()]
      .sort((a, b) => {
        const aDistance = a.distance ?? Number.POSITIVE_INFINITY;
        const bDistance = b.distance ?? Number.POSITIVE_INFINITY;
        return aDistance - bDistance;
      })
      .slice(0, Math.min(12, Math.max(topK, perCategoryTopK * categories.length)));
  }
}
