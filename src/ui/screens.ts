import type { ShotOutcome } from '../gameplay/round';
import { TEXTS } from './texts';

const LOGO_URL = `${import.meta.env.BASE_URL}assets/crowd/flag_logo.svg`;
const LEAVE_TIME = 300; // milliseconds, as long as the intro-leave animations in style.css

/**
 * The Croky Cup screens: the intro (Speel nu & Win) and the end of a round with the score. Plain
 * HTML buttons, so the keyboard and screen readers work with them too.
 */
export class Screens {
  onPlay: () => void = () => {};
  /** The intro just came up (the 3D ball goes into `ballSlot`). */
  onIntro: () => void = () => {};
  /** The empty space in the middle of the intro where the real 3D ball is drawn, by the canvas underneath. */
  readonly ballSlot: HTMLElement;

  private readonly intro: HTMLElement;
  private readonly end: HTMLElement;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(parent: HTMLElement) {
    const t = TEXTS;
    const root = document.createElement('div');
    parent.append(root);
    root.insertAdjacentHTML(
      'beforeend',
      `<section class="screen intro" lang="${t.lang}" hidden>
         <div class="screen-body">
           <div class="intro-top">
             <img class="screen-logo" src="${LOGO_URL}" alt="Croky" />
             <h1 class="screen-title">${t.title}</h1>
           </div>
           <div class="intro-ball" aria-hidden="true"></div>
           <div class="intro-bottom">
             <button class="btn btn-primary" data-act="play">${escapeHtml(t.play)}</button>
           </div>
         </div>
       </section>
       <section class="screen end" lang="${t.lang}" hidden>
         <div class="screen-body">
           <h1 class="screen-title end-title"></h1>
           <div class="end-balls"></div>
           <p class="screen-tagline end-score"></p>
           <p class="end-best"></p>
           <button class="btn btn-primary" data-act="play">${t.again}</button>
           <button class="btn btn-secondary" data-act="menu">${t.menu}</button>
         </div>
       </section>`,
    );
    this.intro = root.querySelector('.screen.intro')!;
    this.end = root.querySelector('.screen.end')!;
    this.ballSlot = root.querySelector('.intro-ball')!;

    for (const screen of [this.intro, this.end]) {
      screen.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
        if (act === 'play') this.onPlay();
        else if (act === 'menu') this.showIntro();
      });
    }
  }

  /** True while a screen covers the game. */
  get open() {
    return !this.intro.hidden || !this.end.hidden;
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

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
