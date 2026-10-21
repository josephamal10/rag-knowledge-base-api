import { ErrorService } from '../common/error.service';
import { KB_CATEGORY_INFO } from '../common/kb-category';
import { CategoryClassifierService } from './category-classifier.service';

describe('CategoryClassifierService', () => {
  const service = new CategoryClassifierService({ get: () => 'key' } as never, new ErrorService());

  describe('parseClassification', () => {
    it('reads plain JSON', () => {
      expect(service.parseClassification('{"categories":["lodging-info"],"reason":"rooms"}')).toEqual({
        categories: ['lodging-info'],
        reason:     'rooms',
      });
    });

    it('reads JSON wrapped in a markdown code fence', () => {
      const raw = '```json\n{"categories":["events-info"]}\n```';
      expect(service.parseClassification(raw).categories).toEqual(['events-info']);
    });

    it('drops unknown categories and duplicates', () => {
      const raw = '{"categories":["golf-rules","made-up","golf-rules","contact-info"]}';
      expect(service.parseClassification(raw).categories).toEqual(['golf-rules', 'contact-info']);
    });

    it('treats junk or the wrong shape as "no category"', () => {
      expect(service.parseClassification('I think it is about golf').categories).toEqual([]);
      expect(service.parseClassification('{"categories": "golf-rules"}').categories).toEqual([]);
      expect(service.parseClassification('{not json}').categories).toEqual([]);
      expect(service.parseClassification('').categories).toEqual([]);
    });
  });

  it('includes every category id and its description in the prompt', () => {
    const prompt = service.buildPrompt('Can I bring my dog?');
    for (const [id, info] of Object.entries(KB_CATEGORY_INFO)) {
      expect(prompt).toContain(`- ${id}: ${info.description}`);
    }
    expect(prompt).toContain('Can I bring my dog?');
  });
});
