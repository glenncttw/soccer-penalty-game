import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sharpAreaAround } from './softFocus';

describe('sharpAreaAround', () => {
  it('boxes the points in shares of the screen height, plus the margin', () => {
    const points = [new THREE.Vector2(0.3, 0.4), new THREE.Vector2(0.7, 0.6), new THREE.Vector2(0.5, 0.1)];
    const area = sharpAreaAround(points, 2, 0.05);
    expect(area.x).toBeCloseTo(1); // across is stretched by the screen's shape: 0.3..0.7 -> 0.6..1.4
    expect(area.y).toBeCloseTo(0.35);
    expect(area.halfWidth).toBeCloseTo(0.45);
    expect(area.halfHeight).toBeCloseTo(0.3);
  });
});
