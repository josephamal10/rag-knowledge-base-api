import { normalizeCourseId, tryNormalizeCourseId } from './course-id';

describe('course id', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeCourseId('  Demo-Club ')).toBe('demo-club');
  });

  it('accepts lowercase letters, digits, dashes and underscores', () => {
    expect(tryNormalizeCourseId('club_2-north')).toBe('club_2-north');
  });

  it('rejects anything that could not be an Upstash namespace', () => {
    expect(tryNormalizeCourseId('')).toBeNull();
    expect(tryNormalizeCourseId('-starts-with-dash')).toBeNull();
    expect(tryNormalizeCourseId('has space')).toBeNull();
    expect(tryNormalizeCourseId('x'.repeat(65))).toBeNull();
    expect(tryNormalizeCourseId(42)).toBeNull();
  });
});
