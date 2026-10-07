// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { CommonModule } from '../common/common.module';
import { VectorStoreModule } from '../vector-store/vector-store.module';
import { SearchService } from './search.service';

@Module({
  imports: [CommonModule, EmbeddingsModule, VectorStoreModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

