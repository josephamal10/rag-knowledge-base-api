import { QueryRewriteService } from './query-rewrite.service';

const mockGenerate = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({ models: { generateContent: mockGenerate } })),
}));

describe('QueryRewriteService', () => {
  const service = new QueryRewriteService({ get: () => 'key' } as never);
  const history = [
    { role: 'user' as const, content: 'What time is check-in?' },
    { role: 'assistant' as const, content: 'From 3:00 PM.' },
  ];

  it('returns the question unchanged when there is no history (no model call)', async () => {
    await expect(service.rewrite('What time is check-in?', [])).resolves.toBe('What time is check-in?');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('uses the model to turn a follow-up into a standalone question', async () => {
    mockGenerate.mockResolvedValue({ text: '"What time is check-out?"' });
    await expect(service.rewrite('and check-out?', history)).resolves.toBe('What time is check-out?');
  });

  it('falls back to the original question if the model fails', async () => {
    mockGenerate.mockRejectedValue(new Error('quota'));
    await expect(service.rewrite('and check-out?', history)).resolves.toBe('and check-out?');
  });

  it('puts the conversation and the follow-up in the prompt', () => {
    const prompt = service.buildPrompt('and check-out?', history);
    expect(prompt).toContain('User: What time is check-in?');
    expect(prompt).toContain('Assistant: From 3:00 PM.');
    expect(prompt).toContain('Follow-up: and check-out?');
  });

  describe('clean', () => {
    it('strips quotes and label prefixes', () => {
      expect(service.clean('Rewritten question: "What time is check-out?"')).toBe('What time is check-out?');
      expect(service.clean('“What about weekends?”')).toBe('What about weekends?');
    });

    it('rejects empty or essay-length output', () => {
      expect(service.clean('   ')).toBe('');
      expect(service.clean('x'.repeat(500))).toBe('');
    });
  });
});
