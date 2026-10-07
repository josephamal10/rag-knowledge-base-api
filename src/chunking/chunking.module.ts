// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { ChunkingService } from './chunking.service';

@Module({
  providers: [ChunkingService],
  exports: [ChunkingService],
})
export class ChunkingModule {}

