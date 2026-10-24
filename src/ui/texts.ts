/**
 * The words on the Croky Cup screens (intro, end) in Dutch and French. The browser's language picks
 * one (`setLanguage` can switch and remember it on this device). The words after a shot (GOAL!, GEHOUDEN!...) are in
 * src/ui/resultWords.ts (Dutch only for now).
 */
const NL = {
  lang: 'nl',
  title: 'Penalty Cup',
  play: 'Speel nu & Win',
  score: (goals: number, shots: number) => `${goals} van de ${shots} gescoord`,
  endTitle: (goals: number, shots: number): string =>
    goals === shots ? 'Perfect!' : goals >= Math.ceil(shots / 2) ? 'Goed gedaan!' : 'Volgende keer beter!',
  again: 'Speel opnieuw',
  scoreLabel: (goals: number, taken: number, shots: number) =>
    `${goals} goals, ${taken} van ${shots} penalty's genomen`,
};

export type Texts = typeof NL;

const NBSP = ' '; // French puts a space before ! and :, one that never breaks onto the next line

const FR: Texts = {
  lang: 'fr',
  title: 'Penalty Cup',
  play: 'Joue & Gagne',
  score: (goals, shots) => `${goals} sur ${shots} marqués`,
  endTitle: (goals, shots) =>
    goals === shots
      ? `Parfait${NBSP}!`
      : goals >= Math.ceil(shots / 2)
        ? `Bien joué${NBSP}!`
        : `La prochaine fois${NBSP}!`,
  again: 'Rejouer',
  scoreLabel: (goals, taken, shots) => `${goals} buts, ${taken} penalties tirés sur ${shots}`,
};

export const LANGUAGES = { nl: NL, fr: FR };
export type Language = keyof typeof LANGUAGES;

const LANGUAGE_KEY = 'crokycup:lang';

/** The words in the language being shown (changes with `setLanguage`). */
export let TEXTS: Texts = LANGUAGES[firstLanguage()];

/** Switches every screen's words to `lang` (the screens redraw themselves) and remembers it. */
export function setLanguage(lang: Language) {
  TEXTS = LANGUAGES[lang];
  try {
    localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    // private browsing: it just isn't remembered
  }
}

/** The language chosen before on this device, or else the browser's if it's French, or else Dutch. */
export function firstLanguage(): Language {
  let saved: string | null = null;
  try {
    saved = globalThis.localStorage?.getItem(LANGUAGE_KEY) ?? null;
  } catch {
    // no storage
  }
  if (saved === 'nl' || saved === 'fr') return saved;
  return globalThis.navigator?.language?.toLowerCase().startsWith('fr') ? 'fr' : 'nl';
}
