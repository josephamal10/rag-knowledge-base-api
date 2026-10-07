// common helper used by ingest controllers to reject legacy region-only payloads
import { ErrorService } from './error.service';

/**
 * Legacy clients sent `region` as the corpus label.
 * Course identity is now `courseId` (Upstash namespace); region is derived as region = courseId.
 */
export function rejectLegacyRegionWithoutCourseId(
  errorService: ErrorService,
  body: { region?: unknown; courseId?: unknown },
): void {
  const region =
    typeof body?.region === 'string' ? body.region.trim() : '';
  const courseId =
    typeof body?.courseId === 'string' ? body.courseId.trim() : '';

  if (region && !courseId) {
    throw errorService.invalidRequest(
      'region is no longer accepted as the course identity. Pass courseId instead ' +
        '(Upstash namespace). region is set automatically to match courseId on ingest.',
      { received: { region }, use: 'courseId' },
    );
  }
}
