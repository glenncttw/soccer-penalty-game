import { PERFECT_MAX, PERFECT_MIN } from '../gameplay/power';
import type { ShotOutcome } from '../gameplay/round';
import { scoreBalls } from './screens';
import { TEXTS } from './texts';

/** HTML overlay: tips, the round's score, power meter with its gold zone, and banners. */
export class Hud {
  private readonly meter: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly pop: HTMLElement;
  private readonly score: HTMLElement;
  private hintText = '';

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hint faded"></div>
       <div class="meter" hidden>
         <div class="meter-zone" style="bottom:${PERFECT_MIN * 100}%;height:${(PERFECT_MAX - PERFECT_MIN) * 100}%"></div>
         <div class="meter-fill"></div>
       </div>
       <div class="score" role="status" hidden></div>
       <div class="pop"></div>
       <div class="banner"></div>`,
    );
    this.hint = root.querySelector('.hint')!;
    this.meter = root.querySelector('.meter')!;
    this.fill = root.querySelector('.meter-fill')!;
    this.pop = root.querySelector('.pop')!;
    this.banner = root.querySelector('.banner')!;
    this.score = root.querySelector('.score')!;
  }

  /** The round's penalties at the top, one ball each; hidden with null. */
  showScore(results: ShotOutcome[] | null, shots: number) {
    this.score.hidden = results === null;
    if (results === null) return;
    const goals = results.filter((r) => r === 'goal').length;
    this.score.innerHTML = scoreBalls(results, shots);
    this.score.setAttribute('aria-label', TEXTS.scoreLabel(goals, results.length, shots));
    this.score.children[results.length - 1]?.classList.add('new'); // the latest one pops in
  }

  /** Shows a tip at the top, or fades it out with null. */
  showHint(text: string | null) {
    if (text === null) {
      this.hint.classList.add('faded');
      return;
    }
    if (text !== this.hintText) {
      this.hintText = text;
      this.hint.textContent = text;
    }
    this.hint.classList.remove('faded');
  }

  showPower(value: number | null) {
    this.meter.hidden = value === null;
    if (value !== null) this.fill.style.height = `${value * 100}%`;
  }

  /** A quick word that pops up where the meter was, like "PERFECT!". */
  popWord(text: string) {
    this.pop.textContent = text;
    restartAnimation(this.pop, 'show');
  }

  showBanner(text: string, sub = '', gold = false) {
    this.banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.banner.classList.toggle('gold', gold);
    restartAnimation(this.banner, 'show');
  }

  hideBanner() {
    this.banner.classList.remove('show');
  }
}

function restartAnimation(el: HTMLElement, className: string) {
  el.classList.remove(className);
  void el.offsetWidth; // forces the browser to notice, so the animation plays again
  el.classList.add(className);
}
