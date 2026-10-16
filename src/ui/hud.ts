import { PERFECT_MAX, PERFECT_MIN } from '../gameplay/power';

/** HTML overlay: hint, power meter with its gold zone, and result banner. */
export class Hud {
  private readonly meter: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly hint: HTMLElement;

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="hint">Aim · hold to power up · drag to curl · let go to shoot</div>
       <div class="meter" hidden>
         <div class="meter-zone" style="bottom:${PERFECT_MIN * 100}%;height:${(PERFECT_MAX - PERFECT_MIN) * 100}%"></div>
         <div class="meter-fill"></div>
       </div>
       <div class="banner"></div>`,
    );
    this.hint = root.querySelector('.hint')!;
    this.meter = root.querySelector('.meter')!;
    this.fill = root.querySelector('.meter-fill')!;
    this.banner = root.querySelector('.banner')!;
  }

  showPower(value: number | null) {
    this.meter.hidden = value === null;
    if (value !== null) this.fill.style.height = `${value * 100}%`;
  }

  showBanner(text: string, sub = '', gold = false) {
    this.banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.banner.classList.toggle('gold', gold);
    this.banner.classList.remove('show');
    void this.banner.offsetWidth; // restart the pop animation
    this.banner.classList.add('show');
  }

  hideBanner() {
    this.banner.classList.remove('show');
  }

  hideHint() {
    this.hint.classList.add('faded');
  }
}
