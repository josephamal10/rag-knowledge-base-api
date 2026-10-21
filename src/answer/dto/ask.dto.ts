// external modules
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// utils/helpers
import { KB_CATEGORIES } from '../../common/kb-category';

export class ChatTurnDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  role: 'user' | 'assistant';

  @ApiProperty({ example: 'What time is check-in?' })
  content: string;
}

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

  @ApiPropertyOptional({
    description:
      'Recent conversation (oldest first). Lets follow-ups such as "and check-out?" be understood. ' +
      'Max 20 turns; only the last few are used.',
    type:    [ChatTurnDto],
    example: [],
  })
  history?: ChatTurnDto[];
}

export class AnswerSourceDto {
  @ApiProperty({ description: 'Vector id (SHA-256 of the chunk text)', example: '3f2a…' })
  id: string;

  @ApiProperty({ description: 'The chunk text the answer was grounded in', example: 'Green fees: weekdays $45 …' })
  text: string;

  @ApiPropertyOptional({ enum: KB_CATEGORIES, nullable: true, example: 'golf-rules' })
  category: string | null;

  @ApiPropertyOptional({ nullable: true, example: null })
  title: string | null;

  @ApiPropertyOptional({ description: 'Hybrid (RRF) relevance score', nullable: true, example: 0.42 })
  score: number | null;
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
    description: 'True when the reply asks the user to clarify instead of answering',
    example:     false,
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

  @ApiProperty({
    description: 'Chunks the answer was grounded in (empty when it could not answer)',
    type:        [AnswerSourceDto],
  })
  sources: AnswerSourceDto[];

  @ApiProperty({
    description: 'The question actually searched — follow-ups are rewritten using history',
    example:     'What are the weekend green fees?',
  })
  standaloneQuestion: string;
}
