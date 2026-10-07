// external modules
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// utils/helpers
import { CommonModule } from '../common/common.module';
import { VectorStoreService } from './vector-store.service';

@Module({
  imports: [ConfigModule, CommonModule],
  providers: [VectorStoreService],
  exports: [VectorStoreService],
})
export class VectorStoreModule {}

