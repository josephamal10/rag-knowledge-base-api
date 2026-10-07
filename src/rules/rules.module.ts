// entities
import { RuleEntity } from './entities/rule.entity';

// database services
import { TypeOrmModule } from '@nestjs/typeorm';

// external modules
import { Module } from '@nestjs/common';

// utils/helpers
import { CommonModule } from '../common/common.module';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([RuleEntity])],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}

