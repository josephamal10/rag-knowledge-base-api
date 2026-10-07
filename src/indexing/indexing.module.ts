// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { CommonModule } from '../common/common.module';
import { RulesModule } from '../rules/rules.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { IndexingController } from './indexing.controller';
import { IndexingService } from './indexing.service';

@Module({
  imports: [CommonModule, RulesModule, EmbeddingsModule, VectorStoreModule],
  controllers: [IndexingController],
  providers: [IndexingService],
  exports: [IndexingService],                                                   // Shared ingest can trigger reindex
})
export class IndexingModule {}

