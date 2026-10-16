import { PERFECT_MAX, PERFECT_MIN } from '../gameplay/power';

const SOUND_ON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const SOUND_OFF = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

/** HTML overlay: tips, score, keeper and sound buttons, power meter with its gold zone, and banners. */
export class Hud {
  /** Called when the player taps the sound button. */
  onToggleSound: () => void = () => {};
  /** Called when the player taps the keeper button. */
  onToggleKeeper: () => void = () => {};
  private readonly meter: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly score: HTMLElement;
  private readonly sound: HTMLButtonElement;
  private readonly keeper: HTMLButtonElement;
  private readonly pop: HTMLElement;
  private hintText = '';

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="score" hidden></div>
       <button class="keeper" type="button"></button>
       <button class="sound" type="button"></button>
       <div class="hint faded"></div>
       <div class="meter" hidden>
         <div class="meter-zone" style="bottom:${PERFECT_MIN * 100}%;height:${(PERFECT_MAX - PERFECT_MIN) * 100}%"></div>
         <div class="meter-fill"></div>
       </div>
       <div class="pop"></div>
       <div class="banner"></div>`,
    );
    this.score = root.querySelector('.score')!;
    this.sound = root.querySelector('.sound')!;
    this.keeper = root.querySelector('.keeper')!;
    this.hint = root.querySelector('.hint')!;
    this.meter = root.querySelector('.meter')!;
    this.fill = root.querySelector('.meter-fill')!;
    this.pop = root.querySelector('.pop')!;
    this.banner = root.querySelector('.banner')!;
    this.sound.addEventListener('click', () => this.onToggleSound());
    this.keeper.addEventListener('click', () => this.onToggleKeeper());
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

  showScore(goals: number, shots: number) {
    this.score.hidden = false;
    this.score.innerHTML = `<small>Goals</small> ${goals}<span>/${shots}</span>`;
  }

  showSound(on: boolean) {
    this.sound.innerHTML = on ? SOUND_ON : SOUND_OFF;
    this.sound.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  }

  /** Shows how good the keeper is; tapping the button changes it. */
  showKeeper(level: string) {
    const name = level.charAt(0).toUpperCase() + level.slice(1);
    this.keeper.innerHTML = `<small>Keeper</small>${name}`;
    this.keeper.setAttribute('aria-label', `Keeper: ${name}. Tap to change`);
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
