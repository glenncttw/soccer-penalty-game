import * as THREE from 'three';
import { palette } from '../theme';
import { box, flat } from './materials';

// Placeholder stadium: tiered stands on all four sides, ad boards and floodlights.
// Stand tiers are kept as separate meshes so a crowd can be placed on them later.
const TIERS = 8;
const TIER_DEPTH = 1.6;
const TIER_RISE = 1.1;

export function createStadium(): THREE.Group {
  const group = new THREE.Group();

  group.add(stand(80, new THREE.Vector3(0, 0, -14), 0)); // behind the goal
  group.add(stand(80, new THREE.Vector3(0, 0, 56), Math.PI)); // behind the camera
  group.add(stand(70, new THREE.Vector3(-42, 0, 21), Math.PI / 2));
  group.add(stand(70, new THREE.Vector3(42, 0, 21), -Math.PI / 2));

  // Ad boards
  const boardMats = [flat(palette.purple), flat(palette.pink)];
  let i = 0;
  for (let x = -30; x <= 30; x += 6) {
    const b = box(5.8, 0.9, 0.2, boardMats[i++ % 2]);
    b.position.set(x, 0.45, -6);
    group.add(b);
  }
  for (const side of [-1, 1]) {
    for (let z = -3; z <= 45; z += 6) {
      const b = box(0.2, 0.9, 5.8, boardMats[i++ % 2]);
      b.position.set(side * 35, 0.45, z);
      group.add(b);
    }
  }

  // Floodlights in the corners
  for (const [x, z] of [[-40, -12], [40, -12], [-40, 54], [40, 54]]) {
    group.add(floodlight(x, z));
  }

  // Surrounding ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), flat(palette.teal));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  return group;
}

function stand(length: number, position: THREE.Vector3, rotationY: number): THREE.Group {
  const g = new THREE.Group();
  const tierMats = [flat(palette.white), flat(palette.mint)];
  for (let t = 0; t < TIERS; t++) {
    const height = (t + 1) * TIER_RISE;
    const tier = box(length, height, TIER_DEPTH, tierMats[t % 2]);
    tier.name = 'stand-tier';
    tier.position.set(0, height / 2, -t * TIER_DEPTH);
    g.add(tier);
  }
  const roofHeight = TIERS * TIER_RISE + 3;
  // A slim canopy over the back rows keeps the view of the stands open.
  const roofDepth = 5;
  const roof = box(length + 2, 0.4, roofDepth, flat(palette.purple, { emissive: palette.purple, emissiveIntensity: 0.6 }));
  roof.castShadow = false; // keep the stands bright and sunny
  roof.position.set(0, roofHeight, -(TIERS - 1) * TIER_DEPTH + roofDepth / 2 - 1);
  g.add(roof);
  for (const x of [-length / 2, length / 2]) {
    const pillar = box(0.5, roofHeight, 0.5, flat(palette.white));
    pillar.position.set(x, roofHeight / 2, -(TIERS - 1) * TIER_DEPTH - 0.5);
    g.add(pillar);
  }
  g.position.copy(position);
  g.rotation.y = rotationY;
  return g;
}

function floodlight(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 22, 6), flat(palette.white));
  pole.position.y = 11;
  pole.castShadow = true;
  g.add(pole);
  const head = box(4, 2.5, 0.6, flat(palette.cream, { emissive: 0xfff4c2, emissiveIntensity: 0.4 }));
  head.position.y = 22.5;
  g.add(head);
  g.position.set(x, 0, z);
  g.lookAt(0, 0, 20);
  return g;
}
