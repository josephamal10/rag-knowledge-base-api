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
import { QueryRewriteService } from './query-rewrite.service';

const ANSWER_MODEL_ID = 'gemini-3.1-flash-lite';
const NO_ANSWER = 'NO_ANSWER';                                                   // Sentinel the model returns when context lacks the answer
const NO_INFO_MESSAGE = "I don't have information about that in the available documents.";

export type ChatTurn = {
  role:    'user' | 'assistant';
  content: string;
};

/** A retrieved chunk the answer was grounded in (returned so clients can show citations). */
export type AnswerSource = {
  id:       string;
  text:     string;
  category: string | null;
  title:    string | null;
  score:    number | null;
};

export type AskResult = {
  answer:             string;
  courseId:           CourseId;
  categories:         KbCategory[];
  needsClarification: boolean;
  scope:              QuestionScope | null;
  sources:            AnswerSource[];
  standaloneQuestion: string;                                                    // Follow-ups rewritten with history
};

export type AskStreamEvent =
  | { type: 'meta'; courseId: CourseId; categories: KbCategory[]; scope: QuestionScope | null; standaloneQuestion: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; result: AskResult };

/** Either a finished reply (clarification, no hits) or the inputs needed to generate a grounded answer. */
type AnswerPlan =
  | { kind: 'final'; result: AskResult }
  | {
      kind:          'generate';
      base:          Omit<AskResult, 'answer' | 'needsClarification' | 'sources'>;
      searchResults: VectorStoreQueryResult[];
      noAnswer:      { answer: string; needsClarification: boolean };            // Used when the model returns NO_ANSWER
      apiKey:        string;
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
    private readonly queryRewriteService: QueryRewriteService,
  ) {}

  async generateAnswer(question: string, courseId: string, history: ChatTurn[] = []): Promise<AskResult> {
    const plan = await this.plan(question, courseId, history);
    if (plan.kind === 'final') {
      return plan.result;
    }

    const prompt = this.buildPrompt(plan.base.standaloneQuestion, plan.searchResults);
    const genAI = new GoogleGenAI({ apiKey: plan.apiKey });
    const response = await genAI.models.generateContent({ model: ANSWER_MODEL_ID, contents: prompt });

    return this.finish(plan, (response.text ?? '').trim());
  }

  /**
   * Same pipeline as generateAnswer, but the answer text arrives as deltas.
   * Text is held back while it could still be the NO_ANSWER sentinel, so clients never see it.
   */
  async *streamAnswer(
    question: string,
    courseId: string,
    history: ChatTurn[] = [],
  ): AsyncGenerator<AskStreamEvent> {
    const plan = await this.plan(question, courseId, history);
    if (plan.kind === 'final') {
      yield { type: 'meta', ...this.metaOf(plan.result) };
      yield { type: 'delta', text: plan.result.answer };
      yield { type: 'done', result: plan.result };
      return;
    }

    yield {
      type:               'meta',
      courseId:           plan.base.courseId,
      categories:         plan.base.categories,
      scope:              plan.base.scope,
      standaloneQuestion: plan.base.standaloneQuestion,
    };

    const prompt = this.buildPrompt(plan.base.standaloneQuestion, plan.searchResults);
    const genAI = new GoogleGenAI({ apiKey: plan.apiKey });
    const stream = await genAI.models.generateContentStream({ model: ANSWER_MODEL_ID, contents: prompt });

    let full = '';
    let started = false;
    for await (const chunk of stream) {
      const text = chunk.text ?? '';
      full += text;

      if (!started) {
        const lead = full.trimStart();
        if (NO_ANSWER.startsWith(lead) || lead.startsWith(NO_ANSWER)) {
          continue;                                                              // Could still be (or is) the sentinel
        }
        started = true;
        yield { type: 'delta', text: lead };
        continue;
      }
      if (text) {
        yield { type: 'delta', text };
      }
    }

    const result = this.finish(plan, full.trim());
    if (!started) {
      yield { type: 'delta', text: result.answer };
    }
    yield { type: 'done', result };
  }

  /** Validate, rewrite follow-ups, route by topic and retrieve — everything before generation. */
  private async plan(question: string, courseId: string, history: ChatTurn[]): Promise<AnswerPlan> {
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

    // "and check-out?" → "What time is check-out at the lodge?" so routing and search work on follow-ups.
    const standaloneQuestion = history.length
      ? await this.queryRewriteService.rewrite(question, history)
      : question;

    const classification = await this.categoryClassifier.classify(standaloneQuestion);
    const categories = classification.categories;
    const base = { courseId: normalizedCourseId, categories, standaloneQuestion };

    if (categories.length === 0) {
      // No category picked: search the whole course first; only ask the caller to
      // narrow down when nothing in the documents answers the question.
      const searchResults = await this.searchService.search(standaloneQuestion, 8, {
        courseId: normalizedCourseId,
      });
      this.logger.log(
        `Ask unrouted: courseId=${normalizedCourseId} hits=${searchResults.length} ` +
          `reason=${classification.reason || 'none'}`,
      );

      const clarify = { answer: this.buildClarifyMessage(), needsClarification: true };
      if (!searchResults.length) {
        return { kind: 'final', result: { ...base, ...clarify, scope: null, sources: [] } };
      }
      return { kind: 'generate', base: { ...base, scope: null }, searchResults, noAnswer: clarify, apiKey };
    }

    const noInfo = { answer: NO_INFO_MESSAGE, needsClarification: false };

    if (categories.length === 1) {
      const category = categories[0];
      const scopeResult = await this.questionScopeService.detectScope(standaloneQuestion, category);

      if (scopeResult.scope === 'broad') {
        this.logger.log(
          `Ask clarify (broad ${category}) courseId=${normalizedCourseId}: ` +
            `reason=${scopeResult.reason || 'none'}`,
        );
        return {
          kind:   'final',
          result: {
            ...base,
            answer:             this.buildBroadClarifyMessage(category),
            needsClarification: true,
            scope:              'broad',
            sources:            [],
          },
        };
      }

      const searchResults = await this.searchService.search(standaloneQuestion, 8, {
        courseId: normalizedCourseId,
        category,
      });
      this.logger.log(
        `Ask routed: courseId=${normalizedCourseId} categories=[${category}] ` +
          `scope=specific hits=${searchResults.length}`,
      );
      return { kind: 'generate', base: { ...base, scope: 'specific' }, searchResults, noAnswer: noInfo, apiKey };
    }

    const searchResults = await this.searchService.searchAcrossCategories(
      standaloneQuestion,
      categories,
      8,
      normalizedCourseId,
    );
    this.logger.log(
      `Ask routed: courseId=${normalizedCourseId} categories=[${categories.join(', ')}] ` +
        `scope=null hits=${searchResults.length}`,
    );
    return { kind: 'generate', base: { ...base, scope: null }, searchResults, noAnswer: noInfo, apiKey };
  }

  /** Turn the model's raw text into the final result; NO_ANSWER (or empty) falls back to plan.noAnswer. */
  private finish(plan: Extract<AnswerPlan, { kind: 'generate' }>, text: string): AskResult {
    if (!text || text.includes(NO_ANSWER)) {
      return { ...plan.base, ...plan.noAnswer, sources: [] };
    }
    return {
      ...plan.base,
      answer:             text,
      needsClarification: false,
      sources:            plan.searchResults.map((r) => this.toSource(r)),
    };
  }

  private buildPrompt(question: string, searchResults: VectorStoreQueryResult[]): string {
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

    return [
      'Answer using ONLY the context below.',
      `If the answer isn't in the context, reply with exactly ${NO_ANSWER} and nothing else.`,
      `If the message is only a greeting or small talk (not a question), also reply with exactly ${NO_ANSWER}.`,
      'Reply in plain, friendly sentences suitable for reading aloud to a caller.',
      'Do not mention the context, excerpt numbers, categories or labels — just give the answer.',
      '',
      'Context:',
      context || '(no relevant context found)',
      '',
      `Question: ${question}`,
    ].join('\n');
  }

  private toSource(r: VectorStoreQueryResult): AnswerSource {
    const category = r.metadata?.category;
    const title = r.metadata?.title;
    return {
      id:       r.id,
      text:     r.text ?? '',
      category: typeof category === 'string' && category ? category : null,
      title:    typeof title === 'string' && title ? title : null,
      score:    typeof r.score === 'number' ? r.score : null,
    };
  }

  private metaOf(result: AskResult) {
    return {
      courseId:           result.courseId,
      categories:         result.categories,
      scope:              result.scope,
      standaloneQuestion: result.standaloneQuestion,
    };
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
