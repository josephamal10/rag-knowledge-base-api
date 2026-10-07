// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { CommonModule } from '../common/common.module';
import { ImportModule } from '../import/import.module';
import { KbController } from './kb.controller';
import { KbLinkJobService } from './kb-link-job.service';

@Module({
  imports:   [CommonModule, ImportModule],
  controllers: [KbController],
  providers:   [KbLinkJobService],
})
export class KbModule {}
