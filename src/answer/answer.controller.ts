// external modules
import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { z } from 'zod';

// utils/helpers
import { CourseIdSchema } from '../common/course-id';
import { ErrorService } from '../common/error.service';
import { AnswerService, AskStreamEvent, ChatTurn } from './answer.service';
import { AskDto, AskResponseDto } from './dto/ask.dto';

const AskBodySchema = z.object({
  question: z.string().trim().min(1, 'question is required').max(1000),
  courseId: z.string().transform((v) => v.trim().toLowerCase()).pipe(CourseIdSchema),
  history: z
    .array(
      z.object({
        role:    z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

@ApiTags('answer')
@Controller()
export class AnswerController {
  constructor(
    private readonly errorService: ErrorService,
    private readonly answerService: AnswerService,
  ) {}

  @Post('ask')
  @ApiOperation({
    summary:     'Ask a question (RAG)',
    description:
      'Requires courseId (Upstash namespace). Optional history lets follow-ups ("and check-out?") work. ' +
      'Classifies the topic, runs hybrid search, then generates a grounded Gemini answer and returns ' +
      'the source chunks it was based on.',
  })
  @ApiBody({ type: AskDto })
  @ApiOkResponse({ type: AskResponseDto })
  async ask(@Body() body: AskDto): Promise<AskResponseDto> {
    const { question, courseId, history } = this.parseBody(body);
    return this.answerService.generateAnswer(question, courseId, history);
  }

  @Post('ask/stream')
  @ApiOperation({
    summary:     'Ask a question and stream the answer (Server-Sent Events)',
    description:
      'Same input as POST /ask. Responds with text/event-stream: one `meta` event (topics), ' +
      'several `delta` events (answer text as it is generated) and a final `done` event with the ' +
      'full result including sources. Errors after streaming starts arrive as an `error` event.',
  })
  @ApiBody({ type: AskDto })
  @ApiProduces('text/event-stream')
  async askStream(@Body() body: AskDto, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { question, courseId, history } = this.parseBody(body);
    const events = this.answerService.streamAnswer(question, courseId, history);

    // Pull the first event before sending headers, so validation/config errors still become normal HTTP errors.
    const first = await events.next();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');                                  // Disable proxy buffering (nginx)
    res.flushHeaders();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const send = (event: AskStreamEvent | { type: 'error'; message: string }) => {
      const { type, ...data } = event;
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      if (!first.done) {
        send(first.value);
      }
      for await (const event of events) {
        if (closed) {
          break;
        }
        send(event);
      }
    } catch (err) {
      send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      res.end();
    }
  }

  private parseBody(body: unknown): { question: string; courseId: string; history: ChatTurn[] } {
    const parsed = AskBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw this.errorService.invalidRequest('Invalid request body', parsed.error.flatten());
    }
    // tsconfig has strict off, so Zod infers every field as optional — the schema guarantees them.
    const { question, courseId, history } = parsed.data;
    return { question, courseId: courseId as string, history };
  }
}
