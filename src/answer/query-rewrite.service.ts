// external modules
import { GoogleGenAI } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// utils/helpers
import type { ChatTurn } from './answer.service';

const REWRITE_MODEL_ID = 'gemini-3.1-flash-lite';
const MAX_TURNS = 6;                                                             // Only recent context matters for follow-ups
const MAX_TURN_CHARS = 500;

/**
 * Conversation memory without server-side sessions: the client sends recent turns, and a
 * follow-up ("and check-out?") is rewritten into a standalone question before routing/search.
 */
@Injectable()
export class QueryRewriteService {
  private readonly logger = new Logger(QueryRewriteService.name);

  constructor(private readonly configService: ConfigService) {}

  async rewrite(question: string, history: ChatTurn[]): Promise<string> {
    const recent = history.slice(-MAX_TURNS);
    if (!recent.length) {
      return question;
    }

    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      return question;
    }

    try {
      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model:    REWRITE_MODEL_ID,
        contents: this.buildPrompt(question, recent),
      });
      const rewritten = this.clean(response.text ?? '');
      if (rewritten && rewritten !== question) {
        this.logger.log(`Rewrote follow-up: "${question}" → "${rewritten}"`);
      }
      return rewritten || question;
    } catch (err) {
      this.logger.warn(`Query rewrite failed; using original question: ${err instanceof Error ? err.message : err}`);
      return question;
    }
  }

  buildPrompt(question: string, history: ChatTurn[]): string {
    const transcript = history
      .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content.slice(0, MAX_TURN_CHARS)}`)
      .join('\n');

    return [
      'Decide whether the follow-up can be understood on its own.',
      '- If it CAN (it is a complete question, even about a different topic), return it EXACTLY unchanged.',
      '  Never add details from the conversation to a question that is already complete.',
      '- Only if it CANNOT (a fragment like "and check-out?", or it uses "it", "that", "there", "those"),',
      '  rewrite it into a standalone question using the conversation.',
      'Do NOT answer it. Return ONLY the question — no quotes, no explanation.',
      '',
      'Examples:',
      '  Conversation about check-in time. Follow-up: "and check-out?" → "What time is check-out?"',
      '  Conversation about weekend golf fees. Follow-up: "Can I bring my dog?" → "Can I bring my dog?"',
      '  Conversation about the banquet hall. Follow-up: "how much does it cost?" → "How much does the banquet hall cost?"',
      '',
      'Conversation:',
      transcript,
      '',
      `Follow-up: ${question}`,
    ].join('\n');
  }

  /** Strip quotes / prefixes the model sometimes adds; reject anything that looks like an answer essay. */
  clean(raw: string): string {
    const text = raw
      .trim()
      .replace(/^(rewritten question|question)\s*:\s*/i, '')
      .replace(/^["'“”]+|["'“”]+$/g, '')
      .trim();
    return text.length > 0 && text.length <= 400 ? text : '';
  }
}
