import * as THREE from 'three';
import { SHINE_SETTINGS, type ShineSettings } from './shineSettings';

type Part = 'board' | 'goal' | 'stands' | 'rail' | 'tree';

/** Where each part is in the stadium model (by node name, or the start of it). */
const PARTS: [string, Part][] = [
  ['ADV_Panel_', 'board'],
  ['GOAL_Frame', 'goal'],
  ['STATIC_Concrete', 'stands'],
  ['STATIC_Railings', 'rail'],
  ['STATIC_Trees', 'tree'],
];

/**
 * Gives the stadium, the crowd and the keeper a toy-like gloss (see shineSettings.ts). Call it after setUpLighting.
 *
 * Everything in the stadium already has its light baked in Blender, so it only takes the reflections from the
 * panorama, not its soft light as well, which would light it twice. The stands, rails and trees are drawn with
 * their baked colours only (no live light); they become a black shiny surface that glows with those colours, so
 * the colours stay exactly as baked and the reflections go on top. They get no highlight from the sun: their
 * shadows are baked, so a live highlight would shine in the shade too.
 */
export class Shine {
  private readonly parts = new Map<Part, THREE.MeshStandardMaterial[]>();
  private readonly crowd: THREE.MeshStandardMaterial[];
  private readonly keeper: THREE.MeshStandardMaterial[];

  constructor(
    stadium: THREE.Object3D,
    crowd: THREE.Object3D,
    keeper: THREE.Object3D,
    envMap: THREE.Texture,
    s: ShineSettings = SHINE_SETTINGS,
  ) {
    for (const [name, part] of PARTS) {
      const glossy = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      for (const mesh of meshesOf(stadium, name)) {
        const material = mesh.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          if (!glossy.has(material)) glossy.set(material, glossyBaked(material, envMap));
          mesh.material = glossy.get(material)!;
        } else if (material instanceof THREE.MeshStandardMaterial && material.lightMap) {
          if (!glossy.has(material)) glossy.set(material, reflectionsOnly(material, envMap));
        }
      }
      this.parts.set(part, [...glossy.values()]);
    }
    this.crowd = standardMaterials(crowd);
    this.keeper = standardMaterials(keeper);
    this.update(s);
  }

  update(s: ShineSettings) {
    const looks: Record<Part, [number, number]> = {
      board: [s.boardRoughness, s.boardReflection],
      goal: [s.goalRoughness, s.goalReflection],
      stands: [s.standsRoughness, s.standsReflection],
      rail: [s.railRoughness, s.railReflection],
      tree: [s.treeRoughness, s.treeReflection],
    };
    for (const [part, materials] of this.parts) {
      const [roughness, envMapIntensity] = looks[part];
      for (const m of materials) Object.assign(m, { roughness, envMapIntensity });
    }
    for (const m of this.crowd) m.roughness = s.crowdRoughness;
    for (const m of this.keeper) m.roughness = s.keeperRoughness;
  }
}

/** A lit material that already gets its soft light from the lightmap: add only the panorama's reflections. */
function reflectionsOnly(material: THREE.MeshStandardMaterial, envMap: THREE.Texture) {
  material.envMap = envMap;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_maps>',
      '#include <lights_fragment_maps>\n\tiblIrradiance = vec3( 0.0 );',
    );
  };
  material.customProgramCacheKey = () => 'reflections only';
  material.needsUpdate = true;
  return material;
}

/** A baked, unlit material as a black shiny one glowing with the baked colours (its texture, or its vertex colours). */
function glossyBaked(baked: THREE.MeshBasicMaterial, envMap: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({
    name: `${baked.name}_Glossy`,
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: baked.map,
    vertexColors: baked.vertexColors,
    metalness: 0,
    envMap,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <emissivemap_fragment>',
        // Vertex colours tint the (black) diffuse colour; here they are the glow.
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= vColor.rgb;\n#endif',
      )
      .replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n\treflectedLight.directSpecular = vec3( 0.0 );',
      );
  };
  material.customProgramCacheKey = () => 'glossy baked';
  return material;
}

/** The meshes under the nodes whose name starts with `prefix`. */
function meshesOf(root: THREE.Object3D, prefix: string): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (let n: THREE.Object3D | null = o; n && n !== root; n = n.parent) {
      if (n.name.startsWith(prefix)) {
        meshes.push(o);
        return;
      }
    }
  });
  return meshes;
}

function standardMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const found = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    if (o instanceof THREE.Mesh)
      for (const m of [o.material].flat()) if (m instanceof THREE.MeshStandardMaterial) found.add(m);
  });
  return [...found];
}
