import type { ShotOutcome } from '../gameplay/round';
import { TEXTS, type Texts } from './texts';

const LOGO_URL = `${import.meta.env.BASE_URL}assets/crowd/flag_logo.svg`;
const LEAVE_TIME = 300; // milliseconds, as long as the intro-leave animations in style.css

type TextKey = { [K in keyof Texts]: Texts[K] extends string ? K : never }[keyof Texts];

/**
 * The Croky Cup screens: the intro (Glenn's landing design: logo, title, the 3D ball and Speel nu & Win)
 * and the end of a round with the score. Plain HTML buttons, so the keyboard and screen readers work
 * with them too.
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
  private readonly introTop: HTMLElement;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement) {
    const root = (this.root = document.createElement('div'));
    parent.append(root);
    root.insertAdjacentHTML(
      'beforeend',
      `<section class="screen intro" hidden>
         <div class="screen-body">
           <div class="intro-ball" aria-hidden="true"></div>
           <div class="intro-top">
             <img class="intro-logo" src="${LOGO_URL}" alt="Croky" />
             <h1 class="intro-title" data-text="title"></h1>
           </div>
           <div class="intro-bottom">
             <button class="btn btn-primary intro-play" data-act="play" data-text="play"></button>
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
    this.introTop = root.querySelector('.intro-top')!;
    this.applyTexts();

    for (const screen of [this.intro, this.end]) {
      screen.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
        const act = el?.dataset.act;
        if (act === 'play') this.onPlay();
        else if (act === 'menu') this.showIntro();
      });
    }
    // The intro's button ring shows for keyboard users only (see .keys in style.css).
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') root.classList.add('keys');
    });
    window.addEventListener('pointerdown', () => root.classList.remove('keys'));
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

  /**
   * Where the 3D ball is on screen (CSS pixels), so the intro's title is cut away there and the ball shows in
   * front of it. Call every frame while the intro is up.
   */
  followBall(x: number, y: number, radius: number) {
    const s = this.introTop.style;
    s.setProperty('--ball-x', `${x.toFixed(1)}px`);
    s.setProperty('--ball-y', `${y.toFixed(1)}px`);
    s.setProperty('--ball-r', `${Math.max(0, radius).toFixed(1)}px`);
  }

  /** Speel nu & Win: the title moves up and the button down, out of the way of the ball, then the intro closes. */
  leaveIntro() {
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
    this.intro.classList.remove('leaving');
    (document.activeElement as HTMLElement | null)?.blur(); // so Space doesn't press a hidden button
    this.intro.hidden = true;
    this.end.hidden = true;
  }

  /** Puts the words of the chosen language into every screen. */
  private applyTexts() {
    const t = TEXTS;
    for (const section of [this.intro, this.end]) section.lang = t.lang;
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-text]'))
      el.textContent = t[el.dataset.text as TextKey];
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
