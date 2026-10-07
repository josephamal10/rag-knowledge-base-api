// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { CommonModule } from '../common/common.module';
import { ChunkingModule } from '../chunking/chunking.module';
import { IndexingModule } from '../indexing/indexing.module';
import { RulesModule } from '../rules/rules.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [CommonModule, ChunkingModule, RulesModule, IndexingModule],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],                                                     // Reuse ingestTextToKB from KB module later
})
export class ImportModule {}
