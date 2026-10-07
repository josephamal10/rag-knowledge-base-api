// external modules
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { INestApplication } from '@nestjs/common';
import express, { type Request, type Response, type NextFunction } from 'express';

// utils/helpers
import { AnswerService } from '../answer/answer.service';
import { createGolfMcpServer } from './create-golf-mcp-server';

type ExpressApp = {
  delete: (path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => void>) => void;
  get:    (path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => void>) => void;
  post:   (path: string, ...handlers: Array<(req: Request, res: Response, next?: NextFunction) => void>) => void;
  use:    (...args: unknown[]) => void;
};

function resolveJsonBody(req: Request): unknown {
  // Nest/Express may leave body empty on raw-mounted routes; recover if needed.
  if (req.body && typeof req.body === 'object' && Object.keys(req.body as object).length > 0) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return req.body;
    }
  }
  return req.body;
}

/**
 * Mounts MCP Streamable HTTP (spec 2025-03-26) at /mcp on the Nest Express app.
 * Same port as REST/Swagger (default 3000) so ngrok http 3000 exposes everything.
 */
export function mountMcpHttp(app: INestApplication): void {
  const answerService = app.get(AnswerService);
  const expressApp = app.getHttpAdapter().getInstance() as ExpressApp;

  // Ensure JSON body parsing for /mcp (Nest sometimes skips raw Express routes).
  expressApp.use('/mcp', express.json({ limit: '4mb' }));

  // One transport per MCP session (required for Streamable HTTP GET streams).
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const sendJsonRpcError = (res: Response, code: number, message: string, httpStatus: number) => {
    if (res.headersSent) {
      return;
    }
    res.status(httpStatus).json({
      jsonrpc: '2.0',
      error:   { code, message },
      id:      null,
    });
  };

  expressApp.post('/mcp', async (req: Request, res: Response) => {
    try {
      const body = resolveJsonBody(req);
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport | undefined =
        sessionId ? transports[sessionId] : undefined;

      if (!transport) {
        // New session only on initialize; otherwise reject.
        if (!isInitializeRequest(body)) {
          console.error('MCP POST rejected (not initialize / no session). body=', body);
          sendJsonRpcError(res, -32000, 'Bad Request: invalid or missing MCP session', 400);
          return;
        }

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator:   () => randomUUID(),
          onsessioninitialized: (id) => {
            transports[id] = transport!;
            console.error(`MCP session initialized: ${id}`);
          },
        });

        transport.onclose = () => {
          const id = transport?.sessionId;
          if (id && transports[id]) {
            delete transports[id];
            console.error(`MCP session closed: ${id}`);
          }
        };

        const mcpServer = createGolfMcpServer(answerService);
        await mcpServer.connect(transport);
      }

      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error('MCP POST /mcp failed:', err);
      sendJsonRpcError(res, -32603, 'Internal server error', 500);
    }
  });

  // GET opens the Streamable HTTP SSE stream for an existing session.
  // Opening this URL in a browser (no session) is NOT how MCP works — return a clear hint.
  expressApp.get('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId ? transports[sessionId] : undefined;
      if (!transport) {
        const accept = String(req.headers.accept || '');
        if (accept.includes('text/html')) {
          res
            .status(200)
            .type('html')
            .send(
              '<h1>MCP endpoint</h1><p>This URL is for Cursor/MCP clients, not a browser page. ' +
                'Put it in mcp.json as <code>\"url\"</code>.</p>',
            );
          return;
        }
        sendJsonRpcError(res, -32000, 'Bad Request: invalid or missing MCP session', 400);
        return;
      }
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('MCP GET /mcp failed:', err);
      sendJsonRpcError(res, -32603, 'Internal server error', 500);
    }
  });

  // DELETE ends a session (MCP Streamable HTTP session termination).
  expressApp.delete('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      const transport = sessionId ? transports[sessionId] : undefined;
      if (!transport) {
        sendJsonRpcError(res, -32000, 'Bad Request: invalid or missing MCP session', 400);
        return;
      }
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('MCP DELETE /mcp failed:', err);
      sendJsonRpcError(res, -32603, 'Internal server error', 500);
    }
  });

  console.error('MCP Streamable HTTP mounted at POST/GET/DELETE /mcp');
}
