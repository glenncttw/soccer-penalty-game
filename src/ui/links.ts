import type { Language, Page } from './texts';

/**
 * Where the intro menu's buttons go, per language. Left empty, a button opens a short placeholder
 * text in the menu instead (see `pages` in src/ui/texts.ts). Put a full address in to open that page.
 */
export const LINKS: Record<Language, Record<Page, string>> = {
  nl: { prizes: '', terms: '', cookies: '' },
  fr: { prizes: '', terms: '', cookies: '' },
};
