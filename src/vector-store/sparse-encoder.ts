/**
 * Lightweight sparse (keyword) encoder for Upstash Hybrid indexes that do not
 * use a hosted BM25 model. Tokenizes English-ish text, hashes terms into a
 * fixed vocabulary space, and emits TF-weighted sparse vectors.
 *
 * When the console index uses Upstash's hosted BM25 sparse model instead,
 * prefer upserting/querying with `data` and WeightingStrategy.IDF — but this
 * encoder keeps hybrid keyword matching working for custom sparse indexes.
 */

const SPARSE_VOCAB_SIZE = 250_002;                                               // Matches common Upstash sparse spaces
const MAX_SPARSE_DIMS = 256;                                                     // Cap non-zero dims (Upstash max 1000)

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
  'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that',
  'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'why', 'how', 'with', 'from', 'by', 'as', 'into',
  'about', 'over', 'after', 'before', 'between', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function hashTerm(term: string): number {
  // FNV-1a 32-bit → non-negative index in vocab space
  let hash = 0x811c9dc5;
  for (let i = 0; i < term.length; i += 1) {
    hash ^= term.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % SPARSE_VOCAB_SIZE;
}

export type SparseVectorPayload = {
  indices: number[];
  values: number[];
};

export function textToSparseVector(text: string): SparseVectorPayload {
  const tokens = tokenize(text || '');
  if (!tokens.length) {
    return { indices: [0], values: [1e-6] };                                    // Avoid empty sparse vectors
  }

  const tf = new Map<number, number>();
  for (const token of tokens) {
    const index = hashTerm(token);
    tf.set(index, (tf.get(index) ?? 0) + 1);
  }

  const entries = Array.from(tf.entries())
    .map(([index, count]) => ({
      index,
      value: 1 + Math.log(count),                                               // Log-TF; IDF applied by Upstash when requested
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_SPARSE_DIMS)
    .sort((a, b) => a.index - b.index);

  return {
    indices: entries.map((e) => e.index),
    values:  entries.map((e) => e.value),
  };
}
