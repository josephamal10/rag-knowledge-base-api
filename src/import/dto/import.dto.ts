// external modules
import { ApiProperty } from '@nestjs/swagger';

// utils/helpers
import { KB_CATEGORIES } from '../../common/kb-category';

/** Multipart fields for POST /rules/import (documented for Swagger / Postman). */
export class ImportRulesDto {
  @ApiProperty({
    type:        'string',
    format:      'binary',
    description: 'PDF, DOCX, or TXT file to chunk and store in SQLite',
  })
  file: Express.Multer.File;

  @ApiProperty({
    description: 'Course id (= Upstash namespace). Also stored as region.',
    example:     'demo-club',
  })
  courseId: string;

  @ApiProperty({
    description: 'Fixed KB category (policy type) applied to every imported chunk',
    enum:        KB_CATEGORIES,
    example:     'golf-rules',
  })
  category: string;
}

export class ImportRulesResponseDto {
  @ApiProperty({ example: 17, description: 'Number of text chunks saved to SQLite' })
  importedChunks: number;

  @ApiProperty({
    description: 'Upstash reindex summary after ingest',
    example:     { skipped: 10, added: 7, deleted: 0 },
  })
  indexed: { skipped: number; added: number; deleted: number };

  @ApiProperty({ example: 'document', enum: ['document', 'link', 'text'] })
  sourceType: string;

  @ApiProperty({ example: 'demo-club' })
  courseId: string;

  @ApiProperty({ example: 'demo-club', description: 'Always equals courseId' })
  region: string;

  @ApiProperty({ example: 'golf-rules', enum: KB_CATEGORIES })
  category: string;
}
