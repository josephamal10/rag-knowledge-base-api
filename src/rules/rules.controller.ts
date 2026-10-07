// external modules
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

// utils/helpers
import { ErrorService } from '../common/error.service';
import { rejectLegacyRegionWithoutCourseId } from '../common/legacy-region';
import {
  AddRuleDtoSchema,
  CreateRuleBodyDto,
  DeleteRuleResponseDto,
  RuleResponseDto,
  UpdateRuleBodyDto,
  UpdateRuleDtoSchema,
} from './dto/rule.dto';
import { RulesService } from './rules.service';

@ApiTags('rules')
@Controller('rules')
export class RulesController {
  constructor(
    private readonly errorService: ErrorService,
    private readonly rulesService: RulesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a rule chunk' })
  @ApiBody({ type: CreateRuleBodyDto })
  @ApiOkResponse({ type: RuleResponseDto })
  async addRule(@Body() body: CreateRuleBodyDto): Promise<unknown> {
    rejectLegacyRegionWithoutCourseId(this.errorService, body as { region?: string; courseId?: string });

    const parsedBody = AddRuleDtoSchema.safeParse({
      ...body,
      courseId:
        typeof body?.courseId === 'string' ? body.courseId.trim().toLowerCase() : body?.courseId,
    });

    if (!parsedBody.success) {
      throw this.errorService.invalidRequest('Invalid request body', parsedBody.error.flatten());
    }

    return this.rulesService.addRule(parsedBody.data);
  }

  @Get()
  @ApiOperation({ summary: 'List all rule chunks' })
  @ApiOkResponse({ type: RuleResponseDto, isArray: true })
  async getAllRules(): Promise<unknown> {
    return this.rulesService.getAllRules();
  }

  @Get('regions')
  @ApiOperation({ summary: 'List distinct regions (equals courseId after ingest unification)' })
  @ApiOkResponse({
    schema: {
      type:    'array',
      items:   { type: 'string', example: 'demo-club' },
      example: ['demo-club'],
    },
  })
  async getDistinctRegions(): Promise<unknown> {
    return this.rulesService.getDistinctRegions();
  }

  @Get('courses')
  @ApiOperation({ summary: 'List distinct course ids (Upstash namespaces)' })
  @ApiOkResponse({
    schema: {
      type:    'array',
      items:   { type: 'string', example: 'demo-club' },
      example: ['demo-club'],
    },
  })
  async getDistinctCourses(): Promise<unknown> {
    return this.rulesService.getDistinctCourseIds();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one rule chunk by id' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: RuleResponseDto })
  async getRuleById(@Param('id', ParseIntPipe) id: number): Promise<unknown> {
    return this.rulesService.getRuleById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a rule chunk' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateRuleBodyDto })
  @ApiOkResponse({ type: RuleResponseDto })
  async updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateRuleBodyDto,
  ): Promise<unknown> {
    rejectLegacyRegionWithoutCourseId(this.errorService, body as { region?: string; courseId?: string });

    const parsedBody = UpdateRuleDtoSchema.safeParse({
      ...body,
      courseId:
        typeof (body as { courseId?: string })?.courseId === 'string'
          ? (body as { courseId: string }).courseId.trim().toLowerCase()
          : (body as { courseId?: string })?.courseId,
    });
    if (!parsedBody.success) {
      throw this.errorService.invalidRequest('Invalid request body', parsedBody.error.flatten());
    }

    return this.rulesService.updateRule(id, parsedBody.data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a rule chunk' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: DeleteRuleResponseDto })
  async deleteRule(@Param('id', ParseIntPipe) id: number): Promise<DeleteRuleResponseDto> {
    await this.rulesService.deleteRule(id);
    return { deleted: true };
  }
}
