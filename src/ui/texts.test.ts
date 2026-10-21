import { describe, expect, it } from 'vitest';
import { LANGUAGES, setLanguage, TEXTS } from './texts';

describe('texts', () => {
  it('has every word in every language', () => {
    const keys = (o: object) => Object.keys(o).sort();
    for (const t of Object.values(LANGUAGES)) {
      expect(keys(t)).toEqual(keys(LANGUAGES.nl));
      expect(keys(t.pages)).toEqual(keys(LANGUAGES.nl.pages));
    }
    expect(LANGUAGES.nl.play).toBe('Speel nu & Win');
  });

  it('switches language', () => {
    setLanguage('fr');
    expect(TEXTS.lang).toBe('fr');
    setLanguage('nl');
    expect(TEXTS.play).toBe('Speel nu & Win');
  });
});
