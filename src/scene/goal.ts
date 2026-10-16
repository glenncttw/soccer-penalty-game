import * as THREE from 'three';
import { GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH, POST_RADIUS } from '../dimensions';
import { palette } from '../theme';
import { flat } from './materials';

export function createGoal(): THREE.Group {
  const group = new THREE.Group();
  const frameMat = flat(palette.white, { roughness: 0.5 });
  const halfW = GOAL_WIDTH / 2;

  const bar = (length: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, length, 8), frameMat);
    m.castShadow = true;
    return m;
  };

  for (const x of [-halfW, halfW]) {
    const post = bar(GOAL_HEIGHT);
    post.position.set(x, GOAL_HEIGHT / 2, 0);
    group.add(post);

    const support = bar(Math.hypot(GOAL_DEPTH, GOAL_HEIGHT));
    support.scale.setScalar(0.6);
    support.scale.y = 1;
    support.position.set(x, GOAL_HEIGHT / 2, -GOAL_DEPTH / 2);
    support.rotation.x = Math.atan2(GOAL_DEPTH, GOAL_HEIGHT);
    group.add(support);
  }
  const crossbar = bar(GOAL_WIDTH + POST_RADIUS * 2);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, GOAL_HEIGHT, 0);
  group.add(crossbar);

  group.add(createNet());
  return group;
}

function createNet(): THREE.LineSegments {
  const halfW = GOAL_WIDTH / 2;
  const h = GOAL_HEIGHT;
  const d = GOAL_DEPTH;
  const cell = 0.25;
  const pts: number[] = [];
  const seg = (a: number[], b: number[]) => pts.push(...a, ...b);

  // Back panel
  for (let x = -halfW; x <= halfW + 1e-6; x += cell) seg([x, 0, -d], [x, h, -d]);
  for (let y = 0; y <= h + 1e-6; y += cell) seg([-halfW, y, -d], [halfW, y, -d]);
  // Roof
  for (let x = -halfW; x <= halfW + 1e-6; x += cell) seg([x, h, 0], [x, h, -d]);
  for (let z = 0; z >= -d - 1e-6; z -= cell) seg([-halfW, h, z], [halfW, h, z]);
  // Sides
  for (const x of [-halfW, halfW]) {
    for (let z = 0; z >= -d - 1e-6; z -= cell) seg([x, 0, z], [x, h, z]);
    for (let y = 0; y <= h + 1e-6; y += cell) seg([x, y, 0], [x, y, -d]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: palette.white, transparent: true, opacity: 0.55 }));
}
