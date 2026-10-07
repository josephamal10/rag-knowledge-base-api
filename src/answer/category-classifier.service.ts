// external modules
import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

// utils/helpers
import { ErrorService } from '../common/error.service';
import {
  KB_CATEGORIES,
  KB_CATEGORY_INFO,
  KbCategory,
  KbCategorySchema,
} from '../common/kb-category';

const CLASSIFIER_MODEL_ID = 'gemini-3.1-flash-lite';

const ClassifierResponseSchema = z.object({
  categories: z.array(z.string()),
  reason:     z.string().optional(),
});

export type CategoryClassification = {
  categories: KbCategory[];
  reason:     string;
};

@Injectable()
export class CategoryClassifierService {
  private readonly logger = new Logger(CategoryClassifierService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly errorService: ErrorService,
  ) {}

  /**
   * Classify a question against the fixed KB category taxonomy.
   * Returns 0, 1, or many categories. On parse/API failure, returns [] (treat as vague).
   */
  async classify(question: string): Promise<CategoryClassification> {
    const trimmed = question?.trim();
    if (!trimmed) {
      throw this.errorService.invalidRequest('question is required for classification');
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw this.errorService.invalidRequest('GEMINI_API_KEY is missing in environment');
    }

    const genAI = new GoogleGenAI({ apiKey });
    const prompt = this.buildPrompt(trimmed);

    try {
      const response = await genAI.models.generateContent({
        model:    CLASSIFIER_MODEL_ID,
        contents: prompt,
      });

      return this.parseClassification(response.text ?? '');
    } catch (err) {
      console.error('Category classification failed; treating as vague (no categories):', err);
      return { categories: [], reason: 'classification_error' };
    }
  }

  /** Builds the approved classifier prompt; category list comes from KB_CATEGORIES. */
  buildPrompt(question: string): string {
    const allowedList = KB_CATEGORIES.map(
      (c) => `- ${c}: ${KB_CATEGORY_INFO[c].description}`,
    ).join('\n');

    return [
      'You are a category classifier for a voice-bot knowledge base.',
      '',
      'Your ONLY job: decide which of the allowed categories the user\'s question relates to.',
      'Do NOT answer the user\'s question. Do NOT invent categories.',
      '',
      'Allowed categories (use the exact id before the colon; the text after it describes what it covers):',
      allowedList,
      '',
      'Rules:',
      '1. Return ONLY valid JSON. No markdown. No extra text.',
      '2. Shape: {"categories":["..."],"reason":"short explanation"}',
      '3. "categories" must be a subset of the allowed ids (0, 1, or many).',
      '4. Use [] only when there is no concrete question at all',
      '   (e.g. "hi", "help", "what can you do?", "tell me everything").',
      '5. Use exactly one category when the question clearly targets one category.',
      '6. If a concrete question could plausibly belong to more than one category, return all',
      '   plausible ones (up to 3) instead of [] — the search covers each of them.',
      '7. Match on meaning, not exact keywords (synonyms / paraphrases count).',
      '',
      'User question:',
      '"""',
      question,
      '"""',
    ].join('\n');
  }

  /** Parse model text → validated KbCategory[]; unknown labels dropped; junk → []. */
  parseClassification(rawText: string): CategoryClassification {
    const jsonText = this.extractJsonObject(rawText);
    if (!jsonText) {
      this.logger.warn(`Classifier returned non-JSON; treating as vague. raw=${rawText.slice(0, 200)}`);
      return { categories: [], reason: 'invalid_json' };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      this.logger.warn(`Classifier JSON parse failed; treating as vague. raw=${rawText.slice(0, 200)}`);
      return { categories: [], reason: 'invalid_json' };
    }

    const parsed = ClassifierResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.logger.warn('Classifier JSON shape invalid; treating as vague');
      return { categories: [], reason: 'invalid_shape' };
    }

    const categories: KbCategory[] = [];
    for (const value of parsed.data.categories) {
      const category = KbCategorySchema.safeParse(value);
      if (category.success && !categories.includes(category.data)) {
        categories.push(category.data);
      }
    }

    return {
      categories,
      reason: parsed.data.reason?.trim() || '',
    };
  }

  private extractJsonObject(rawText: string): string | null {
    const trimmed = rawText.trim();
    if (!trimmed) {
      return null;
    }

    // Prefer fenced ```json ... ``` if the model ignores "no markdown".
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
