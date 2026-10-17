// Baked-lighting setup for Stadium_Recon_web.glb v013 (Three.js r155+, WebGL 2).
// Groups (see bakes/README.md):
//   A  unlit: one baked texture (light, shadow, bounce, gloss)      -> stands, rails, floodlight structure, ground
//   V  unlit: baked light in the vertex colours (glTF COLOR_0)      -> trees (no texture, no seams)
//   B  PBR + realtime sun + baked indirect light (lightMap + aoMap) -> ad boards, goal frame, pitch
//   C  PBR + realtime sun + panorama (envMap)                       -> ball, net, corner flags (+ keeper, crowd)
//   D  emissive, unchanged                                          -> floodlight lamps
// All texture bakes use the second UV set (glTF TEXCOORD_1 -> three.js uv1 -> texture.channel = 1).
import * as THREE from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

const LM_SCALE = 2;              // lightmap PNG/WebP/KTX2 store light / 2
const AO_INTENSITY = 0.5;        // sky occlusion is already in the lightmap; AO adds contact shading
const ATLAS = {
  A: { Stands: ["STATIC_Concrete", "FLOOD_Light_L", "FLOOD_Light_R"], Rails: ["STATIC_Railings"],
       Ground: ["GROUND_Outside"] },
  B: { Props: ["ADV_Panel_", "GOAL_Frame"], Grass: ["PITCH_Grass"] },
};
const GROUP_V = ["STATIC_Trees"];
const GROUP_C = ["Football_Ball", "GOAL_Net", "CORNER_Flag_"];
const LAMP_MATERIALS = ["M_Floodlight_Emissive", "M_Floodlight_Glow"];
const SHADOW_CASTERS = ["STATIC_Concrete", "GOAL_Frame", "CORNER_Flag_", "Football_Ball"];

const startsWithAny = (name, list) => list.some((p) => name === p || name.startsWith(p));

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Object3D} root        gltf.scene
 * @param {object} opts  { bakes: "bakes/", format: "ktx2" | "webp", standsHQ: false, basisPath: ".../libs/basis/",
 *                         sunShadowMapSize, showMarkings }
 *   standsHQ: load T_Stands_Combined_hq.ktx2 (UASTC, 2.1 MB) instead of the 0.45 MB ETC1S default
 */
export async function setupStadiumLighting(renderer, root, opts = {}) {
  const base = opts.bakes ?? "bakes/";
  const fmt = opts.format ?? "ktx2";
  let ktx2 = null;
  if (fmt === "ktx2") {
    ktx2 = new KTX2Loader().setTranscoderPath(opts.basisPath ??
      "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/").detectSupport(renderer);
  }
  const loadTex = async (name, srgb = true) => {
    const file = fmt === "ktx2" && opts.standsHQ && name === "T_Stands_Combined" ? `${name}_hq` : name;
    const t = fmt === "ktx2" ? await ktx2.loadAsync(`${base}${file}.ktx2`)
                             : await new THREE.TextureLoader().loadAsync(`${base}${name}.webp`);
    t.flipY = false;                                   // glTF UV convention
    t.channel = 1;                                     // second UV set (Lightmap)
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const meshesOf = (prefixes) => {
    const out = [];
    root.traverse((o) => {
      // a multi-material mesh is a Group of child meshes named <node>_1, _2...; match on the node name
      let n = o; while (n && !startsWithAny(n.name, prefixes) && n !== root) n = n.parent;
      if (o.isMesh && n && n !== root) out.push(o);
    });
    return out;
  };

  // ---- a material shared by meshes of different groups (e.g. one white used by the goal and the flag
  //      poles) would get both treatments. Give each group its own copy before changing anything.
  const groupsOf = new Map();
  const tag = (meshes, g) => meshes.forEach((m) => {
    if (!groupsOf.has(m.material)) groupsOf.set(m.material, new Set());
    groupsOf.get(m.material).add(g);
  });
  Object.values(ATLAS.A).forEach((p) => tag(meshesOf(p), "A"));
  Object.values(ATLAS.B).forEach((p) => tag(meshesOf(p), "B"));
  tag(meshesOf(GROUP_C), "C");
  const copies = new Map();
  const own = (m, g) => {
    if ((groupsOf.get(m.material)?.size ?? 1) > 1) {
      const key = m.material.uuid + g;
      if (!copies.has(key)) copies.set(key, m.material.clone());
      m.material = copies.get(key);
    }
    return m.material;
  };

  // ---- group A: unlit baked texture
  for (const [atlas, prefixes] of Object.entries(ATLAS.A)) {
    const map = await loadTex(`T_${atlas}_Combined`);
    const mat = new THREE.MeshBasicMaterial({ map, name: `BAKED_${atlas}` });
    for (const m of meshesOf(prefixes)) {
      if (LAMP_MATERIALS.includes(m.material.name)) continue;      // group D stays emissive
      m.material = mat;
      m.receiveShadow = false;
      m.castShadow = startsWithAny(m.parent?.name ?? "", SHADOW_CASTERS) || startsWithAny(m.name, SHADOW_CASTERS);
    }
  }
  // ---- group V: unlit, baked light in the vertex colours (all colours of the mesh, one material)
  const vertexMat = new THREE.MeshBasicMaterial({ vertexColors: true, name: "BAKED_VertexColour" });
  for (const m of meshesOf(GROUP_V)) {
    m.material = vertexMat;
    m.receiveShadow = false;
    m.castShadow = false;
  }
  // ---- group B: PBR + realtime sun + baked indirect light
  for (const [atlas, prefixes] of Object.entries(ATLAS.B)) {
    const lightMap = await loadTex(`T_${atlas}_Lightmap`);
    const aoMap = await loadTex(`T_${atlas}_AO`, false);
    for (const m of meshesOf(prefixes)) {
      const mat = own(m, "B");                         // MeshStandardMaterial from the GLB (own one per board)
      mat.lightMap = lightMap; mat.lightMapIntensity = LM_SCALE * Math.PI;   // three.js divides indirect by PI
      mat.aoMap = aoMap; mat.aoMapIntensity = AO_INTENSITY;
      mat.envMap = null; mat.needsUpdate = true;       // no extra ambient on top of the lightmap
      m.receiveShadow = true;
      m.castShadow = startsWithAny(m.parent?.name ?? "", SHADOW_CASTERS) || startsWithAny(m.name, SHADOW_CASTERS);
    }
  }
  // ---- group C: panorama as soft light + reflections
  const exr = await new EXRLoader().loadAsync(`${base}ENV_BallSpot_equirect.exr`);
  exr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(exr).texture;
  exr.dispose(); pmrem.dispose();
  for (const m of meshesOf(GROUP_C)) {
    const mat = own(m, "C");
    mat.lightMap = null; mat.aoMap = null;             // realtime objects never carry baked light
    mat.envMap = envMap;
    mat.envMapIntensity = m.parent?.name === "GOAL_Net" || m.name === "GOAL_Net" ? 0.6 : 1.0;
    mat.needsUpdate = true;
    m.castShadow = !(m.name === "GOAL_Net" || m.parent?.name === "GOAL_Net");
    m.receiveShadow = true;
  }
  // ---- lines: painted by the game's grass shader
  root.getObjectByName("STATIC_Markings")?.traverse((o) => { if (o.isMesh) o.visible = opts.showMarkings ?? false; });
  // ---- realtime sun from the GLB (direction, colour #FFFBAA, intensity 3.7)
  let sun = null;
  root.traverse((o) => { if (o.isDirectionalLight) sun = o; });
  if (sun) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(opts.sunShadowMapSize ?? 2048, opts.sunShadowMapSize ?? 2048);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 120 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    // shadow camera centred on the playing area, 40 m toward the sun (keeps the exported direction)
    root.updateMatrixWorld(true);
    const lp = sun.getWorldPosition(new THREE.Vector3());
    const shine = sun.target.getWorldPosition(new THREE.Vector3()).sub(lp).normalize();
    const centre = new THREE.Vector3(0, 0, -16);
    sun.removeFromParent(); sun.target.removeFromParent();
    root.add(sun); root.add(sun.target);
    sun.position.copy(centre).addScaledVector(shine, -40);
    sun.target.position.copy(centre);
    sun.userData.shineDirection = shine.toArray();
  }
  return { sun, envMap };
}
