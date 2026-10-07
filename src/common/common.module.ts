// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { ErrorService } from './error.service';

@Module({
  providers: [ErrorService],
  exports: [ErrorService],
})
export class CommonModule {}

