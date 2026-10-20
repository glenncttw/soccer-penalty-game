import { describe, expect, it, vi } from 'vitest';
import { ShootInput } from './shootInput';

/** A stand-in for the canvas: only what ShootInput touches. */
function fakeCanvas() {
  const el = new EventTarget() as EventTarget & Record<string, unknown>;
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 });
  el.setPointerCapture = () => {};
  el.releasePointerCapture = () => {};
  el.hasPointerCapture = () => false;
  return el as unknown as HTMLElement;
}

function setUp(keys = new EventTarget()) {
  const input = new ShootInput(fakeCanvas(), keys);
  const press = vi.fn();
  const release = vi.fn();
  const cancel = vi.fn();
  input.onPress = press;
  input.onRelease = release;
  input.onCancel = cancel;
  const key = (type: 'keydown' | 'keyup', code: string, extra: Record<string, unknown> = {}) =>
    keys.dispatchEvent(Object.assign(new Event(type), { code, repeat: false, ...extra }));
  return { keys, input, press, release, cancel, key };
}

describe('ShootInput keyboard', () => {
  it('moves the aim while an arrow key is held, a tap only a little', () => {
    const { input, key } = setUp();
    key('keydown', 'ArrowRight');
    expect(input.usingKeys).toBe(true);
    expect(input.hasPointer).toBe(true);
    const tap = input.keyStep(1 / 60).x;
    let moved = tap;
    for (let i = 0; i < 59; i++) moved += input.keyStep(1 / 60).x;
    expect(tap).toBeGreaterThan(0);
    expect(tap).toBeLessThan(0.005);
    expect(moved).toBeGreaterThan(0.5); // most of a goal width in a second
    expect(moved).toBeLessThan(0.6);
    key('keyup', 'ArrowRight');
    expect(input.keyStep(1 / 60)).toEqual({ x: 0, y: 0 });
  });

  it('aims slower with Shift, and up and down with W and S', () => {
    const { input, key } = setUp();
    key('keydown', 'KeyW');
    input.keyStep(1); // past the ease-in
    const fast = input.keyStep(0.1).y;
    key('keydown', 'ShiftLeft');
    const fine = input.keyStep(0.1).y;
    expect(fast).toBeGreaterThan(0);
    expect(fine).toBeCloseTo(fast / 3);
    key('keyup', 'KeyW');
    key('keydown', 'KeyS');
    expect(input.keyStep(0.1).y).toBeLessThan(0);
  });

  it('charges once on Space, even when the key repeats, and shoots on letting go', () => {
    const { input, press, release, key } = setUp();
    key('keydown', 'Space');
    key('keydown', 'Space', { repeat: true });
    expect(input.charging).toBe(true);
    expect(press).toHaveBeenCalledTimes(1);
    key('keyup', 'Space');
    expect(input.charging).toBe(false);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('curls with left and right while charging, without moving the aim, and keeps it there', () => {
    const { input, key } = setUp();
    key('keydown', 'Space');
    key('keydown', 'ArrowRight');
    expect(input.keyStep(0.4)).toEqual({ x: 0, y: 0 });
    expect(input.curl).toBeCloseTo(0.6);
    input.keyStep(1);
    expect(input.curl).toBe(1); // no further than full curl
    key('keyup', 'ArrowRight');
    input.keyStep(1);
    expect(input.curl).toBe(1); // stays where you leave it
    key('keydown', 'KeyA');
    input.keyStep(3);
    expect(input.curl).toBe(-1);
  });

  it('calls the charge off with Esc or when the window loses focus, without a shot', () => {
    const { keys, input, release, cancel, key } = setUp();
    key('keydown', 'Enter');
    key('keydown', 'Escape');
    expect(input.charging).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    key('keyup', 'Enter');
    key('keydown', 'Space');
    keys.dispatchEvent(new Event('blur'));
    expect(input.charging).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(release).not.toHaveBeenCalled();
  });

  it("doesn't charge while shooting is switched off, or with Ctrl held", () => {
    const { input, press, key } = setUp();
    input.enabled = false;
    key('keydown', 'Space');
    input.enabled = true;
    key('keydown', 'Space', { ctrlKey: true });
    expect(press).not.toHaveBeenCalled();
  });

  it('leaves the keys alone while typing in a text box', () => {
    const textBox = Object.assign(new EventTarget(), { tagName: 'INPUT' });
    const { input, press, key } = setUp(textBox);
    key('keydown', 'Space');
    key('keydown', 'ArrowLeft');
    expect(press).not.toHaveBeenCalled();
    expect(input.usingKeys).toBe(false);
  });
});
