// Load env BEFORE Nest AppModule is imported (imports are hoisted otherwise).
import { config as loadEnv } from 'dotenv';
import { join } from 'path';

const projectRoot = join(__dirname, '..', '..');
process.chdir(projectRoot);
loadEnv({ path: join(projectRoot, '.env'), override: true });

// external modules
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// utils/helpers
import { AppModule } from '../app.module';
import { AnswerService } from '../answer/answer.service';
import { createGolfMcpServer } from './create-golf-mcp-server';

async function bootstrap(): Promise<void> {
  // Keep stdout clean for MCP JSON-RPC; Nest logs go to stderr only.
  console.error(
    `MCP boot (stdio): cwd=${process.cwd()} gemini=${process.env.GEMINI_API_KEY ? 'ok' : 'missing'}`,
  );

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY missing. Check the .env file in the project root');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const answerService = app.get(AnswerService);
  const server = createGolfMcpServer(answerService);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Golf rules MCP server running on stdio');
}

bootstrap().catch((err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});
