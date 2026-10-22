import type { ShotOutcome } from '../gameplay/round';
import { LINKS } from './links';
import { LANGUAGES, setLanguage, TEXTS, type Language, type Page, type Texts } from './texts';

const LOGO_URL = `${import.meta.env.BASE_URL}assets/crowd/flag_logo.svg`;
const LEAVE_TIME = 300; // milliseconds, as long as the intro-leave animations in style.css

type TextKey = { [K in keyof Texts]: Texts[K] extends string ? K : never }[keyof Texts];

/**
 * The Croky Cup screens: the intro (Speel nu & Win, and a menu in the top right corner with the
 * prizes, the terms, the cookie policy and the language) and the end of a round with the score.
 * Plain HTML buttons, so the keyboard and screen readers work with them too.
 */
export class Screens {
  onPlay: () => void = () => {};
  /** The intro just came up (the 3D ball goes into `ballSlot`). */
  onIntro: () => void = () => {};
  /** The empty space in the middle of the intro where the real 3D ball is drawn, by the canvas underneath. */
  readonly ballSlot: HTMLElement;

  private readonly root: HTMLElement;
  private readonly intro: HTMLElement;
  private readonly end: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly menuToggle: HTMLElement;
  private readonly menuMain: HTMLElement;
  private readonly menuPage: HTMLElement;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;
  private lastEnd: Parameters<Screens['showEnd']> | null = null;

  constructor(parent: HTMLElement) {
    const root = (this.root = document.createElement('div'));
    parent.append(root);
    const languages = Object.keys(LANGUAGES)
      .map((l) => `<button class="menu-lang-option" data-act="lang" data-lang="${l}">${l.toUpperCase()}</button>`)
      .join('');
    root.insertAdjacentHTML(
      'beforeend',
      `<section class="screen intro" hidden>
         <div class="screen-body">
           <div class="intro-top">
             <img class="screen-logo" src="${LOGO_URL}" alt="Croky" />
             <h1 class="screen-title" data-text="title"></h1>
           </div>
           <div class="intro-ball" aria-hidden="true"></div>
           <div class="intro-bottom">
             <button class="btn btn-primary" data-act="play" data-text="play"></button>
           </div>
         </div>
         <button class="menu-toggle" data-act="menu-open" aria-expanded="false" aria-controls="intro-menu"
           data-label="openMenu"><span></span><span></span><span></span></button>
         <div class="menu" id="intro-menu" role="dialog" aria-modal="true" data-label="menu" hidden>
           <div class="menu-shade" data-act="menu-close"></div>
           <div class="menu-panel">
             <button class="menu-close" data-act="menu-close" data-label="closeMenu">✕</button>
             <div class="menu-main">
               <button class="btn btn-primary" data-act="play" data-text="play"></button>
               <button class="btn btn-secondary" data-act="page" data-page="prizes" data-text="prizes"></button>
               <div class="menu-links">
                 <button class="menu-link" data-act="page" data-page="terms" data-text="terms"></button>
                 <button class="menu-link" data-act="page" data-page="cookies" data-text="cookies"></button>
               </div>
               <div class="menu-lang" role="group" data-label="language">
                 <span class="menu-lang-label" data-text="language"></span>${languages}
               </div>
             </div>
             <div class="menu-page" hidden>
               <h2 class="menu-page-title"></h2>
               <p class="menu-page-text"></p>
               <button class="btn btn-secondary" data-act="page-back" data-text="back"></button>
             </div>
           </div>
         </div>
       </section>
       <section class="screen end" hidden>
         <div class="screen-body">
           <h1 class="screen-title end-title"></h1>
           <div class="end-balls"></div>
           <p class="screen-tagline end-score"></p>
           <p class="end-best"></p>
           <button class="btn btn-primary" data-act="play" data-text="again"></button>
           <button class="btn btn-secondary" data-act="menu" data-text="menu"></button>
         </div>
       </section>`,
    );
    this.intro = root.querySelector('.screen.intro')!;
    this.end = root.querySelector('.screen.end')!;
    this.ballSlot = root.querySelector('.intro-ball')!;
    this.menu = root.querySelector('.menu')!;
    this.menuToggle = root.querySelector('.menu-toggle')!;
    this.menuMain = root.querySelector('.menu-main')!;
    this.menuPage = root.querySelector('.menu-page')!;
    this.applyTexts();

    for (const screen of [this.intro, this.end]) {
      screen.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
        const act = el?.dataset.act;
        if (act === 'play') this.onPlay();
        else if (act === 'menu') this.showIntro();
        else if (act === 'menu-open') this.openMenu();
        else if (act === 'menu-close') this.closeMenu();
        else if (act === 'page') this.openPage(el!.dataset.page as Page);
        else if (act === 'page-back') this.closePage();
        else if (act === 'lang') this.switchLanguage(el!.dataset.lang as Language);
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || this.menu.hidden) return;
      if (!this.menuPage.hidden) this.closePage();
      else this.closeMenu();
    });
  }

  /** True while a screen covers the game. */
  get open() {
    return !this.intro.hidden || !this.end.hidden;
  }

  /** True while the end of a round shows. */
  get endShown() {
    return !this.end.hidden;
  }

  /** True while the intro is up (and not on its way out). */
  get introShown() {
    return !this.intro.hidden && !this.intro.classList.contains('leaving');
  }

  showIntro() {
    clearTimeout(this.leaveTimer);
    this.end.hidden = true;
    this.intro.classList.remove('leaving');
    this.intro.hidden = false;
    this.focus(this.intro);
    this.onIntro();
  }

  /** Speel nu & Win: the title moves up and the button down, out of the way of the ball, then the intro closes. */
  leaveIntro() {
    this.closeMenu(false);
    (document.activeElement as HTMLElement | null)?.blur();
    this.intro.classList.add('leaving');
    clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => {
      this.intro.hidden = true;
      this.intro.classList.remove('leaving');
    }, LEAVE_TIME);
  }

  /** The end of a round: how it went, the record on this device, and play again or back to the menu. */
  showEnd(results: ShotOutcome[], shots: number, best: number | null, newBest: boolean) {
    this.lastEnd = [results, shots, best, newBest];
    const goals = results.filter((r) => r === 'goal').length;
    this.end.querySelector('.end-title')!.textContent = TEXTS.endTitle(goals, shots);
    this.end.querySelector('.end-balls')!.innerHTML = scoreBalls(results, shots);
    this.end.querySelector('.end-score')!.textContent = TEXTS.score(goals, shots);
    this.end.querySelector('.end-best')!.textContent = newBest ? TEXTS.newBest : best !== null ? TEXTS.best(best) : '';
    this.intro.hidden = true;
    this.end.hidden = false;
    this.focus(this.end);
  }

  hide() {
    clearTimeout(this.leaveTimer);
    this.closeMenu(false);
    this.intro.classList.remove('leaving');
    (document.activeElement as HTMLElement | null)?.blur(); // so Space doesn't press a hidden button
    this.intro.hidden = true;
    this.end.hidden = true;
  }

  private openMenu() {
    this.closePage(false);
    this.menu.hidden = false;
    this.menuToggle.setAttribute('aria-expanded', 'true');
    this.menuMain.querySelector<HTMLElement>('.btn')!.focus();
  }

  private closeMenu(refocus = true) {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.menuToggle.setAttribute('aria-expanded', 'false');
    if (refocus) this.menuToggle.focus();
  }

  /** The prizes, terms or cookie policy: their own page if there's a link, else a short text in the menu. */
  private openPage(page: Page) {
    const link = LINKS[TEXTS.lang as Language][page];
    if (link) {
      window.open(link, '_blank', 'noopener');
      return;
    }
    this.menuPage.dataset.page = page;
    this.menuPage.querySelector('.menu-page-title')!.textContent = TEXTS.pages[page].title;
    this.menuPage.querySelector('.menu-page-text')!.textContent = TEXTS.pages[page].text;
    this.menuMain.hidden = true;
    this.menuPage.hidden = false;
    this.menuPage.querySelector<HTMLElement>('.btn')!.focus();
  }

  private closePage(refocus = true) {
    if (this.menuPage.hidden) return;
    const page = this.menuPage.dataset.page;
    this.menuPage.hidden = true;
    this.menuMain.hidden = false;
    if (refocus) this.menuMain.querySelector<HTMLElement>(`[data-page="${page}"]`)?.focus();
  }

  private switchLanguage(lang: Language) {
    setLanguage(lang);
    this.applyTexts();
    if (!this.menuPage.hidden) this.openPage(this.menuPage.dataset.page as Page);
    if (this.lastEnd && !this.end.hidden) this.showEnd(...this.lastEnd);
  }

  /** Puts the words of the chosen language into every screen. */
  private applyTexts() {
    const t = TEXTS;
    for (const section of [this.intro, this.end]) section.lang = t.lang;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-text]'))
      el.textContent = t[el.dataset.text as TextKey];
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-label]')) {
      el.setAttribute('aria-label', t[el.dataset.label as TextKey]);
    }
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-lang]')) {
      el.setAttribute('aria-pressed', String(el.dataset.lang === t.lang));
    }
  }

  private focus(screen: HTMLElement) {
    screen.querySelector<HTMLElement>('.btn-primary')!.focus({ preventScroll: true });
  }
}

/** A row of little balls, one per penalty: ✓ for a goal, ✕ for a miss, empty for one still to take. */
export function scoreBalls(results: ShotOutcome[], shots: number) {
  return Array.from({ length: shots }, (_, i) => {
    const r = results[i];
    const kind = r === undefined ? 'todo' : r === 'goal' ? 'goal' : 'miss';
    return `<span class="ball ${kind}">${kind === 'goal' ? '✓' : kind === 'miss' ? '✕' : ''}</span>`;
  }).join('');
}
