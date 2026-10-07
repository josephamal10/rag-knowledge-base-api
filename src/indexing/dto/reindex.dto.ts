// external modules
import { ApiProperty } from '@nestjs/swagger';

export class ReindexBodyDto {
  @ApiProperty({
    description: 'Course id (= Upstash namespace) to reindex',
    example:     'demo-club',
  })
  courseId: string;
}

export class ReindexResponseDto {
  @ApiProperty({ example: 10, description: 'Chunks already present in Upstash (skipped)' })
  skipped: number;

  @ApiProperty({ example: 7, description: 'New chunks embedded and upserted' })
  added: number;

  @ApiProperty({ example: 0, description: 'Orphan vector ids removed from Upstash' })
  deleted: number;
}
