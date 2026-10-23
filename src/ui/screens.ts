import type { ShotOutcome } from '../gameplay/round';
import { TEXTS, type Texts } from './texts';

const LOGO_URL = `${import.meta.env.BASE_URL}assets/crowd/flag_logo.svg`;
const LEAVE_TIME = 300; // milliseconds, as long as the intro-leave animations in style.css
export const ENTER_TIME = 2100; // milliseconds of the intro's entrance after loading (the intro-enter animations in style.css)
const ARCH = 22 / 135; // how much higher the middle of the title is than its ends, in its letters' height (22 px)

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
  private readonly title: HTMLElement;
  private leaveTimer: ReturnType<typeof setTimeout> | undefined;
  private enterTimer: ReturnType<typeof setTimeout> | undefined;

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
             <h1 class="intro-title"></h1>
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
    this.title = root.querySelector('.intro-title')!;
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

  /**
   * Shows the intro. With `enter` (the first time, after loading) it builds itself up: a circle opens on the
   * tunnel, then (while the ball flies in) the logo drops in, the title's letters pop up one by one and the
   * button comes up with a wiggle.
   */
  showIntro(enter = false) {
    clearTimeout(this.leaveTimer);
    clearTimeout(this.enterTimer);
    this.end.hidden = true;
    this.intro.classList.remove('leaving');
    // Once in, it stays 'entered' (not back to plain), or the screens' own pop would start then, after the entrance.
    this.intro.classList.remove('entered');
    this.intro.classList.toggle('entering', enter);
    if (enter) this.enterTimer = setTimeout(() => this.intro.classList.replace('entering', 'entered'), ENTER_TIME);
    this.intro.hidden = false;
    this.focus(this.intro);
    this.onIntro();
  }

  /**
   * Where the 3D ball is on screen (CSS pixels), so the intro's title is cut away there and the ball shows in
   * front of it. Call every frame while the intro is up.
   */
  followBall(x: number, y: number, radiusX: number, radiusY = radiusX) {
    const s = this.introTop.style;
    s.setProperty('--ball-x', `${x.toFixed(1)}px`);
    s.setProperty('--ball-y', `${y.toFixed(1)}px`);
    s.setProperty('--ball-rx', `${Math.max(0, radiusX).toFixed(1)}px`);
    s.setProperty('--ball-ry', `${Math.max(0, radiusY).toFixed(1)}px`);
  }

  /** The game behind the intro is in (Speel nu stops waiting). */
  gameIn() {
    this.intro.querySelector<HTMLElement>('.intro-play')!.classList.remove('waiting');
  }

  /** Speel nu was pressed before the game is in: the button wiggles, and the game starts once it's in. */
  waitToPlay() {
    const button = this.intro.querySelector<HTMLElement>('.intro-play')!;
    button.classList.remove('waiting');
    void button.offsetWidth; // so the wiggle starts again on every press
    button.classList.add('waiting');
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
    this.setTitle(t.title);
  }

  /**
   * The title, on a gentle arch: one span per letter, each moved onto the arch and turned along it. The
   * words themselves stay underneath, unseen, so the title keeps its size and screen readers read it whole.
   */
  private setTitle(text: string) {
    const upper = text.toLocaleUpperCase(TEXTS.lang);
    const line = document.createElement('span');
    line.className = 'intro-title-line';
    line.textContent = upper;
    const arch = document.createElement('span');
    arch.className = 'intro-title-arch';
    let n = 0;
    const letters = [...upper].map((ch) => {
      const letter = document.createElement('span');
      letter.textContent = ch;
      if (ch.trim()) letter.style.setProperty('--n', String(n++)); // its turn in the entrance
      return letter;
    });
    arch.append(...letters);
    this.title.replaceChildren(line, arch);
    this.title.setAttribute('aria-label', text);
    line.setAttribute('aria-hidden', 'true');
    arch.setAttribute('aria-hidden', 'true');
    // Measured once the font is in: where each letter sits in the words (with the font's own spacing between
    // letter pairs), in the letters' height (em), so it fits at any size.
    void document.fonts.load('700 100px Bazinga').then(() => {
      const places = letterPlaces(this.title, upper);
      const width = places.width;
      places.letters.forEach(({ left, width: w }, i) => {
        const centre = left + w / 2 - width / 2;
        const { drop, turn } = onArch(centre, width / 2, ARCH);
        const st = letters[i].style;
        st.left = `${left.toFixed(4)}em`;
        st.translate = `0 ${(drop - ARCH / 2).toFixed(4)}em`; // the middle up and the ends down, round where it was
        st.rotate = `${turn.toFixed(2)}deg`;
      });
    });
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

/**
 * Where each letter of `text` sits when written like `like` (its font, size and spacing), measured on an unturned
 * copy: from the left, and how wide, in the letters' height (em); and how wide all of it is.
 */
function letterPlaces(like: HTMLElement, text: string) {
  const css = getComputedStyle(like);
  const probe = document.createElement('span');
  probe.textContent = text;
  Object.assign(probe.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    visibility: 'hidden',
    whiteSpace: 'nowrap',
    font: css.font,
    letterSpacing: css.letterSpacing,
    wordSpacing: css.wordSpacing,
    fontKerning: css.fontKerning,
  });
  document.body.append(probe);
  const em = parseFloat(css.fontSize) || 1;
  const box = probe.getBoundingClientRect();
  const range = document.createRange();
  const node = probe.firstChild!;
  const letters = [...text].map((_, i) => {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getBoundingClientRect();
    return { left: (r.left - box.left) / em, width: r.width / em };
  });
  const width = box.width / em;
  probe.remove();
  return { letters, width };
}

/**
 * A letter `x` from the middle of a title `half` wide, on an arch whose middle is `rise` higher than its ends:
 * how far down from the top of the arch it is, and how far it's turned along it (degrees, clockwise).
 */
export function onArch(x: number, half: number, rise: number) {
  const radius = (half * half + rise * rise) / (2 * rise);
  const drop = radius - Math.sqrt(Math.max(0, radius * radius - x * x));
  return { drop, turn: DEGREES * Math.asin(Math.min(1, Math.max(-1, x / radius))) };
}

const DEGREES = 180 / Math.PI;
