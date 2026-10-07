// external modules
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// utils/helpers
import { CourseIdSchema } from '../common/course-id';
import { ErrorService } from '../common/error.service';
import { AnswerService } from './answer.service';
import { AskDto, AskResponseDto } from './dto/ask.dto';

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
      'Requires courseId (Upstash namespace). Classifies category, optionally detects broad vs specific, ' +
      'routes search, then generates a grounded Gemini answer.',
  })
  @ApiBody({ type: AskDto })
  @ApiOkResponse({ type: AskResponseDto })
  async ask(@Body() body: AskDto): Promise<AskResponseDto> {
    const question = body?.question;
    if (!question || !question.trim()) {
      throw this.errorService.invalidRequest('question is required');
    }

    const parsedCourseId = CourseIdSchema.safeParse(body?.courseId?.trim()?.toLowerCase());
    if (!parsedCourseId.success) {
      throw this.errorService.invalidRequest('courseId is required and must be a valid course id', {
        courseId: body?.courseId,
      });
    }

    const result = await this.answerService.generateAnswer(question, parsedCourseId.data);
    return {
      answer:             result.answer,
      courseId:           result.courseId,
      categories:         result.categories,
      needsClarification: result.needsClarification,
      scope:              result.scope,
    };
  }
}
