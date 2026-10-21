// entities
import { RuleEntity } from './rules/entities/rule.entity';

// database services
import { TypeOrmModule } from '@nestjs/typeorm';

// external modules
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

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
    // Per-IP rate limit so a public demo can't burn through the Gemini quota.
    ThrottlerModule.forRootAsync({
      inject:     [ConfigService],
      useFactory: (config: ConfigService) => [
        { ttl: 60_000, limit: config.get<number>('RATE_LIMIT_PER_MINUTE') ?? 30 },
      ],
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
  providers:   [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

