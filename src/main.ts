// external modules
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';

// utils/helpers
import { mkdirSync } from 'fs';
import { join } from 'path';

import { AppModule } from './app.module';
import { mountMcpHttp } from './mcp/mount-mcp-http';

function ensureDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true });
}

async function bootstrap(): Promise<void> {
  // Required folders for SQLite + uploads + docs.
  ensureDir(join(process.cwd(), 'data'));
  ensureDir(join(process.cwd(), 'docs'));
  ensureDir(join(process.cwd(), 'docs', 'rules'));
  ensureDir(join(process.cwd(), 'incoming'));

  // Explicit JSON parsers — Nest 11 + Express 5 can leave @Body() empty without this.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('RAG Knowledge-Base API')
    .setDescription(
      'NestJS RAG API that answers questions from a business\'s own documents. ' +
        'SQLite stores chunks, Upstash Vector handles hybrid search, Gemini generates answers. ' +
        'Import the OpenAPI JSON into Postman from GET /api-json.',
    )
    .setVersion('0.1.0')
    .addTag('health', 'Service health check')
    .addTag('answer', 'RAG question answering')
    .addTag('rules', 'Rule / document chunk CRUD')
    .addTag('import', 'Upload PDF/DOCX/TXT into SQLite')
    .addTag('kb', 'Knowledge base ingest (text / link / document)')
    .addTag('indexing', 'Reindex SQLite chunks into Upstash Vector')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, document);                                     // UI at /api, JSON at /api-json

  // MCP Streamable HTTP for remote Cursor clients (ngrok → /mcp).
  mountMcpHttp(app);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  console.log(`HTTP + MCP ready on http://localhost:${port} (MCP at /mcp)`);
}

bootstrap();
