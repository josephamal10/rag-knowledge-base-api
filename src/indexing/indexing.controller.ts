// external modules
import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// utils/helpers
import { CourseIdSchema } from '../common/course-id';
import { ErrorService } from '../common/error.service';
import { ReindexBodyDto, ReindexResponseDto } from './dto/reindex.dto';
import { IndexingService } from './indexing.service';

@ApiTags('indexing')
@Controller()
export class IndexingController {
  constructor(
    private readonly errorService: ErrorService,
    private readonly indexingService: IndexingService,
  ) {}

  @Post('reindex')
  @ApiOperation({
    summary:     'Reindex SQLite → Upstash Vector (one course namespace)',
    description:
      'Embeds new/changed rule chunks for the given courseId and removes orphan vectors ' +
      'in that Upstash namespace only.',
  })
  @ApiBody({ type: ReindexBodyDto })
  @ApiOkResponse({ type: ReindexResponseDto })
  async reindex(@Body() body: ReindexBodyDto): Promise<ReindexResponseDto> {
    const parsed = CourseIdSchema.safeParse(body?.courseId?.trim()?.toLowerCase());
    if (!parsed.success) {
      throw this.errorService.invalidRequest('courseId is required and must be a valid course id', {
        courseId: body?.courseId,
        details:  parsed.error.flatten(),
      });
    }

    return this.indexingService.reindexAll(parsed.data);
  }
}
