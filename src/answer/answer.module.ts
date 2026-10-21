// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { CommonModule } from '../common/common.module';
import { SearchModule } from '../search/search.module';
import { AnswerController } from './answer.controller';
import { AnswerService } from './answer.service';
import { CategoryClassifierService } from './category-classifier.service';
import { QuestionScopeService } from './question-scope.service';
import { QueryRewriteService } from './query-rewrite.service';

@Module({
  imports: [CommonModule, SearchModule],
  controllers: [AnswerController],
  providers: [AnswerService, CategoryClassifierService, QuestionScopeService, QueryRewriteService],
  exports: [AnswerService, CategoryClassifierService, QuestionScopeService],
})
export class AnswerModule {}
