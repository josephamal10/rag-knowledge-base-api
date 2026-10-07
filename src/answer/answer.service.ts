// external modules
import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// utils/helpers
import { CourseId, normalizeCourseId } from '../common/course-id';
import { KB_CATEGORIES, KB_CATEGORY_INFO, KbCategory } from '../common/kb-category';
import { ErrorService } from '../common/error.service';
import { SearchService } from '../search/search.service';
import { VectorStoreQueryResult } from '../vector-store/vector-store.service';
import { CategoryClassifierService } from './category-classifier.service';
import { QuestionScope, QuestionScopeService } from './question-scope.service';

const ANSWER_MODEL_ID = 'gemini-3.1-flash-lite';
const NO_ANSWER = 'NO_ANSWER';                                                   // Sentinel the model returns when context lacks the answer

export type AskResult = {
  answer:             string;
  courseId:           CourseId;
  categories:         KbCategory[];
  needsClarification: boolean;
  scope:              QuestionScope | null;
};

@Injectable()
export class AnswerService {
  private readonly logger = new Logger(AnswerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly errorService: ErrorService,
    private readonly searchService: SearchService,
    private readonly categoryClassifier: CategoryClassifierService,
    private readonly questionScopeService: QuestionScopeService,
  ) {}

  async generateAnswer(question: string, courseId: string): Promise<AskResult> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw this.errorService.invalidRequest('GEMINI_API_KEY is missing in environment');
    }

    let normalizedCourseId: CourseId;
    try {
      normalizedCourseId = normalizeCourseId(courseId);
    } catch {
      throw this.errorService.invalidRequest('courseId is required and must be a valid course id', {
        courseId,
      });
    }

    const classification = await this.categoryClassifier.classify(question);
    const categories = classification.categories;

    if (categories.length === 0) {
      // No category picked: search the whole course first; only ask the caller to
      // narrow down when nothing in the documents answers the question.
      const searchResults = await this.searchService.search(question, 8, {
        courseId: normalizedCourseId,
      });
      const answer = searchResults.length
        ? await this.generateGroundedAnswer(question, searchResults, apiKey)
        : null;

      this.logger.log(
        `Ask unrouted: courseId=${normalizedCourseId} hits=${searchResults.length} ` +
          `answered=${answer !== null} reason=${classification.reason || 'none'}`,
      );
      return {
        answer:             answer ?? this.buildClarifyMessage(),
        courseId:           normalizedCourseId,
        categories:         [],
        needsClarification: answer === null,
        scope:              null,
      };
    }

    if (categories.length === 1) {
      const category = categories[0];
      const scopeResult = await this.questionScopeService.detectScope(question, category);

      if (scopeResult.scope === 'broad') {
        this.logger.log(
          `Ask clarify (broad ${category}) courseId=${normalizedCourseId}: ` +
            `reason=${scopeResult.reason || 'none'}`,
        );
        return {
          answer:             this.buildBroadClarifyMessage(category),
          courseId:           normalizedCourseId,
          categories,
          needsClarification: true,
          scope:              'broad',
        };
      }

      const searchResults = await this.searchService.search(question, 8, {
        courseId: normalizedCourseId,
        category,
      });
      this.logger.log(
        `Ask routed: courseId=${normalizedCourseId} categories=[${category}] ` +
          `scope=specific hits=${searchResults.length}`,
      );
      return {
        answer:             await this.answerOrNoInfo(question, searchResults, apiKey),
        courseId:           normalizedCourseId,
        categories,
        needsClarification: false,
        scope:              'specific',
      };
    }

    const searchResults = await this.searchService.searchAcrossCategories(
      question,
      categories,
      8,
      normalizedCourseId,
    );
    this.logger.log(
      `Ask routed: courseId=${normalizedCourseId} categories=[${categories.join(', ')}] ` +
        `scope=null hits=${searchResults.length}`,
    );
    return {
      answer:             await this.answerOrNoInfo(question, searchResults, apiKey),
      courseId:           normalizedCourseId,
      categories,
      needsClarification: false,
      scope:              null,
    };
  }

  /** Grounded answer, or the standard "no information" reply when the context doesn't cover it. */
  private async answerOrNoInfo(
    question: string,
    searchResults: VectorStoreQueryResult[],
    apiKey: string,
  ): Promise<string> {
    const answer = await this.generateGroundedAnswer(question, searchResults, apiKey);
    return answer ?? "I don't have information about that in the available documents.";
  }

  /** Returns the model's answer, or null when the context does not answer the question. */
  private async generateGroundedAnswer(
    question: string,
    searchResults: VectorStoreQueryResult[],
    apiKey: string,
  ): Promise<string | null> {
    const context = searchResults
      .map((r, idx) => {
        const title = r.metadata?.title ? `Title: ${r.metadata.title}` : '';
        const ruleNumber = r.metadata?.ruleNumber ? `Rule: ${r.metadata.ruleNumber}` : '';
        const header = [`[${idx + 1}]`, ruleNumber, title]
          .filter(Boolean)
          .join('\n');
        return `${header}\n\n${r.text ?? ''}`.trim();
      })
      .join('\n\n---\n\n');

    const prompt = [
      'Answer using ONLY the context below.',
      `If the answer isn't in the context, reply with exactly ${NO_ANSWER} and nothing else.`,
      'Reply in plain, friendly sentences suitable for reading aloud to a caller.',
      'Do not mention the context, excerpt numbers, categories or labels — just give the answer.',
      '',
      'Context:',
      context || '(no relevant context found)',
      '',
      `Question: ${question}`,
    ].join('\n');

    const genAI = new GoogleGenAI({ apiKey });
    const response = await genAI.models.generateContent({
      model:    ANSWER_MODEL_ID,
      contents: prompt,
    });

    const text = (response.text ?? '').trim();
    return !text || text.includes(NO_ANSWER) ? null : text;
  }

  private buildClarifyMessage(): string {
    const labels = KB_CATEGORIES.map((c) => KB_CATEGORY_INFO[c].label);
    const list = `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
    return (
      `I can help with questions about ${list}. ` +
      'What would you like to know?'
    );
  }

  private buildBroadClarifyMessage(category: KbCategory): string {
    return (
      `I can help with ${KB_CATEGORY_INFO[category].label}. ` +
      'What specifically would you like to know?'
    );
  }
}
