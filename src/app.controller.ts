// external modules
import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status: string;
}

@ApiTags('health')
@SkipThrottle()                                                                  // Uptime checks shouldn't hit the rate limit
@Controller()
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return { status: 'ok' };
  }
}
