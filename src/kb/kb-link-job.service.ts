// external modules
import { Injectable, Logger } from '@nestjs/common';

// utils/helpers
import { CourseId } from '../common/course-id';
import { ErrorService } from '../common/error.service';
import { KbCategory } from '../common/kb-category';
import { ImportService } from '../import/import.service';

const LINK_INGEST_DELAY_MS = 1500;
const LINK_INGEST_MAX_ATTEMPTS = 3;

export type LinkIngestUrlState = 'pending' | 'processing' | 'succeeded' | 'failed';

export type LinkIngestUrlEntry = {
  url:             string;
  status:          LinkIngestUrlState;
  importedChunks?: number;
  error?:          string;
  attempts?:       number;
};

export type LinkIngestJobStatus = {
  isProcessing: boolean;
  courseId:     string | null;
  category:     string | null;
  startedAt:    string | null;
  finishedAt:   string | null;
  total:        number;
  succeeded:    number;
  failed:       number;
  pending:      number;
  urls:         LinkIngestUrlEntry[];
};

type IngestUrlOutcome = {
  success:         boolean;
  importedChunks?: number;
  error?:          string;
  attempts:        number;
};

@Injectable()
export class KbLinkJobService {
  private readonly logger = new Logger(KbLinkJobService.name);
  private jobStatus: LinkIngestJobStatus = this.createIdleStatus();

  constructor(
    private readonly errorService: ErrorService,
    private readonly importService: ImportService,
  ) {}

  startProcessing(urls: string[], courseId: CourseId, category: KbCategory): void {
    if (this.jobStatus.isProcessing) {
      throw this.errorService.invalidRequest(
        'A link ingest batch is already in progress. Check GET /kb/link/status or wait for it to finish.',
      );
    }

    this.jobStatus = {
      isProcessing: true,
      courseId,
      category,
      startedAt:    new Date().toISOString(),
      finishedAt:   null,
      total:        urls.length,
      succeeded:    0,
      failed:       0,
      pending:      urls.length,
      urls:         urls.map((url) => ({ url, status: 'pending' })),
    };

    void this.processUrls(urls, courseId, category);
  }

  getStatus(): LinkIngestJobStatus {
    const succeeded = this.jobStatus.urls.filter((entry) => entry.status === 'succeeded').length;
    const failed    = this.jobStatus.urls.filter((entry) => entry.status === 'failed').length;
    const pending   = this.jobStatus.urls.filter((entry) => entry.status === 'pending').length;

    return {
      ...this.jobStatus,
      succeeded,
      failed,
      pending,
      urls: [...this.jobStatus.urls],
    };
  }

  private async processUrls(
    urls: string[],
    courseId: CourseId,
    category: KbCategory,
  ): Promise<void> {
    this.logger.log(
      `Link batch started: ${urls.length} URL(s), courseId=${courseId}, category=${category}`,
    );

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      this.updateUrlEntry(url, { status: 'processing' });

      const outcome = await this.ingestUrlWithRetries(url, courseId, category);

      if (outcome.success) {
        this.updateUrlEntry(url, {
          status:         'succeeded',
          importedChunks: outcome.importedChunks,
          attempts:       outcome.attempts,
          error:          undefined,
        });
      } else {
        this.updateUrlEntry(url, {
          status:   'failed',
          error:    outcome.error,
          attempts: outcome.attempts,
        });
      }

      if (i < urls.length - 1) {
        await this.sleep(LINK_INGEST_DELAY_MS);
      }
    }

    this.jobStatus.isProcessing = false;
    this.jobStatus.finishedAt   = new Date().toISOString();

    const status = this.getStatus();
    this.logger.log(
      `Link batch finished: ${urls.length} URL(s), courseId=${courseId}, category=${category}, ` +
        `succeeded=${status.succeeded}, failed=${status.failed}`,
    );
  }

  private async ingestUrlWithRetries(
    url: string,
    courseId: CourseId,
    category: KbCategory,
  ): Promise<IngestUrlOutcome> {
    let lastError = 'Unknown error';

    for (let attempt = 1; attempt <= LINK_INGEST_MAX_ATTEMPTS; attempt++) {
      try {
        const result = await this.importService.ingestLinkToKB(url, courseId, category);
        const retryNote = attempt > 1 ? ` on attempt ${attempt}/${LINK_INGEST_MAX_ATTEMPTS}` : '';
        this.logger.log(
          `Link ingest succeeded: ${url} (${result.importedChunks} chunks)${retryNote}`,
        );

        return {
          success:        true,
          importedChunks: result.importedChunks,
          attempts:       attempt,
        };
      } catch (error) {
        lastError = this.formatError(error);

        if (attempt < LINK_INGEST_MAX_ATTEMPTS) {
          this.logger.warn(
            `Link ingest failed (attempt ${attempt}/${LINK_INGEST_MAX_ATTEMPTS}): ${url} — ${lastError}; retrying...`,
          );
          await this.sleep(LINK_INGEST_DELAY_MS);
          continue;
        }

        console.error(
          `Link ingest failed (attempt ${attempt}/${LINK_INGEST_MAX_ATTEMPTS}): ${url} — ${lastError}`,
        );
      }
    }

    return {
      success:  false,
      error:    lastError,
      attempts: LINK_INGEST_MAX_ATTEMPTS,
    };
  }

  private updateUrlEntry(url: string, patch: Partial<LinkIngestUrlEntry>): void {
    const index = this.jobStatus.urls.findIndex((entry) => entry.url === url);
    if (index === -1) {
      return;
    }

    this.jobStatus.urls[index] = {
      ...this.jobStatus.urls[index],
      ...patch,
    };
  }

  private createIdleStatus(): LinkIngestJobStatus {
    return {
      isProcessing: false,
      courseId:     null,
      category:     null,
      startedAt:    null,
      finishedAt:   null,
      total:        0,
      succeeded:    0,
      failed:       0,
      pending:      0,
      urls:         [],
    };
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
