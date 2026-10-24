import { describe, expect, it } from 'vitest';
import { RESULT_WORDS, ResultWords, resultKind } from './resultWords';

const shot = (over: Partial<Parameters<typeof resultKind>[0]>) =>
  resultKind({ result: 'goal', perfect: false, topCorner: false, firstFrame: null, ...over });

describe('resultKind', () => {
  it('picks the right list for each kind of shot', () => {
    expect(shot({})).toEqual(['goal']);
    expect(shot({ perfect: true })).toEqual(['perfect']);
    expect(shot({ topCorner: true })).toEqual(['corner']);
    expect(shot({ perfect: true, topCorner: true })).toEqual(['perfect', 'corner']);
    expect(shot({ firstFrame: 'post' })).toEqual(['goal']); // in off the post is still a goal
    expect(shot({ result: 'saved', firstFrame: 'bar' })).toEqual(['saved']);
    expect(shot({ result: 'miss', firstFrame: 'post' })).toEqual(['post']);
    expect(shot({ result: 'miss', firstFrame: 'bar' })).toEqual(['bar']);
    expect(shot({ result: 'miss' })).toEqual(['miss']);
  });
});

describe('ResultWords', () => {
  it('only picks words from the lists asked for', () => {
    const words = new ResultWords();
    for (let i = 0; i < 50; i++) expect(RESULT_WORDS.post).toContain(words.pick(['post']));
  });

  it('never picks the same words twice in a row', () => {
    const words = new ResultWords();
    let last = '';
    for (let i = 0; i < 200; i++) {
      const next = words.pick(['goal']);
      expect(next).not.toBe(last);
      last = next;
    }
  });

  it('uses every word in a list', () => {
    const words = new ResultWords();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(words.pick(['miss']));
    expect([...seen].sort()).toEqual([...RESULT_WORDS.miss].sort());
  });
});
