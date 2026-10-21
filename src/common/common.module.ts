// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { AdminKeyGuard } from './admin-key.guard';
import { ErrorService } from './error.service';

@Module({
  providers: [ErrorService, AdminKeyGuard],
  exports: [ErrorService, AdminKeyGuard],
})
export class CommonModule {}

