/**
 * The words on the Croky Cup screens (intro, its menu, end) in Dutch and French. The menu's language
 * switch picks one; the choice is remembered on this device, and the first time it follows the
 * browser's language. The in-game banners (GOAL!, SAVED!) and tips are still in src/main.ts and
 * src/ui/coach.ts (English).
 */
const NL = {
  lang: 'nl',
  title: 'Croky Cup',
  play: 'Speel nu & Win',
  prizes: 'Bekijk de prijzen',
  terms: 'Algemene voorwaarden',
  cookies: 'Cookiebeleid',
  language: 'Taal',
  openMenu: 'Menu openen',
  closeMenu: 'Menu sluiten',
  back: 'Terug',
  /** What the menu's buttons show until there are real links (see src/ui/links.ts). */
  pages: {
    prizes: { title: 'Prijzen', text: 'Hier komen de prijzen die je kunt winnen. De tekst volgt nog.' },
    terms: { title: 'Algemene voorwaarden', text: 'Hier komen de algemene voorwaarden. De tekst volgt nog.' },
    cookies: { title: 'Cookiebeleid', text: 'Hier komt het cookiebeleid. De tekst volgt nog.' },
  },
  score: (goals: number, shots: number) => `${goals} van de ${shots} gescoord`,
  endTitle: (goals: number, shots: number): string =>
    goals === shots ? 'Perfect!' : goals >= Math.ceil(shots / 2) ? 'Goed gedaan!' : 'Volgende keer beter!',
  best: (goals: number) => `Je record: ${goals}`,
  newBest: 'Nieuw record!',
  again: 'Speel opnieuw',
  menu: 'Menu',
  scoreLabel: (goals: number, taken: number, shots: number) =>
    `${goals} goals, ${taken} van ${shots} penalty's genomen`,
};

export type Texts = typeof NL;
export type Page = keyof Texts['pages'];

const NBSP = ' '; // French puts a space before ! and :, one that never breaks onto the next line

const FR: Texts = {
  lang: 'fr',
  title: 'Croky Cup',
  play: 'Joue & Gagne',
  prizes: 'Voir les prix',
  terms: 'Conditions générales',
  cookies: 'Politique de cookies',
  language: 'Langue',
  openMenu: 'Ouvrir le menu',
  closeMenu: 'Fermer le menu',
  back: 'Retour',
  pages: {
    prizes: { title: 'Prix', text: 'Ici viendront les prix à gagner. Le texte suit.' },
    terms: { title: 'Conditions générales', text: 'Ici viendront les conditions générales. Le texte suit.' },
    cookies: { title: 'Politique de cookies', text: 'Ici viendra la politique de cookies. Le texte suit.' },
  },
  score: (goals, shots) => `${goals} sur ${shots} marqués`,
  endTitle: (goals, shots) =>
    goals === shots
      ? `Parfait${NBSP}!`
      : goals >= Math.ceil(shots / 2)
        ? `Bien joué${NBSP}!`
        : `La prochaine fois${NBSP}!`,
  best: (goals) => `Ton record${NBSP}: ${goals}`,
  newBest: `Nouveau record${NBSP}!`,
  again: 'Rejouer',
  menu: 'Menu',
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
