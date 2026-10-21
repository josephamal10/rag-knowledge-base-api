// external modules
import { Injectable } from '@nestjs/common';

@Injectable()
export class ChunkingService {
  chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
    const cleanedText = text.replace(/\s+/g, ' ').trim();
    if (!cleanedText) {
      return [];
    }

    const chunks: string[] = [];
    const safeChunkSize = Math.max(1, chunkSize);
    const safeOverlap = Math.min(Math.max(0, overlap), safeChunkSize - 1);

    let startIndex = 0;
    while (startIndex < cleanedText.length) {
      let endIndex = Math.min(cleanedText.length, startIndex + safeChunkSize);

      // Try not to split in the middle of a word.
      if (endIndex < cleanedText.length) {
        const lastSpace = cleanedText.lastIndexOf(' ', endIndex);
        if (lastSpace > startIndex + 20) {
          endIndex = lastSpace;
        }
      }

      const chunk = cleanedText.slice(startIndex, endIndex).trim();
      if (chunk) {
        chunks.push(chunk);
      }

      if (endIndex >= cleanedText.length) {
        break;
      }

      if (endIndex <= startIndex) {
        startIndex += 1;
        continue;
      }

      // Start the overlap at a word boundary so chunks don't begin mid-word.
      let nextStart = endIndex - safeOverlap;
      const wordStart = cleanedText.indexOf(' ', nextStart);
      if (wordStart !== -1 && wordStart < endIndex) {
        nextStart = wordStart + 1;
      }

      // Always move forward so overlap cannot rewind into an infinite loop.
      startIndex = nextStart <= startIndex ? endIndex : nextStart;
    }

    return chunks;
  }
}
