// external modules
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// utils/helpers
import { KB_CATEGORIES } from '../../common/kb-category';

export class AskDto {
  @ApiProperty({
    description: 'Natural-language question answered from the indexed club / rules corpus',
    example:     'What are the weekend green fees?',
    minLength:   1,
  })
  question: string;

  @ApiProperty({
    description: 'Course id (= Upstash namespace). Known at entry; not inferred from the question.',
    example:     'demo-club',
  })
  courseId: string;
}

export class AskResponseDto {
  @ApiProperty({
    description: 'Grounded answer, or a clarification prompt when intent is vague/broad',
    example:     'Weekend green fees are $60 for 18 holes, cart included.',
  })
  answer: string;

  @ApiProperty({
    description: 'Course namespace used for this answer',
    example:     'demo-club',
  })
  courseId: string;

  @ApiProperty({
    description: 'Categories detected by the classifier (empty when category intent is vague)',
    enum:        KB_CATEGORIES,
    isArray:     true,
    example:     ['golf-rules'],
  })
  categories: string[];

  @ApiProperty({
    description:
      'True when no search ran (vague category, or broad single-category overview ask)',
    example: false,
  })
  needsClarification: boolean;

  @ApiPropertyOptional({
    description:
      'broad | specific when exactly one category matched; null for vague or multi-category',
    enum:     ['broad', 'specific'],
    nullable: true,
    example:  'specific',
  })
  scope: 'broad' | 'specific' | null;
}
