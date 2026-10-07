// external modules
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { z } from 'zod';

// utils/helpers
import { CourseIdSchema } from '../../common/course-id';
import { KB_CATEGORIES, KbCategorySchema } from '../../common/kb-category';

/** Runtime validation (existing Zod pipeline). */
export const KbSourceTypeSchema = z.enum(['document', 'link', 'text']);
export type KbSourceType = z.infer<typeof KbSourceTypeSchema>;

export const AddRuleDtoSchema = z.object({
  content:    z.string().min(1),
  courseId:   CourseIdSchema,                                                    // Also written to region (unified identity)
  category:   KbCategorySchema,
  ruleNumber: z.string().nullable().optional(),
  title:      z.string().nullable().optional(),
  sourceType: KbSourceTypeSchema.optional().default('document'),
});

export const UpdateRuleDtoSchema = AddRuleDtoSchema.partial();

export type AddRuleDto = z.infer<typeof AddRuleDtoSchema>;
export type UpdateRuleDto = z.infer<typeof UpdateRuleDtoSchema>;

/** OpenAPI / Swagger request body shape (Postman examples). */
export class CreateRuleBodyDto {
  @ApiProperty({
    description: 'Chunk text stored in SQLite and later embedded',
    example:     'Weekend green fee (18 holes, cart included): $60',
  })
  content: string;

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

  @ApiPropertyOptional({
    description: 'Optional rule number label',
    example:     null,
    nullable:    true,
  })
  ruleNumber?: string | null;

  @ApiPropertyOptional({
    description: 'Optional title',
    example:     null,
    nullable:    true,
  })
  title?: string | null;

  @ApiPropertyOptional({
    description: 'KB source type',
    enum:        ['document', 'link', 'text'],
    example:     'document',
  })
  sourceType?: 'document' | 'link' | 'text';
}

export class UpdateRuleBodyDto extends PartialType(CreateRuleBodyDto) {}

export class RuleResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'demo-club' })
  region: string;

  @ApiProperty({ example: 'demo-club' })
  courseId: string;

  @ApiProperty({ example: 'golf-rules', enum: KB_CATEGORIES })
  category: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  ruleNumber: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  title: string | null;

  @ApiProperty({ example: 'Weekend green fee (18 holes, cart included): $60' })
  content: string;

  @ApiProperty({ example: 'document', enum: ['document', 'link', 'text'] })
  sourceType: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class DeleteRuleResponseDto {
  @ApiProperty({ example: true })
  deleted: true;
}
