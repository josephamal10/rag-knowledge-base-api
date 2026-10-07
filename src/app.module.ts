// entities
import { RuleEntity } from './rules/entities/rule.entity';

// database services
import { TypeOrmModule } from '@nestjs/typeorm';

// external modules
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// utils/helpers
import { join } from 'path';

import { AnswerModule } from './answer/answer.module';
import { AppController } from './app.controller';
import { ChunkingModule } from './chunking/chunking.module';
import { CommonModule } from './common/common.module';
import { envValidationSchema } from './config/env.validation';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { IndexingModule } from './indexing/indexing.module';
import { ImportModule } from './import/import.module';
import { KbModule } from './kb/kb.module';
import { RulesModule } from './rules/rules.module';
import { SearchModule } from './search/search.module';
import { VectorStoreModule } from './vector-store/vector-store.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(process.cwd(), '.env'),
      // Merge process.env so MCP/dotenv-injected keys are visible to Zod validate.
      validate: (config) => envValidationSchema.parse({ ...process.env, ...config }),
    }),
    CommonModule,
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: join(process.cwd(), 'data', 'golfRules.db'),
      entities: [RuleEntity],
      synchronize: true,
    }),
    RulesModule,
    ImportModule,
    KbModule,
    ChunkingModule,
    EmbeddingsModule,
    VectorStoreModule,
    IndexingModule,
    SearchModule,
    AnswerModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

