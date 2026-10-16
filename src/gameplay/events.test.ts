import { describe, expect, it } from 'vitest';
import { GameEvents } from './events';

describe('GameEvents', () => {
  it('delivers each event to everyone listening, until they stop', () => {
    const events = new GameEvents();
    const heard: string[] = [];
    const stop = events.on('kick', ({ quality }) => heard.push(`a:${quality}`));
    events.on('kick', ({ power }) => heard.push(`b:${power}`));
    events.emit('kick', { power: 0.9, quality: 'perfect' });
    stop();
    events.emit('kick', { power: 0.4, quality: 'weak' });
    expect(heard).toEqual(['a:perfect', 'b:0.9', 'b:0.4']);
  });

  it('keeps event types apart', () => {
    const events = new GameEvents();
    let results = 0;
    events.on('result', () => results++);
    events.emit('kick', { power: 0.5, quality: 'good' });
    expect(results).toBe(0);
  });
});
