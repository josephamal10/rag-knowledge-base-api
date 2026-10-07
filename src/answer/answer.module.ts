// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { CommonModule } from '../common/common.module';
import { SearchModule } from '../search/search.module';
import { AnswerController } from './answer.controller';
import { AnswerService } from './answer.service';
import { CategoryClassifierService } from './category-classifier.service';
import { QuestionScopeService } from './question-scope.service';

@Module({
  imports: [CommonModule, SearchModule],
  controllers: [AnswerController],
  providers: [AnswerService, CategoryClassifierService, QuestionScopeService],
  exports: [AnswerService, CategoryClassifierService, QuestionScopeService],
})
export class AnswerModule {}
