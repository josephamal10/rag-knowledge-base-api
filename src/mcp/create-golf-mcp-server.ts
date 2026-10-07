// external modules
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// utils/helpers
import { AnswerService } from '../answer/answer.service';

/**
 * Shared MCP server factory used by:
 * - stdio entry (local Cursor process)
 * - Streamable HTTP entry (remote / ngrok)
 */
export function createGolfMcpServer(answerService: AnswerService): McpServer {
  const server = new McpServer({
    name:    'ngolf-rules',
    version: '1.0.0',
  });

  server.registerTool(
    'information_query',
    {
      description:
        'Club knowledge-base assistant — answers caller questions using the documents ' +
        'ingested for the given courseId (golf rules, lodging, events, contact and ' +
        'real-estate info). Use this tool whenever the caller asks about club policies, ' +
        'course conditions, rates or facilities. Answers come only from the ingested ' +
        'documents — do not use general knowledge for questions they do not cover.',
      inputSchema: {
        question: z
          .string()
          .min(1)
          .describe('Question about the club, answered from its ingested documents'),
        courseId: z
          .string()
          .min(1)
          .describe('Course id (= Upstash namespace), e.g. demo-club'),
      },
    },
    async ({ question, courseId }) => {
      try {
        const result = await answerService.generateAnswer(question, courseId);
        return {
          content: [{ type: 'text' as const, text: result.answer }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('information_query failed:', message);
        return {
          content: [{ type: 'text' as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}
