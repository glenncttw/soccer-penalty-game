import * as THREE from 'three';
import { KEEPER_BODY, type KeeperPose } from '../physics/keeperBody';
import { palette } from '../theme';

// A placeholder look until there's a Blender model: a cute, rounded keeper
// built from simple shapes, sized to match the physics body exactly.
const KIT = 0xff8a2a; // bright orange shirt and socks, easy to see against the net and grass
const SKIN = 0xffd2b0;
const DARK = 0x262a40; // eyes and boots
const CROUCH_SQUASH = 0.1; // share of its height a full crouch takes away

/** The keeper's 3D model. Call `update` every frame with the pose from the keeper's motion. */
export class KeeperModel {
  readonly group = new THREE.Group();
  private readonly trunk = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly arms: { arm: THREE.Mesh; glove: THREE.Mesh; joint: THREE.Mesh }[] = [];
  private readonly shoulder = new THREE.Vector3();
  private readonly glove = new THREE.Vector3();
  private readonly along = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private time = 0;
  private nextBlink = 2.5;

  constructor() {
    const b = KEEPER_BODY;
    const kit = material(KIT);
    const skin = material(SKIN);
    const dark = material(DARK);
    const purple = material(palette.purple);
    const white = material(palette.white);
    const blush = material(0xff9fb4);

    for (const side of [-1, 1]) {
      const leg = mesh(new THREE.CapsuleGeometry(0.075, b.legs.top - b.legs.bottom, 6, 12), kit);
      leg.position.set(side * b.legs.x, (b.legs.top + b.legs.bottom) / 2, 0);
      const boot = mesh(new THREE.SphereGeometry(0.1, 16, 10), dark);
      boot.scale.set(0.95, 0.6, 1.4);
      boot.position.set(side * b.legs.x, 0.06, 0.04);
      this.trunk.add(leg, boot);
    }
    // The shirt sits a little higher than the physics body so the shorts show below it.
    const torso = mesh(new THREE.CapsuleGeometry(b.torso.radius, 0.28, 8, 24), kit);
    torso.position.y = 0.82;
    const shorts = mesh(new THREE.CylinderGeometry(0.245, 0.265, 0.24, 24), purple);
    shorts.position.y = 0.43;
    const stripe = mesh(new THREE.TorusGeometry(b.torso.radius * 0.99, 0.025, 8, 32), white);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = torso.position.y + 0.08;
    this.trunk.add(shorts, torso, stripe);

    const head = mesh(new THREE.SphereGeometry(b.head.radius, 32, 20), skin);
    head.position.y = b.head.y;
    const cap = mesh(new THREE.SphereGeometry(b.head.radius * 1.04, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), purple);
    cap.position.y = b.head.y + 0.015;
    const brim = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 24, 1, false, -Math.PI / 2, Math.PI), purple);
    brim.position.set(0, b.head.y + 0.1, 0.12);
    brim.rotation.x = 0.25;
    this.trunk.add(head, cap, brim);
    for (const side of [-1, 1]) {
      const eye = mesh(new THREE.SphereGeometry(0.034, 12, 10), dark);
      eye.scale.set(1, 1.35, 0.6);
      eye.position.set(side * 0.075, b.head.y + 0.02, b.head.radius * 0.93);
      eye.rotation.y = side * 0.33;
      const cheek = mesh(new THREE.SphereGeometry(0.035, 12, 8), blush);
      cheek.scale.set(1, 0.6, 0.35);
      cheek.position.set(side * 0.125, b.head.y - 0.055, b.head.radius * 0.84);
      cheek.rotation.y = side * 0.6;
      this.eyes.push(eye);
      this.trunk.add(eye, cheek);
    }
    const smile = mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 16, Math.PI), dark);
    smile.position.set(0, b.head.y - 0.06, b.head.radius * 0.95);
    smile.rotation.set(-0.3, 0, Math.PI);
    this.trunk.add(smile);
    this.group.add(this.trunk);

    const armGeometry = new THREE.CylinderGeometry(b.arm.radius, b.arm.radius, 1, 12);
    const gloveGeometry = new THREE.SphereGeometry(b.glove.radius, 20, 14);
    const jointGeometry = new THREE.SphereGeometry(b.arm.radius * 1.15, 12, 10);
    for (let i = 0; i < 2; i++) {
      const arm = mesh(armGeometry, kit);
      const glove = mesh(gloveGeometry, white);
      glove.scale.set(1, 1.12, 0.8);
      const joint = mesh(jointGeometry, kit);
      this.arms.push({ arm, glove, joint });
      this.group.add(arm, glove, joint);
    }
  }

  update(pose: KeeperPose, dt: number) {
    this.group.position.set(pose.pivot.x, pose.pivot.y, pose.pivot.z);
    this.group.rotation.set(0, 0, -pose.tilt);
    const squash = 1 - CROUCH_SQUASH * pose.crouch;
    const bulge = 1 + (1 - squash) * 0.5;
    this.trunk.scale.set(bulge, squash, bulge);

    const s = KEEPER_BODY.shoulder;
    this.arms.forEach(({ arm, glove, joint }, i) => {
      this.shoulder.set(i === 0 ? -s.x : s.x, s.y * squash, 0);
      this.glove.set(pose.gloves[i].x, pose.gloves[i].y, pose.gloves[i].z);
      this.along.subVectors(this.glove, this.shoulder);
      const length = Math.max(1e-3, this.along.length());
      this.along.divideScalar(length);
      arm.position.addVectors(this.shoulder, this.glove).multiplyScalar(0.5);
      arm.quaternion.setFromUnitVectors(this.up, this.along);
      arm.scale.set(1, length, 1);
      joint.position.copy(this.shoulder);
      glove.position.copy(this.glove);
      glove.quaternion.copy(arm.quaternion);
    });

    // Blink now and then.
    this.time += dt;
    if (this.time > this.nextBlink + 0.12) this.nextBlink = this.time + 2 + Math.random() * 3;
    const open = this.time > this.nextBlink ? 0.12 : 1;
    for (const eye of this.eyes) eye.scale.y = 1.35 * open;
  }
}

function material(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
}

function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material) {
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
