// external modules
import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// utils/helpers
import { ErrorService } from '../common/error.service';

const EMBEDDING_MODEL_ID = 'gemini-embedding-001';

export type RetrievalTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

@Injectable()
export class EmbeddingsService {
  private readonly genAI: GoogleGenAI;
  private readonly outputDimensionality: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly errorService: ErrorService,
  ) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw this.errorService.invalidRequest('GEMINI_API_KEY is missing in environment');
    }

    this.genAI = new GoogleGenAI({ apiKey });
    // Must match Upstash dense index dimension (this project uses 1536).
    this.outputDimensionality = this.configService.get<number>('EMBEDDING_DIMENSION') ?? 1536;
  }

  async getEmbedding(text: string, taskType: RetrievalTaskType = 'RETRIEVAL_DOCUMENT'): Promise<number[]> {
    const embeddingResponse = await this.genAI.models.embedContent({
      config: {
        taskType,
        outputDimensionality: this.outputDimensionality,
      },
      contents: text,
      model: EMBEDDING_MODEL_ID,
    });

    const values = embeddingResponse.embeddings?.[0]?.values;
    if (!values?.length) {
      throw this.errorService.invalidRequest('Failed to generate embedding', { taskType });
    }

    return values;
  }
}
