// external modules
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

// utils/helpers
import { AdminOnly } from '../common/admin-key.guard';
import { ErrorService } from '../common/error.service';
import { rejectLegacyRegionWithoutCourseId } from '../common/legacy-region';
import { ImportService } from '../import/import.service';
import { KbLinkJobService } from './kb-link-job.service';
import {
  IngestKbResponseDto,
  IngestLinkBodyDto,
  IngestLinkBodySchema,
  IngestLinksStartedResponseDto,
  IngestTextBodyDto,
  IngestTextBodySchema,
  LinkIngestJobStatusDto,
} from './dto/kb.dto';

@ApiTags('kb')
@Controller('kb')
export class KbController {
  constructor(
    private readonly errorService: ErrorService,
    private readonly importService: ImportService,
    private readonly kbLinkJobService: KbLinkJobService,
  ) {}

  @AdminOnly()
  @Post('text')
  @ApiOperation({
    summary:     'Add pasted text to the knowledge base',
    description:
      'Chunks raw text, saves to SQLite with courseId (= region) and sourceType=text, ' +
      'then reindexes that Upstash namespace.',
  })
  @ApiBody({ type: IngestTextBodyDto })
  @ApiOkResponse({ type: IngestKbResponseDto })
  async ingestText(@Body() body: IngestTextBodyDto): Promise<IngestKbResponseDto> {
    rejectLegacyRegionWithoutCourseId(
      this.errorService,
      body as { region?: string; courseId?: string },
    );

    const parsed = IngestTextBodySchema.safeParse({
      ...body,
      courseId: typeof body?.courseId === 'string' ? body.courseId.trim().toLowerCase() : body?.courseId,
    });
    if (!parsed.success) {
      throw this.errorService.invalidRequest('Invalid request body', parsed.error.flatten());
    }

    return this.importService.ingestTextToKB(
      parsed.data.text,
      parsed.data.courseId,
      parsed.data.category,
      'text',
    );
  }

  @AdminOnly()
  @Post('link')
  @ApiOperation({
    summary:     'Queue one or more webpage URLs for background KB ingest',
    description:
      'Accepts an array of URLs and returns immediately. Each link is processed in the ' +
      'background into the given courseId namespace. Poll GET /kb/link/status for progress.',
  })
  @ApiBody({ type: IngestLinkBodyDto })
  @ApiOkResponse({ type: IngestLinksStartedResponseDto })
  ingestLink(@Body() body: IngestLinkBodyDto): IngestLinksStartedResponseDto {
    rejectLegacyRegionWithoutCourseId(
      this.errorService,
      body as { region?: string; courseId?: string },
    );

    const parsed = IngestLinkBodySchema.safeParse({
      ...body,
      courseId: typeof body?.courseId === 'string' ? body.courseId.trim().toLowerCase() : body?.courseId,
    });
    if (!parsed.success) {
      throw this.errorService.invalidRequest('Invalid request body', parsed.error.flatten());
    }

    this.kbLinkJobService.startProcessing(
      parsed.data.urls,
      parsed.data.courseId,
      parsed.data.category,
    );

    return {
      message: 'Processing started',
      count:   parsed.data.urls.length,
    };
  }

  @Get('link/status')
  @ApiOperation({
    summary:     'Get background link ingest progress',
    description:
      'Returns the latest link batch: per-URL status (pending/processing/succeeded/failed), ' +
      'counts, and timestamps. Idle state is returned when no batch has run yet.',
  })
  @ApiOkResponse({ type: LinkIngestJobStatusDto })
  getLinkStatus(): LinkIngestJobStatusDto {
    return this.kbLinkJobService.getStatus();
  }
}
