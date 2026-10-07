// external modules
import { Injectable, Logger } from '@nestjs/common';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

// utils/helpers
import { promises as fs } from 'fs';
import { basename, extname } from 'path';

import { ChunkingService } from '../chunking/chunking.service';
import { CourseId, normalizeCourseId } from '../common/course-id';
import { ErrorService } from '../common/error.service';
import { KbCategory, KbCategorySchema } from '../common/kb-category';
import { IndexingService } from '../indexing/indexing.service';
import { AddRuleDto, KbSourceType } from '../rules/dto/rule.dto';
import { RulesService } from '../rules/rules.service';

export type IngestTextResult = {
  importedChunks: number;
  indexed:        { skipped: number; added: number; deleted: number };
  sourceType:     KbSourceType;
  courseId:       CourseId;
  region:         string;                                                        // Always equals courseId (unified identity)
  category:       KbCategory;
};

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly errorService: ErrorService,
    private readonly rulesService: RulesService,
    private readonly chunkingService: ChunkingService,
    private readonly indexingService: IndexingService,
  ) {}

  /**
   * Shared KB ingest: chunk text → SQLite → Upstash reindex (course namespace).
   * region is set equal to courseId (unified course identity).
   */
  async ingestTextToKB(
    text: string,
    courseId: string,
    category: KbCategory,
    sourceType: KbSourceType,
  ): Promise<IngestTextResult> {
    let normalizedCourseId: CourseId;
    try {
      normalizedCourseId = normalizeCourseId(courseId);
    } catch {
      throw this.errorService.invalidRequest('courseId is required and must be a valid course id', {
        courseId,
      });
    }

    const parsedCategory = KbCategorySchema.safeParse(category);
    if (!parsedCategory.success) {
      throw this.errorService.invalidRequest('category is required and must be a valid KB category', {
        category,
        allowed: KbCategorySchema.options,
      });
    }
    if (!text?.trim()) {
      throw this.errorService.invalidRequest('text is required');
    }

    const chunks = this.chunkingService.chunkText(text, 500, 50);
    if (!chunks.length) {
      return {
        importedChunks: 0,
        indexed:        { skipped: 0, added: 0, deleted: 0 },
        sourceType,
        courseId:       normalizedCourseId,
        region:         normalizedCourseId,
        category:       parsedCategory.data,
      };
    }

    let importedChunks = 0;
    try {
      for (const chunk of chunks) {
        const dto: AddRuleDto = {
          content:    chunk,
          courseId:   normalizedCourseId,
          category:   parsedCategory.data,
          ruleNumber: null,
          title:      null,
          sourceType,
        };

        await this.rulesService.addRule(dto);
        importedChunks += 1;
      }
    } catch (error) {
      this.logger.error(
        `KB ingest failed after ${importedChunks}/${chunks.length} chunks (sourceType=${sourceType})`,
      );
      throw error;
    }

    // Push new SQLite chunks into this course's Upstash namespace.
    const indexed = await this.indexingService.reindexAll(normalizedCourseId);
    this.logger.log(
      `KB ingest done: ${importedChunks} chunks, courseId=${normalizedCourseId}, ` +
        `category=${parsedCategory.data}, upstash added=${indexed.added} skipped=${indexed.skipped}`,
    );

    return {
      importedChunks,
      indexed,
      sourceType,
      courseId: normalizedCourseId,
      region:   normalizedCourseId,
      category: parsedCategory.data,
    };
  }

  async importRulesFile(
    file: Express.Multer.File,
    courseId: string,
    category: KbCategory,
  ): Promise<IngestTextResult> {
    const extension = extname(file.originalname).toLowerCase();
    if (!extension) {
      throw this.errorService.invalidRequest('File extension is missing', { originalname: file.originalname });
    }

    const sourcePath = file.path || null;
    const displayName = basename(file.originalname || sourcePath || 'unknown');

    let extractedText = '';
    try {
      extractedText = await this.extractText(file, extension);
    } catch (error) {
      throw error;
    }

    const result = await this.ingestTextToKB(extractedText, courseId, category, 'document');

    if (sourcePath) {
      await fs.unlink(sourcePath);
      this.logger.log(`Imported ${result.importedChunks} chunks from ${displayName} and removed the source file`);
    } else {
      this.logger.log(
        `Imported ${result.importedChunks} chunks from ${displayName} (no on-disk source path to remove)`,
      );
    }

    return result;
  }

  async ingestLinkToKB(
    url: string,
    courseId: string,
    category: KbCategory,
  ): Promise<IngestTextResult> {
    if (!url?.trim()) {
      throw this.errorService.invalidRequest('url is required');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw this.errorService.invalidRequest('url is invalid', { url });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw this.errorService.invalidRequest('url must be http or https', { url });
    }

    const extractedText = await this.extractReadableTextFromUrl(parsedUrl.toString());
    if (!extractedText.trim()) {
      throw this.errorService.invalidRequest('No readable text could be extracted from the URL', { url });
    }

    this.logger.log(`Extracted ${extractedText.length} chars from link ${parsedUrl.toString()}`);
    return this.ingestTextToKB(extractedText, courseId, category, 'link');
  }

  private async extractReadableTextFromUrl(url: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; GolfRagBot/1.0; +https://localhost) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw this.errorService.invalidRequest('Failed to fetch URL', { url, message });
    }

    if (!response.ok) {
      throw this.errorService.invalidRequest('URL fetch returned an error status', {
        url,
        status: response.status,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      if (contentType && !contentType.includes('text/')) {
        throw this.errorService.invalidRequest('URL does not look like an HTML page', {
          url,
          contentType,
        });
      }
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    document.querySelectorAll('script, style, noscript, iframe, svg').forEach((el) => el.remove());

    const reader = new Readability(document);
    const article = reader.parse();

    if (article?.textContent?.trim()) {
      return article.textContent.replace(/\s+/g, ' ').trim();
    }

    const fallback = document.body?.textContent || '';
    return fallback.replace(/\s+/g, ' ').trim();
  }

  private async extractText(file: Express.Multer.File, extension: string): Promise<string> {
    if (extension === '.pdf') {
      const data = file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
      if (!data) {
        throw this.errorService.invalidRequest('PDF file data is missing', { originalname: file.originalname });
      }
      const parser = new PDFParse({ data });
      const parsed = await parser.getText();
      await parser.destroy();
      return parsed.text ?? '';
    }

    if (extension === '.docx') {
      const data = file.buffer ?? (file.path ? await fs.readFile(file.path) : null);
      if (!data) {
        throw this.errorService.invalidRequest('DOCX file data is missing', { originalname: file.originalname });
      }
      const extracted = await mammoth.extractRawText({ buffer: data });
      return extracted.value ?? '';
    }

    if (extension === '.txt') {
      if (file.buffer) {
        return file.buffer.toString('utf-8');
      }
      if (file.path) {
        return fs.readFile(file.path, 'utf-8');
      }
      throw this.errorService.invalidRequest('TXT file data is missing', { originalname: file.originalname });
    }

    throw this.errorService.invalidRequest('Unsupported file type', { extension });
  }
}
