// external modules
import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

// utils/helpers
import { CourseIdSchema } from '../../common/course-id';
import { KB_CATEGORIES, KbCategorySchema } from '../../common/kb-category';

export const IngestTextBodySchema = z.object({
  text:     z.string().min(1),
  courseId: CourseIdSchema,
  category: KbCategorySchema,
});

export type IngestTextBody = z.infer<typeof IngestTextBodySchema>;

export const IngestLinkBodySchema = z.object({
  urls:     z.array(z.string().url()).min(1),
  courseId: CourseIdSchema,
  category: KbCategorySchema,
});

export type IngestLinkBody = z.infer<typeof IngestLinkBodySchema>;

export class IngestTextBodyDto {
  @ApiProperty({
    description: 'Raw pasted text to add to the knowledge base',
    example:     'Soft spikes are required on all greens. Carts must stay on paths when the course is wet.',
  })
  text: string;

  @ApiProperty({
    description: 'Course id (= Upstash namespace). Also stored as region.',
    example:     'demo-club',
  })
  courseId: string;

  @ApiProperty({
    description: 'Fixed KB category (policy type)',
    enum:        KB_CATEGORIES,
    example:     'golf-rules',
  })
  category: string;
}

export class IngestLinkBodyDto {
  @ApiProperty({
    description: 'One or more webpage URLs to fetch and extract readable text from',
    example:     [
      'https://example.com/golf-policy',
      'https://example.com/club-rules',
    ],
    type:        [String],
  })
  urls: string[];

  @ApiProperty({
    description: 'Course id (= Upstash namespace). Also stored as region.',
    example:     'demo-club',
  })
  courseId: string;

  @ApiProperty({
    description: 'Fixed KB category (policy type)',
    enum:        KB_CATEGORIES,
    example:     'golf-rules',
  })
  category: string;
}

export class IngestKbResponseDto {
  @ApiProperty({ example: 5 })
  importedChunks: number;

  @ApiProperty({
    example: { skipped: 100, added: 5, deleted: 0 },
  })
  indexed: { skipped: number; added: number; deleted: number };

  @ApiProperty({ example: 'text', enum: ['document', 'link', 'text'] })
  sourceType: string;

  @ApiProperty({ example: 'demo-club' })
  courseId: string;

  @ApiProperty({ example: 'demo-club' })
  region: string;

  @ApiProperty({ example: 'golf-rules', enum: KB_CATEGORIES })
  category: string;
}

export class IngestLinksStartedResponseDto {
  @ApiProperty({ example: 'Processing started' })
  message: string;

  @ApiProperty({ example: 3, description: 'Number of URLs queued for background processing' })
  count: number;
}

export class LinkIngestUrlStatusDto {
  @ApiProperty({ example: 'https://example.com/golf-policy' })
  url: string;

  @ApiProperty({ example: 'succeeded', enum: ['pending', 'processing', 'succeeded', 'failed'] })
  status: string;

  @ApiProperty({ example: 12, required: false })
  importedChunks?: number;

  @ApiProperty({ example: 'Failed to fetch URL', required: false })
  error?: string;

  @ApiProperty({ example: 2, required: false, description: 'Attempt count when finished (max 3)' })
  attempts?: number;
}

export class LinkIngestJobStatusDto {
  @ApiProperty({ example: true })
  isProcessing: boolean;

  @ApiProperty({ example: 'demo-club', nullable: true })
  courseId: string | null;

  @ApiProperty({ example: 'golf-rules', nullable: true })
  category: string | null;

  @ApiProperty({ example: '2026-08-12T06:30:00.000Z', nullable: true })
  startedAt: string | null;

  @ApiProperty({ example: '2026-08-12T06:31:15.000Z', nullable: true })
  finishedAt: string | null;

  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: 2 })
  succeeded: number;

  @ApiProperty({ example: 1 })
  failed: number;

  @ApiProperty({ example: 0 })
  pending: number;

  @ApiProperty({ type: [LinkIngestUrlStatusDto] })
  urls: LinkIngestUrlStatusDto[];
}

export class IngestLinksBatchResponseDto {
  @ApiProperty({ example: 3 })
  count: number;

  @ApiProperty({ type: [IngestKbResponseDto] })
  results: IngestKbResponseDto[];
}
