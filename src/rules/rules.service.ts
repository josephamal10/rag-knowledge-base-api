// entities
import { RuleEntity } from './entities/rule.entity';

// database services
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// external modules
import { Injectable, Logger } from '@nestjs/common';

// utils/helpers
import { CourseId, normalizeCourseId, tryNormalizeCourseId } from '../common/course-id';
import { DEFAULT_KB_CATEGORY, KbCategory } from '../common/kb-category';
import { ErrorService } from '../common/error.service';
import { AddRuleDto, UpdateRuleDto } from './dto/rule.dto';

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private readonly errorService: ErrorService,
    @InjectRepository(RuleEntity)
    private readonly rulesRepository: Repository<RuleEntity>,
  ) {}

  async addRule(dto: AddRuleDto): Promise<RuleEntity> {
    const courseId = normalizeCourseId(dto.courseId);

    const createdRule = this.rulesRepository.create({
      content:    dto.content,
      courseId,
      region:     courseId,                                                      // B: unified course identity
      category:   dto.category,
      ruleNumber: dto.ruleNumber ?? null,
      title:      dto.title ?? null,
      sourceType: dto.sourceType ?? 'document',
    });

    return this.rulesRepository.save(createdRule);
  }

  async updateRule(id: number, dto: UpdateRuleDto): Promise<RuleEntity> {
    const existingRule = await this.rulesRepository.findOneBy({ id });
    if (!existingRule) {
      throw this.errorService.invalidRequest('Rule not found', { id });
    }

    const courseId = dto.courseId
      ? normalizeCourseId(dto.courseId)
      : existingRule.courseId;

    const updatedRule = {
      ...existingRule,
      content:    dto.content ?? existingRule.content,
      courseId,
      region:     courseId,                                                      // Keep region aligned with courseId
      category:   dto.category ?? existingRule.category,
      ruleNumber: dto.ruleNumber ?? existingRule.ruleNumber,
      title:      dto.title ?? existingRule.title,
      sourceType: dto.sourceType ?? existingRule.sourceType,
    };

    await this.rulesRepository.save(updatedRule);
    return updatedRule;
  }

  async deleteRule(id: number): Promise<void> {
    const result = await this.rulesRepository.delete(id);
    if (!result.affected) {
      throw this.errorService.invalidRequest('Rule not found', { id });
    }
  }

  async getAllRules(): Promise<RuleEntity[]> {
    return this.rulesRepository.find({ order: { id: 'ASC' } });
  }

  async getRulesByCourseId(courseId: string): Promise<RuleEntity[]> {
    const normalized = normalizeCourseId(courseId);
    return this.rulesRepository.find({
      where: { courseId: normalized },
      order: { id: 'ASC' },
    });
  }

  async getRuleById(id: number): Promise<RuleEntity> {
    const rule = await this.rulesRepository.findOneBy({ id });
    if (!rule) {
      throw this.errorService.invalidRequest('Rule not found', { id });
    }
    return rule;
  }

  async getDistinctRegions(): Promise<string[]> {
    const rows = await this.rulesRepository
      .createQueryBuilder('rule')
      .select('rule.region', 'region')
      .distinct(true)
      .orderBy('rule.region', 'ASC')
      .getRawMany<{ region: string }>();

    return rows.map((row) => row.region);
  }

  async getDistinctCourseIds(): Promise<string[]> {
    const rows = await this.rulesRepository
      .createQueryBuilder('rule')
      .select('rule.courseId', 'courseId')
      .distinct(true)
      .orderBy('rule.courseId', 'ASC')
      .getRawMany<{ courseId: string }>();

    return rows.map((row) => row.courseId).filter(Boolean);
  }

  async getDistinctCategories(): Promise<string[]> {
    const rows = await this.rulesRepository
      .createQueryBuilder('rule')
      .select('rule.category', 'category')
      .distinct(true)
      .orderBy('rule.category', 'ASC')
      .getRawMany<{ category: string }>();

    return rows.map((row) => row.category).filter(Boolean);
  }

  /**
   * Option A: fill missing category on legacy rows so every chunk is filterable.
   * Returns how many rows were updated.
   */
  async backfillMissingCategories(
    defaultCategory: KbCategory = DEFAULT_KB_CATEGORY,
  ): Promise<number> {
    const result = await this.rulesRepository
      .createQueryBuilder()
      .update(RuleEntity)
      .set({ category: defaultCategory })
      .where('category IS NULL OR category = :empty', { empty: '' })
      .execute();

    const updated = result.affected ?? 0;
    if (updated > 0) {
      this.logger.log(
        `Backfilled category='${defaultCategory}' on ${updated} rule row(s)`,
      );
    }
    return updated;
  }

  /**
   * Fill empty courseId from region (slug/normalize), and align region = courseId.
   * Does not move Upstash vectors — Step 4 migration handles namespaces.
   */
  async backfillMissingCourseIds(): Promise<number> {
    const rules = await this.rulesRepository.find();
    let updated = 0;

    for (const rule of rules) {
      if (rule.courseId?.trim()) {
        continue;
      }

      const fromRegion =
        tryNormalizeCourseId(rule.region) ??
        this.slugToCourseId(rule.region || 'default');

      rule.courseId = fromRegion;
      rule.region = fromRegion;
      await this.rulesRepository.save(rule);
      updated += 1;
    }

    if (updated > 0) {
      this.logger.log(`Backfilled courseId on ${updated} rule row(s)`);
    }
    return updated;
  }

  private slugToCourseId(raw: string): CourseId {
    const slug = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);

    return normalizeCourseId(slug || 'default');
  }

  /**
   * Force every SQLite rule row to the given courseId (and region = courseId).
   * Used when migrating a single-course legacy corpus into one namespace.
   */
  async alignAllRowsToCourseId(courseId: string): Promise<number> {
    const normalized = normalizeCourseId(courseId);
    const result = await this.rulesRepository
      .createQueryBuilder()
      .update(RuleEntity)
      .set({ courseId: normalized, region: normalized })
      .execute();

    const updated = result.affected ?? 0;
    this.logger.log(`Aligned ${updated} rule row(s) to courseId='${normalized}'`);
    return updated;
  }
}
