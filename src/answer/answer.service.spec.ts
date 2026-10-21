import { BadRequestException } from '@nestjs/common';

import { ErrorService } from '../common/error.service';
import { AnswerService, AskStreamEvent } from './answer.service';

// Gemini is replaced by controllable fakes (names must start with "mock" for jest.mock hoisting).
const mockGenerate = jest.fn();
const mockStream = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerate, generateContentStream: mockStream },
  })),
}));

const HIT = {
  id:       'hash-1',
  text:     'Check-in is from 3:00 PM and check-out is by 11:00 AM.',
  metadata: { category: 'lodging-info', title: '' },
  score:    0.8,
};

async function* chunks(...texts: string[]) {
  for (const text of texts) yield { text };
}

describe('AnswerService', () => {
  const search = { search: jest.fn(), searchAcrossCategories: jest.fn() };
  const classifier = { classify: jest.fn() };
  const scope = { detectScope: jest.fn() };
  const rewrite = { rewrite: jest.fn() };
  const config = { get: (key: string) => (key === 'GEMINI_API_KEY' ? 'test-key' : undefined) };

  const service = new AnswerService(
    config as never,
    new ErrorService(),
    search as never,
    classifier as never,
    scope as never,
    rewrite as never,
  );

  beforeEach(() => {
    classifier.classify.mockResolvedValue({ categories: ['lodging-info'], reason: '' });
    scope.detectScope.mockResolvedValue({ scope: 'specific', reason: '' });
    search.search.mockResolvedValue([HIT]);
    search.searchAcrossCategories.mockResolvedValue([HIT]);
    rewrite.rewrite.mockImplementation(async (q: string) => q);
  });

  it('answers a routed question and returns the chunks it used as sources', async () => {
    mockGenerate.mockResolvedValue({ text: 'Check-in is from 3:00 PM.' });

    const result = await service.generateAnswer('What time is check-in?', 'demo-club');

    expect(result.answer).toBe('Check-in is from 3:00 PM.');
    expect(result.categories).toEqual(['lodging-info']);
    expect(result.scope).toBe('specific');
    expect(result.needsClarification).toBe(false);
    expect(result.sources).toEqual([
      { id: 'hash-1', text: HIT.text, category: 'lodging-info', title: null, score: 0.8 },
    ]);
    expect(search.search).toHaveBeenCalledWith('What time is check-in?', 8, {
      courseId: 'demo-club',
      category: 'lodging-info',
    });
  });

  it('replaces the NO_ANSWER sentinel with the standard reply and drops sources', async () => {
    mockGenerate.mockResolvedValue({ text: 'NO_ANSWER' });

    const result = await service.generateAnswer('Is there a pool?', 'demo-club');

    expect(result.answer).toBe("I don't have information about that in the available documents.");
    expect(result.sources).toEqual([]);
    expect(result.needsClarification).toBe(false);
  });

  it('asks the user to clarify when no topic matches and nothing is found', async () => {
    classifier.classify.mockResolvedValue({ categories: [], reason: 'vague' });
    search.search.mockResolvedValue([]);

    const result = await service.generateAnswer('hello', 'demo-club');

    expect(result.needsClarification).toBe(true);
    expect(result.answer).toMatch(/What would you like to know\?/);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('searches the whole course when no topic matches, and clarifies on NO_ANSWER', async () => {
    classifier.classify.mockResolvedValue({ categories: [], reason: '' });
    mockGenerate.mockResolvedValue({ text: 'NO_ANSWER' });

    const result = await service.generateAnswer('hi', 'demo-club');

    expect(search.search).toHaveBeenCalledWith('hi', 8, { courseId: 'demo-club' });
    expect(result.needsClarification).toBe(true);
    expect(result.sources).toEqual([]);
  });

  it('asks a narrowing question for broad single-topic requests without searching', async () => {
    scope.detectScope.mockResolvedValue({ scope: 'broad', reason: 'overview' });

    const result = await service.generateAnswer('Tell me about lodging', 'demo-club');

    expect(result.scope).toBe('broad');
    expect(result.needsClarification).toBe(true);
    expect(result.answer).toContain('lodging');
    expect(search.search).not.toHaveBeenCalled();
  });

  it('searches each topic when several match', async () => {
    classifier.classify.mockResolvedValue({ categories: ['golf-rules', 'contact-info'], reason: '' });
    mockGenerate.mockResolvedValue({ text: 'Call 555-0142.' });

    const result = await service.generateAnswer('Phone for tee times?', 'demo-club');

    expect(search.searchAcrossCategories).toHaveBeenCalledWith(
      'Phone for tee times?', ['golf-rules', 'contact-info'], 8, 'demo-club',
    );
    expect(result.scope).toBeNull();
  });

  it('rewrites follow-ups using history before routing and searching', async () => {
    rewrite.rewrite.mockResolvedValue('What time is check-out?');
    mockGenerate.mockResolvedValue({ text: 'By 11:00 AM.' });
    const history = [
      { role: 'user' as const, content: 'What time is check-in?' },
      { role: 'assistant' as const, content: 'From 3:00 PM.' },
    ];

    const result = await service.generateAnswer('and check-out?', 'demo-club', history);

    expect(rewrite.rewrite).toHaveBeenCalledWith('and check-out?', history);
    expect(classifier.classify).toHaveBeenCalledWith('What time is check-out?');
    expect(result.standaloneQuestion).toBe('What time is check-out?');
  });

  it('does not call the rewriter without history', async () => {
    mockGenerate.mockResolvedValue({ text: 'From 3:00 PM.' });
    await service.generateAnswer('What time is check-in?', 'demo-club');
    expect(rewrite.rewrite).not.toHaveBeenCalled();
  });

  it('rejects an invalid courseId', async () => {
    await expect(service.generateAnswer('q', 'Not A Valid Id!')).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('streamAnswer', () => {
    const collect = async (gen: AsyncGenerator<AskStreamEvent>) => {
      const events: AskStreamEvent[] = [];
      for await (const e of gen) events.push(e);
      return events;
    };

    it('emits meta, the text as deltas, then done with sources', async () => {
      mockStream.mockResolvedValue(chunks('Check-in is ', 'from 3:00 PM.'));

      const events = await collect(service.streamAnswer('What time is check-in?', 'demo-club'));

      expect(events[0].type).toBe('meta');
      const text = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('');
      expect(text).toBe('Check-in is from 3:00 PM.');
      const done = events[events.length - 1] as Extract<AskStreamEvent, { type: 'done' }>;
      expect(done.type).toBe('done');
      expect(done.result.answer).toBe('Check-in is from 3:00 PM.');
      expect(done.result.sources).toHaveLength(1);
    });

    it('never leaks the NO_ANSWER sentinel, even when split across chunks', async () => {
      mockStream.mockResolvedValue(chunks('NO_', 'ANSW', 'ER'));

      const events = await collect(service.streamAnswer('Is there a pool?', 'demo-club'));

      const deltas = events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text);
      expect(deltas).toEqual(["I don't have information about that in the available documents."]);
      expect(deltas.join('')).not.toContain('NO_');
    });

    it('streams clarification replies without calling the model', async () => {
      scope.detectScope.mockResolvedValue({ scope: 'broad', reason: '' });

      const events = await collect(service.streamAnswer('Tell me about lodging', 'demo-club'));

      expect(events.map((e) => e.type)).toEqual(['meta', 'delta', 'done']);
      expect(mockStream).not.toHaveBeenCalled();
    });
  });
});
