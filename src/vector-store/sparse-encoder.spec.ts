import { textToSparseVector } from './sparse-encoder';

describe('textToSparseVector', () => {
  it('is deterministic', () => {
    expect(textToSparseVector('Weekend green fees')).toEqual(textToSparseVector('Weekend green fees'));
  });

  it('ignores case and stop words', () => {
    expect(textToSparseVector('The GREEN fees')).toEqual(textToSparseVector('green fees'));
  });

  it('returns sorted, unique indices with one value each', () => {
    const { indices, values } = textToSparseVector('rule 17.1b penalty stroke out of bounds stroke');
    expect(indices.length).toBe(values.length);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('weights repeated terms with log term-frequency', () => {
    const once = textToSparseVector('penalty');
    const twice = textToSparseVector('penalty penalty');
    expect(once.values[0]).toBe(1);
    expect(twice.values[0]).toBeCloseTo(1 + Math.log(2));
  });

  it('keeps rule numbers like 17.1b as a single token', () => {
    expect(textToSparseVector('17.1b').indices).toHaveLength(1);
  });

  it('never returns an empty vector (Upstash rejects those)', () => {
    expect(textToSparseVector('')).toEqual({ indices: [0], values: [1e-6] });
    expect(textToSparseVector('the and of')).toEqual({ indices: [0], values: [1e-6] });
  });

  it('caps the number of non-zero dimensions', () => {
    const text = Array.from({ length: 1000 }, (_, i) => `term${i}`).join(' ');
    expect(textToSparseVector(text).indices.length).toBeLessThanOrEqual(256);
  });
});
