// external modules
import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

// utils/helpers
import { ErrorService } from '../common/error.service';
import { KbCategory } from '../common/kb-category';

const SCOPE_MODEL_ID = 'gemini-3.1-flash-lite';

export const QuestionScopeSchema = z.enum(['broad', 'specific']);
export type QuestionScope = z.infer<typeof QuestionScopeSchema>;

const ScopeResponseSchema = z.object({
  scope:  z.string(),
  reason: z.string().optional(),
});

export type ScopeClassification = {
  scope:  QuestionScope;
  reason: string;
};

@Injectable()
export class QuestionScopeService {
  private readonly logger = new Logger(QuestionScopeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly errorService: ErrorService,
  ) {}

  /**
   * Decide if a single-category question is a whole-policy overview (broad)
   * or a concrete detail ask (specific). On failure, defaults to specific.
   */
  async detectScope(
    question: string,
    category: KbCategory,
  ): Promise<ScopeClassification> {
    const trimmed = question?.trim();
    if (!trimmed) {
      throw this.errorService.invalidRequest('question is required for scope detection');
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw this.errorService.invalidRequest('GEMINI_API_KEY is missing in environment');
    }

    const genAI = new GoogleGenAI({ apiKey });
    const prompt = this.buildPrompt(trimmed, category);

    try {
      const response = await genAI.models.generateContent({
        model:    SCOPE_MODEL_ID,
        contents: prompt,
      });

      return this.parseScope(response.text ?? '');
    } catch (err) {
      console.error('Scope detection failed; defaulting to specific:', err);
      return { scope: 'specific', reason: 'scope_detection_error' };
    }
  }

  /** Approved Step 4 prompt; category injected dynamically. */
  buildPrompt(question: string, category: KbCategory): string {
    return [
      'You decide if a user question about ONE known policy category is BROAD or SPECIFIC.',
      '',
      `Category in focus: ${category}`,
      '',
      'Definitions:',
      '- BROAD: asks for the whole policy, a general overview, or "what is / tell me about" this policy with no concrete detail (section, fee, rule, date, condition, eligibility, etc.).',
      '- SPECIFIC: asks about a particular fact, section, rule, rate, eligibility, scenario, or detail within that policy.',
      '',
      'Return ONLY valid JSON. No markdown.',
      'Shape: {"scope":"broad"|"specific","reason":"short explanation"}',
      '',
      'Rules:',
      '1. Prefer "specific" when any concrete detail is present.',
      '2. Prefer "broad" for overview / whole-document asks.',
      '3. If unsure, choose "specific" (better to answer than over-clarify).',
      '',
      'User question:',
      '"""',
      question,
      '"""',
    ].join('\n');
  }

  parseScope(rawText: string): ScopeClassification {
    const jsonText = this.extractJsonObject(rawText);
    if (!jsonText) {
      this.logger.warn(`Scope classifier non-JSON; defaulting to specific. raw=${rawText.slice(0, 200)}`);
      return { scope: 'specific', reason: 'invalid_json' };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      this.logger.warn(`Scope JSON parse failed; defaulting to specific. raw=${rawText.slice(0, 200)}`);
      return { scope: 'specific', reason: 'invalid_json' };
    }

    const parsed = ScopeResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.logger.warn('Scope JSON shape invalid; defaulting to specific');
      return { scope: 'specific', reason: 'invalid_shape' };
    }

    const scope = QuestionScopeSchema.safeParse(parsed.data.scope);
    if (!scope.success) {
      this.logger.warn(`Unknown scope value '${parsed.data.scope}'; defaulting to specific`);
      return { scope: 'specific', reason: 'invalid_scope' };
    }

    return {
      scope:  scope.data,
      reason: parsed.data.reason?.trim() || '',
    };
  }

  private extractJsonObject(rawText: string): string | null {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return null;
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    return trimmed.slice(start, end + 1);
  }
}
