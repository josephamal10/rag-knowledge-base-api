// external modules
import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';

// utils/helpers
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

import { CourseIdSchema } from '../common/course-id';
import { ErrorService } from '../common/error.service';
import { rejectLegacyRegionWithoutCourseId } from '../common/legacy-region';
import { KbCategorySchema, KB_CATEGORIES } from '../common/kb-category';
import { ImportRulesDto, ImportRulesResponseDto } from './dto/import.dto';
import { ImportService } from './import.service';

function ensureIncomingDir(): string {
  const incomingDir = join(process.cwd(), 'incoming');
  if (!existsSync(incomingDir)) {
    mkdirSync(incomingDir, { recursive: true });
  }
  return incomingDir;
}

@ApiTags('import')
@Controller('rules')
export class ImportController {
  constructor(
    private readonly errorService: ErrorService,
    private readonly importService: ImportService,
  ) {}

  @Post('import')
  @ApiOperation({
    summary:     'Import a PDF / DOCX / TXT file',
    description:
      'Extracts text, chunks it, saves to SQLite with courseId (= region), then reindexes that Upstash namespace.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImportRulesDto })
  @ApiOkResponse({ type: ImportRulesResponseDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureIncomingDir());
        },
        filename: (_req, file, cb) => {
          const extension = extname(file.originalname).toLowerCase() || '.bin';
          const baseName = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 80) || 'rules';
          cb(null, `${baseName}-${Date.now()}${extension}`);
        },
      }),
    }),
  )
  async importRules(
    @UploadedFile() file: Express.Multer.File,
    @Body('courseId') courseId: string,
    @Body('category') category: string,
    @Body('region') region?: string,
  ): Promise<ImportRulesResponseDto> {
    if (!file) {
      throw this.errorService.invalidRequest('File is required');
    }
    rejectLegacyRegionWithoutCourseId(this.errorService, { region, courseId });

    const parsedCourseId = CourseIdSchema.safeParse(courseId?.trim()?.toLowerCase());
    if (!parsedCourseId.success) {
      throw this.errorService.invalidRequest('courseId is required and must be a valid course id', {
        courseId,
        allowed: 'lowercase a-z0-9_-',
      });
    }
    const parsedCategory = KbCategorySchema.safeParse(category);
    if (!parsedCategory.success) {
      throw this.errorService.invalidRequest('category is required and must be a valid KB category', {
        category,
        allowed: KB_CATEGORIES,
      });
    }

    return this.importService.importRulesFile(file, parsedCourseId.data, parsedCategory.data);
  }
}
