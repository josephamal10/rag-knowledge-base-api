// external modules
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// utils/helpers
import { CommonModule } from '../common/common.module';
import { EmbeddingsService } from './embeddings.service';

@Module({
  imports: [ConfigModule, CommonModule],
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}

