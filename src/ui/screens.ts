import type { ShotOutcome } from '../gameplay/round';
import { TEXTS } from './texts';

const LOGO_URL = `${import.meta.env.BASE_URL}assets/crowd/flag_logo.svg`;

/**
 * The Croky Cup screens over the live stadium: the intro (Speel nu, Info), the info card with
 * how to play, and the end of a round with the score. Plain HTML buttons, so the keyboard and
 * screen readers work with them too.
 */
export class Screens {
  onPlay: () => void = () => {};

  private readonly intro: HTMLElement;
  private readonly info: HTMLElement;
  private readonly end: HTMLElement;
  private infoFrom: HTMLElement | null = null; // where focus goes back to when the info card closes

  constructor(parent: HTMLElement) {
    const t = TEXTS;
    const rows = t.infoRows.map(([label, text]) => `<dt>${label}</dt><dd>${text}</dd>`).join('');
    const root = document.createElement('div');
    parent.append(root);
    root.insertAdjacentHTML(
      'beforeend',
      `<section class="screen intro" lang="${t.lang}" hidden>
         <div class="screen-body">
           <img class="screen-logo" src="${LOGO_URL}" alt="Croky" />
           <h1 class="screen-title">${t.title}</h1>
           <p class="screen-tagline">${t.tagline}</p>
           <button class="btn btn-primary" data-act="play">${t.play}</button>
           <button class="btn btn-secondary" data-act="info">${t.info}</button>
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
       </section>
       <div class="screen info" lang="${t.lang}" role="dialog" aria-modal="true" aria-labelledby="info-title" hidden>
         <div class="info-card">
           <button class="info-close" data-act="close" aria-label="${t.close}">✕</button>
           <h2 id="info-title">${t.infoTitle}</h2>
           <dl>${rows}</dl>
           <button class="btn btn-primary" data-act="close">${t.back}</button>
         </div>
       </div>`,
    );
    this.intro = root.querySelector('.screen.intro')!;
    this.info = root.querySelector('.screen.info')!;
    this.end = root.querySelector('.screen.end')!;

    for (const screen of [this.intro, this.end, this.info]) {
      screen.addEventListener('click', (e) => {
        const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
        if (act === 'play') this.onPlay();
        else if (act === 'info') this.openInfo();
        else if (act === 'menu') this.showIntro();
        else if (act === 'close' || e.target === this.info) this.closeInfo(); // also a tap beside the card
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && !this.info.hidden) this.closeInfo();
    });
  }

  /** True while a screen covers the game. */
  get open() {
    return !this.intro.hidden || !this.end.hidden;
  }

  showIntro() {
    this.end.hidden = true;
    this.intro.hidden = false;
    this.focus(this.intro);
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
    (document.activeElement as HTMLElement | null)?.blur(); // so Space doesn't press a hidden button
    this.intro.hidden = true;
    this.end.hidden = true;
    this.info.hidden = true;
  }

  private openInfo() {
    this.infoFrom = document.activeElement as HTMLElement | null;
    this.info.hidden = false;
    this.info.querySelector<HTMLElement>('.btn')!.focus();
  }

  private closeInfo() {
    this.info.hidden = true;
    this.infoFrom?.focus();
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
