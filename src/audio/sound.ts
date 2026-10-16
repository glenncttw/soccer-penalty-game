/**
 * Game sounds, all made from scratch with the Web Audio API, so there are no
 * audio files to download. They're placeholders: recordings can replace them later.
 */
const MUTED_KEY = 'penalty:muted';

export class Sound {
  muted = readMuted();
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private voices: Voices | null = null;

  /** Starts sound. Browsers only allow it during a click or tap, so call it from one; extra calls are free. */
  unlock() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const compressor = new DynamicsCompressorNode(ctx, { threshold: -14, ratio: 4 });
      this.out = new GainNode(ctx, { gain: this.muted ? 0 : 1 });
      this.out.connect(compressor).connect(ctx.destination);
      this.voices = new Voices(ctx, this.out);
      this.voices.crowd(ctx.currentTime);
      this.ctx = ctx;
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      });
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch {
      // storage can be blocked (private mode); the setting then lasts for this visit only
    }
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
  }

  kick(power: number) {
    this.voices?.kick(power);
  }
  woodwork(strength: number) {
    this.voices?.woodwork(strength);
  }
  net(strength: number) {
    this.voices?.net(strength);
  }
  bounce(strength: number) {
    this.voices?.bounce(strength);
  }
  perfect() {
    this.voices?.perfect();
  }
  cheer(big: boolean) {
    this.voices?.cheer(big);
  }
  groan(strength: number) {
    this.voices?.groan(strength);
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

interface Envelope {
  /** Seconds to reach `peak`, then seconds to fade out. */
  attack: number;
  peak: number;
  decay: number;
}

/**
 * The sound recipes. They work in any audio context, including an offline one,
 * which is how they're checked for silence and clipping. `strength` values are 0..1.
 */
export class Voices {
  private readonly noise: AudioBuffer;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  /** Boot on ball: a short low thump with a slap on top. */
  kick(power: number, at = this.ctx.currentTime) {
    const v = 0.45 + 0.55 * power;
    this.tone('sine', 150, at, { attack: 0.003, peak: 0.7 * v, decay: 0.16 }, 48, 0.12);
    this.hiss('bandpass', 2200, 0.8, at, { attack: 0.001, peak: 0.35 * v, decay: 0.045 });
  }

  /** Ball on a metal post: a ringing "tonk" (the partials of a struck bar). */
  woodwork(strength: number, at = this.ctx.currentTime) {
    const s = clamp01(strength);
    const partials = [
      [1, 0.26, 1.1],
      [2.756, 0.13, 0.6],
      [5.404, 0.065, 0.35],
      [8.933, 0.03, 0.2],
    ];
    for (const [ratio, peak, decay] of partials) {
      this.tone('sine', 610 * ratio, at, { attack: 0.002, peak: peak * (0.4 + 0.6 * s), decay });
    }
    this.tone('sine', 120, at, { attack: 0.002, peak: 0.4 * s, decay: 0.08 }, 70, 0.08);
    this.hiss('highpass', 3000, 0.7, at, { attack: 0.001, peak: 0.2 * s, decay: 0.02 });
  }

  /** Ball into the net: a soft thump and a swish. */
  net(strength: number, at = this.ctx.currentTime) {
    const s = clamp01(strength);
    this.hiss('lowpass', 380, 0.7, at, { attack: 0.004, peak: 0.8 * s, decay: 0.12 });
    this.hiss('bandpass', 1400, 0.6, at, { attack: 0.008, peak: 0.45 * s, decay: 0.38 });
  }

  /** Ball bouncing on the grass. */
  bounce(strength: number, at = this.ctx.currentTime) {
    const s = clamp01(strength);
    this.tone('sine', 95, at, { attack: 0.002, peak: 0.35 * s, decay: 0.1 }, 60, 0.08);
    this.hiss('lowpass', 600, 0.7, at, { attack: 0.002, peak: 0.18 * s, decay: 0.05 });
  }

  /** A bright two-note chime for a strike in the gold zone. */
  perfect(at = this.ctx.currentTime) {
    this.tone('sine', 1318.5, at, { attack: 0.004, peak: 0.2, decay: 0.55 });
    this.tone('sine', 1975.5, at + 0.07, { attack: 0.004, peak: 0.16, decay: 0.7 });
    this.tone('triangle', 2637, at + 0.07, { attack: 0.004, peak: 0.04, decay: 0.4 });
  }

  /** A quiet, endless stadium murmur. */
  crowd(at = this.ctx.currentTime) {
    const source = this.loop();
    const level = new GainNode(this.ctx, { gain: 0.07 });
    for (const [frequency, Q, gain] of [
      [380, 0.9, 1],
      [1000, 1.2, 0.6],
    ]) {
      source
        .connect(new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency, Q }))
        .connect(new GainNode(this.ctx, { gain }))
        .connect(level);
    }
    // The murmur swells and settles slowly, like a real crowd.
    for (const [frequency, depth] of [
      [0.17, 0.022],
      [0.41, 0.012],
    ]) {
      const lfo = new OscillatorNode(this.ctx, { frequency });
      lfo.connect(new GainNode(this.ctx, { gain: depth })).connect(level.gain);
      lfo.start(at);
    }
    level.connect(this.out);
    source.start(at);
  }

  /** The crowd erupts: a rising "aah" plus applause. */
  cheer(big: boolean, at = this.ctx.currentTime) {
    const roar = new GainNode(this.ctx, { gain: 0.0001 });
    const peak = big ? 1.1 : 0.85;
    roar.gain.setValueAtTime(0.0001, at);
    roar.gain.linearRampToValueAtTime(peak, at + 0.35);
    roar.gain.setTargetAtTime(peak * 0.6, at + 0.35, 0.6);
    roar.gain.setValueAtTime(peak * 0.45, at + 1.6);
    roar.gain.exponentialRampToValueAtTime(0.0001, at + 4.2);
    this.formants(
      [
        [700, 2.5, 1],
        [1150, 3, 0.65],
        [2500, 4, 0.3],
      ],
      roar,
      at,
      4.3,
      [0.9, 1.08, 1],
    );
    // Applause: lots of tiny, randomly timed claps that thin out.
    const claps = big ? 150 : 110;
    for (let i = 0; i < claps; i++) {
      const t = at + 0.15 + 3 * Math.pow(Math.random(), 1.6);
      this.hiss('bandpass', 900 + Math.random() * 1700, 1.2, t, {
        attack: 0.001,
        peak: 0.08 + Math.random() * 0.1,
        decay: 0.02 + Math.random() * 0.03,
      });
    }
  }

  /** The crowd's "ooh" after a near miss. */
  groan(strength: number, at = this.ctx.currentTime) {
    const s = clamp01(strength);
    const level = new GainNode(this.ctx, { gain: 0.0001 });
    level.gain.setValueAtTime(0.0001, at);
    level.gain.linearRampToValueAtTime(0.9 * s, at + 0.25);
    level.gain.exponentialRampToValueAtTime(0.0001, at + 1.85);
    this.formants(
      [
        [480, 4, 1],
        [850, 4.5, 0.5],
      ],
      level,
      at,
      1.9,
      [1.05, 0.9, 0.8],
    );
  }

  /** Noise shaped by vowel-like filters, gliding through `glide` (start, middle, end multipliers). */
  private formants(
    bands: number[][],
    level: GainNode,
    at: number,
    length: number,
    glide: [number, number, number],
  ) {
    const source = this.loop();
    for (const [frequency, Q, gain] of bands) {
      const filter = new BiquadFilterNode(this.ctx, { type: 'bandpass', frequency, Q });
      filter.frequency.setValueAtTime(frequency * glide[0], at);
      filter.frequency.linearRampToValueAtTime(frequency * glide[1], at + length * 0.15);
      filter.frequency.linearRampToValueAtTime(frequency * glide[2], at + length * 0.6);
      source.connect(filter).connect(new GainNode(this.ctx, { gain })).connect(level);
    }
    level.connect(this.out);
    source.start(at, Math.random() * 2);
    source.stop(at + length);
  }

  private tone(type: OscillatorType, frequency: number, at: number, env: Envelope, endFrequency?: number, glide = 0) {
    const osc = new OscillatorNode(this.ctx, { type, frequency });
    if (endFrequency) {
      osc.frequency.setValueAtTime(frequency, at);
      osc.frequency.exponentialRampToValueAtTime(endFrequency, at + glide);
    }
    osc.connect(this.envelope(at, env)).connect(this.out);
    osc.start(at);
    osc.stop(at + env.attack + env.decay + 0.05);
  }

  private hiss(type: BiquadFilterType, frequency: number, Q: number, at: number, env: Envelope) {
    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.noise });
    source
      .connect(new BiquadFilterNode(this.ctx, { type, frequency, Q }))
      .connect(this.envelope(at, env))
      .connect(this.out);
    source.start(at, Math.random() * 2);
    source.stop(at + env.attack + env.decay + 0.05);
  }

  private envelope(at: number, { attack, peak, decay }: Envelope): GainNode {
    const gain = new GainNode(this.ctx, { gain: 0.0001 });
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return gain;
  }

  private loop(): AudioBufferSourceNode {
    return new AudioBufferSourceNode(this.ctx, { buffer: this.noise, loop: true });
  }
}

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}
