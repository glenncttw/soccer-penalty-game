/**
 * The big words after a shot (Glenn's lists, in Dutch for now): each kind of result has a few, and one is picked
 * at random, never the same one twice in a row, so it doesn't always feel the same.
 */
export const RESULT_WORDS = {
  goal: ['GOAL!', 'DIE ZIT!', 'BAM! BINNEN!', 'PRACHTIG!'],
  /** A perfect strike that goes in. */
  perfect: ['WERELDKLASSE!', 'ONHOUDBAAR!', 'WAT EEN SCHOT!'],
  /** A goal in a top corner. */
  corner: ['WINKELHAAK!', 'IN DE KRUISING!', 'PERFECT GEMIKT!'],
  saved: ['GEHOUDEN!', 'GEPAKT!', 'WAT EEN REDDING!'],
  /** Off a post and not in. */
  post: ['OP DE PAAL!', 'ZO DICHTBIJ!', 'PECH!'],
  /** Off the crossbar and not in. */
  bar: ['OP DE LAT!', 'BIJNA!', 'NET TE HOOG!'],
  miss: ['OEI!', 'AI AI AI!', 'VER NAAST!'],
};

export type ResultKind = keyof typeof RESULT_WORDS;

/** What kind of result a shot had, for its words. */
export function resultKind(shot: {
  result: 'goal' | 'saved' | 'miss';
  perfect: boolean;
  topCorner: boolean;
  firstFrame: 'post' | 'bar' | null;
}): ResultKind[] {
  if (shot.result === 'goal') {
    // A perfect strike into a top corner can have the words of either.
    const kinds: ResultKind[] = [];
    if (shot.perfect) kinds.push('perfect');
    if (shot.topCorner) kinds.push('corner');
    return kinds.length ? kinds : ['goal'];
  }
  if (shot.result === 'saved') return ['saved'];
  return [shot.firstFrame ?? 'miss'];
}

/** Picks the words for a result, never the ones it picked last time. */
export class ResultWords {
  private last = '';

  constructor(private readonly random: () => number = Math.random) {}

  pick(kinds: ResultKind[]) {
    const all = kinds.flatMap((kind) => RESULT_WORDS[kind]);
    const choices = all.length > 1 ? all.filter((words) => words !== this.last) : all;
    this.last = choices[Math.floor(this.random() * choices.length) % choices.length];
    return this.last;
  }
}
