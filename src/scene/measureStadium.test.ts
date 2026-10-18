import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { measureBoards, measureGoal, measureWorld } from './measureStadium';

// A stand-in for the Blender goal built from boxes: square 0.18 m posts,
// 6.0 m x 2.1 m outside, goal line at z = 0, and a net with a flat roof
// that slopes to the ground behind.
function syntheticStadium() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  // Frame: one merged-looking mesh is not needed; the frame node holds its parts.
  const frame = new THREE.Mesh(
    mergeBoxes([
      [0.18, 2.1, 0.18, -2.91, 1.05, 0],
      [0.18, 2.1, 0.18, 2.91, 1.05, 0],
      [6, 0.18, 0.18, 0, 2.01, 0],
    ]),
    mat,
  );
  frame.name = 'GOAL_Frame';
  root.add(frame);
  const net = new THREE.Group();
  net.name = 'GOAL_Net';
  frame.add(net);
  box(5.77, 0.01, 1.06, 0, 1.975, -0.53, net); // roof
  const back = box(5.77, Math.hypot(1.975, 1.54), 0.01, 0, 0.99, -1.83, net);
  back.rotation.x = Math.atan2(1.54, 1.975);
  box(0.01, 1.975, 2.6, -2.885, 0.99, -1.3, net);
  box(0.01, 1.975, 2.6, 2.885, 0.99, -1.3, net);

  const ball = box(0.35, 0.35, 0.35, 0, 0.175, 12.4, root);
  ball.name = 'Football_Ball';
  const grass = box(13, 0.001, 24, 0, -0.0005, 6, root);
  grass.name = 'PITCH_Grass';
  const board = box(2, 0.72, 0.32, 0, 0.36, 0, root);
  board.name = 'ADV_Panel_E05';
  board.position.set(6.2, 0.36, 2);
  board.rotation.y = Math.PI / 2;
  return { root, frame, net };
}

function mergeBoxes(parts: number[][]) {
  const geos = parts.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed());
  const pos = geos.flatMap((g) => Array.from(g.getAttribute('position').array));
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return merged;
}

describe('measureGoal', () => {
  it('measures the goal opening, posts and net from the geometry', () => {
    const { frame, net } = syntheticStadium();
    const g = measureGoal(frame, net);
    expect(g.lineZ).toBeCloseTo(0);
    expect(g.innerHalfWidth).toBeCloseTo(2.82, 2);
    expect(g.outerHalfWidth).toBeCloseTo(3, 2);
    expect(g.crossbarY).toBeCloseTo(1.92, 2);
    expect(g.outerHeight).toBeCloseTo(2.1, 2);
    expect(g.postThickness).toBeCloseTo(0.18, 2);
    expect(g.postDepth).toBeCloseTo(0.18, 2);
    expect(g.netHalfWidth).toBeCloseTo(2.885, 2);
    expect(g.netRoofY).toBeCloseTo(1.98, 1);
    expect(g.netRoofBackZ).toBeLessThan(-0.9);
    expect(g.netBackZ).toBeLessThan(-2.3);
  });
});

describe('measureWorld', () => {
  it('reads ball, ground and camera placement', () => {
    const { root } = syntheticStadium();
    const cam = new THREE.PerspectiveCamera(32.8, 16 / 9);
    cam.position.set(0, 0.94, 16);
    root.add(cam);
    const w = measureWorld(root, cam);
    expect(w.ballStart.z).toBeCloseTo(12.4);
    expect(w.ballRadius).toBeCloseTo(0.175);
    expect(w.groundY).toBeCloseTo(0, 2);
    expect(w.camera.fov).toBeCloseTo(32.8);
  });

  it('reads the ad boards in place, as triangles', () => {
    const { root } = syntheticStadium();
    root.updateWorldMatrix(true, true);
    const [board, ...rest] = measureBoards(root);
    expect(rest).toEqual([]);
    expect(board.indices.length).toBe(36); // a box: 12 triangles
    const xs = board.vertices.filter((_, i) => i % 3 === 0);
    const zs = board.vertices.filter((_, i) => i % 3 === 2);
    expect(Math.min(...xs)).toBeCloseTo(6.04, 2); // turned side on: 0.32 m thick across x
    expect(Math.max(...xs)).toBeCloseTo(6.36, 2);
    expect(Math.min(...zs)).toBeCloseTo(1, 2); // 2 m long along z
    expect(Math.max(...zs)).toBeCloseTo(3, 2);
  });

  it('fails loudly when a node is missing', () => {
    const { root } = syntheticStadium();
    root.getObjectByName('Football_Ball')!.name = 'Something_Else';
    expect(() => measureWorld(root, new THREE.PerspectiveCamera())).toThrow(/Football_Ball/);
  });
});
