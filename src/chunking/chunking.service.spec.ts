import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  const service = new ChunkingService();
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

  it('returns nothing for empty or whitespace-only text', () => {
    expect(service.chunkText('')).toEqual([]);
    expect(service.chunkText('   \n\t ')).toEqual([]);
  });

  it('keeps short text as a single chunk and collapses whitespace', () => {
    expect(service.chunkText('Carts  must\nstay\ton paths.')).toEqual(['Carts must stay on paths.']);
  });

  it('splits long text into chunks no longer than the chunk size', () => {
    const chunks = service.chunkText(words(400), 500, 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it('never cuts words in half at either end of a chunk', () => {
    const text = words(400);
    const vocabulary = new Set(text.split(' '));
    for (const chunk of service.chunkText(text, 120, 30)) {
      for (const token of chunk.split(' ')) {
        expect(vocabulary.has(token)).toBe(true);
      }
    }
  });

  it('overlaps neighbouring chunks so no sentence is lost at a boundary', () => {
    const chunks = service.chunkText(words(200), 200, 40);
    for (let i = 1; i < chunks.length; i++) {
      const firstWord = chunks[i].split(' ')[0];
      expect(chunks[i - 1]).toContain(firstWord);
    }
  });

  it('covers every word of the input', () => {
    const text = words(300);
    const joined = service.chunkText(text, 150, 20).join(' ');
    for (const token of text.split(' ')) {
      expect(joined).toContain(token);
    }
  });

  it('terminates on degenerate settings (overlap >= size, unbreakable text)', () => {
    expect(service.chunkText('x'.repeat(1000), 100, 500).length).toBeGreaterThan(0);
    expect(service.chunkText(words(50), 1, 0).length).toBeGreaterThan(0);
  });
});
