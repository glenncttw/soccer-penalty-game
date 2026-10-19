import * as THREE from 'three';
import { MAX_CLOUDS, MAX_LOBES, createClouds, packClouds } from './clouds';
import { SKY_SETTINGS, type SkySettings } from './skySettings';

const DEG = Math.PI / 180;

/**
 * The sky behind the stadium: a blue gradient with soft, puffy clouds drifting
 * across it. One shader draws it all on a dome around the camera, so the clouds
 * sit infinitely far away and stay put when the camera moves. The dome is drawn
 * after the solid scenery and pinned to the far plane, so it only shades the
 * pixels where sky shows and always stays behind the stadium, trees and lights.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    uTime: { value: 0 },
    uSkyTop: { value: new THREE.Color() },
    uSkyBottom: { value: new THREE.Color() },
    uSkyRange: { value: new THREE.Vector2() },
    uCloudTop: { value: new THREE.Color() },
    uCloudBottom: { value: new THREE.Color() },
    uLight: { value: new THREE.Vector3() },
    uOpacity: { value: 1 },
    uSoftness: { value: 0 },
    uBlur: { value: 0 },
    uWarmth: { value: 0 },
    uShading: { value: 0 },
    uCoverage: { value: 1 },
    uCount: { value: 0 },
    uPlace: { value: new Float32Array(MAX_CLOUDS * 4) },
    uLook: { value: new Float32Array(MAX_CLOUDS * 4) },
    uBase: { value: new Float32Array(MAX_CLOUDS * 4) },
    uLobes: { value: new Float32Array(MAX_CLOUDS * MAX_LOBES * 4) },
  };

  constructor(settings: SkySettings = SKY_SETTINGS) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      defines: { MAX_CLOUDS, MAX_LOBES },
      side: THREE.BackSide,
      depthWrite: false,
      dithering: true, // no banding in the gradient
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), material);
    this.mesh.name = 'Sky';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000; // after the stadium, so hidden sky pixels are skipped
    this.configure(settings);
  }

  /** Applies new settings and rebuilds the clouds. Quick: it only sends new numbers to the shader. */
  configure(s: SkySettings) {
    const u = this.uniforms;
    u.uSkyTop.value.set(s.skyColorTop);
    u.uSkyBottom.value.set(s.skyColorBottom);
    u.uSkyRange.value.set(s.skyBottomElevation * DEG, Math.max(s.skyTopElevation, s.skyBottomElevation + 1) * DEG);
    u.uCloudTop.value.set(s.cloudColorTop);
    u.uCloudBottom.value.set(s.cloudColorBottom);
    u.uLight.value.set(...s.lightDirection).normalize();
    u.uOpacity.value = s.cloudOpacity;
    u.uSoftness.value = s.cloudSoftness;
    u.uBlur.value = s.cloudBlur;
    u.uWarmth.value = s.cloudWarmth;
    u.uShading.value = s.cloudShading;
    u.uCoverage.value = s.cloudCoverage;
    const packed = packClouds(s.clouds ? createClouds(s) : []);
    u.uCount.value = packed.count;
    u.uPlace.value.set(packed.place);
    u.uLook.value.set(packed.look);
    u.uBase.value.set(packed.base);
    u.uLobes.value.set(packed.lobes);
  }

  /** Drifts the clouds to where they are at `time` seconds. */
  update(time: number) {
    this.uniforms.uTime.value = time;
  }
}

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    // The camera sits at the dome's centre, so a vertex's position is the view direction.
    vDir = position;
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = clip.xyww;
    gl_Position.z *= 0.99999; // just inside the far plane
  }`;

const SKY_FRAGMENT = /* glsl */ `
  #include <common>
  #include <dithering_pars_fragment>

  // The sky repeats every 120 degrees, so drifting clouds never meet a seam.
  #define BAND 2.0943951
  #define SMOOTH_UNION 0.03 // how much neighbouring lobes melt together (cloud widths)
  #define CREASE 0.06 // width of the soft edge where one lobe overlaps another (cloud heights)
  #define WRAP 0.6 // light wraps this far around the lobes, for soft shading
  #define FLATTEN 0.3 // tips the lobes' normals toward the viewer, for gentler shading

  uniform float uTime;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyBottom;
  uniform vec2 uSkyRange;
  uniform vec3 uCloudTop;
  uniform vec3 uCloudBottom;
  uniform vec3 uLight;
  uniform float uOpacity;
  uniform float uSoftness;
  uniform float uBlur;
  uniform float uWarmth;
  uniform float uShading;
  uniform float uCoverage;
  uniform int uCount;
  uniform vec4 uPlace[MAX_CLOUDS]; // azimuth at time 0, elevation of the flat bottom, angular width, drift speed
  uniform vec4 uLook[MAX_CLOUDS]; // haze, shading strength, height (in widths), coverage rank
  uniform vec4 uBase[MAX_CLOUDS]; // the base capsule: left and right end of its core, radius
  uniform vec4 uLobes[MAX_CLOUDS * MAX_LOBES]; // spheres: x, y, depth, radius (in widths), back to front

  varying vec3 vDir;

  // Colours are mixed in sRGB-like space, which looks smoother than mixing linear light.
  vec3 toPerceptual(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }
  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }

  // Soft, wrapped light on a lobe with normal n.
  float lit(vec3 n) {
    vec3 s = normalize(vec3(n.xy, n.z + FLATTEN));
    return clamp((dot(s, uLight) + WRAP) / (1.0 + WRAP), 0.0, 1.0);
  }

  float smoothMin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }

  // One cloud at p (in cloud widths, flat bottom at y = 0). Returns its colour and coverage.
  vec4 shadeCloud(vec2 p, int i, vec4 look, float px) {
    float height = look.z;
    vec4 base = uBase[i];
    float blur = 0.25 * uBlur * height;
    float soft = max(uSoftness * height, 0.7 * px) + blur;
    float crease = max(CREASE * height, px) + blur;

    // The base: a long capsule lying along the flat bottom, half of it below.
    vec2 qb = p - vec2(clamp(p.x, base.x, base.y), 0.0);
    float dist = length(qb) - base.z;
    float depth = sqrt(max(base.z * base.z - dot(qb, qb), 0.0));
    vec3 normal = normalize(vec3(qb, depth + 1e-4));
    float diffuse = lit(normal);
    // How much cloud is already behind this pixel (softly, so lobes blend evenly across it).
    float behind = 1.0 - smoothstep(-0.1 * height, soft, dist);
    float covers[MAX_LOBES]; // how much each lobe covers this pixel

    // The lobes, painted back to front: their outlines melt together, and each one's
    // surface covers the ones behind it, blending in softly just inside its outline.
    // Where nothing is behind (the cloud's outer edge), a lobe keeps its own shading right to the edge.
    for (int j = 0; j < MAX_LOBES; j++) {
      vec4 lobe = uLobes[i * MAX_LOBES + j];
      if (lobe.w <= 0.0) break;
      vec2 q = p - lobe.xy;
      float edge = length(q) - lobe.w;
      dist = smoothMin(dist, edge, SMOOTH_UNION);
      float s = sqrt(max(lobe.w * lobe.w - dot(q, q), 0.0));
      float solid = 1.0 - smoothstep(-soft, soft, edge);
      // The lower part of an outline melts into the cloud behind it; the upper part stays crisp.
      float melt = crease * (1.0 + 4.0 * max(-q.y / lobe.w, 0.0));
      float over = mix(solid, 1.0 - smoothstep(-melt, 0.0, edge), behind);
      vec3 n = vec3(q, s) / lobe.w;
      normal = mix(normal, n, over);
      diffuse = mix(diffuse, lit(n), over);
      depth = mix(depth, lobe.z + s, over);
      behind = max(behind, 1.0 - smoothstep(-0.1 * height, soft, edge));
      covers[j] = over;
    }

    float cover = 1.0 - smoothstep(-soft, soft, dist);
    float bottomSoft = 2.0 * soft; // the flat bottom fades out more softly than the top
    cover *= smoothstep(-bottomSoft, bottomSoft, p.y);
    if (cover <= 0.0) return vec4(0.0);

    // Lobes in front shade the surface behind them (sphere ambient occlusion). Going
    // front to back, a lobe only counts while no lobe from it forward covers the pixel.
    vec3 n = normalize(normal);
    vec3 surface = vec3(p, depth);
    float occlusion = 0.0;
    float covered = 0.0;
    for (int j = MAX_LOBES - 1; j >= 0; j--) {
      vec4 lobe = uLobes[i * MAX_LOBES + j];
      if (lobe.w <= 0.0) continue;
      covered = max(covered, covers[j]);
      vec3 v = lobe.xyz - surface;
      float l2 = max(dot(v, v), 1e-6);
      occlusion += (1.0 - covered) * max(dot(n, v), 0.0) * inversesqrt(l2) * lobe.w * lobe.w / l2;
    }
    occlusion = min(occlusion, 1.0);

    // Each lobe is white where it faces up into the light and blue underneath; lobes
    // in front shade the ones behind, and the flat bottom is blue all along.
    float light = clamp((diffuse - 0.1) / 0.75, 0.0, 1.0);
    light *= (1.0 - uShading * look.y * occlusion) * smoothstep(0.06 * height, 0.35 * height, p.y);
    vec3 top = toPerceptual(uCloudTop);
    vec3 bottom = toPerceptual(uCloudBottom);
    vec3 color = mix(bottom, top, light);
    // A hint of warm sunlight on the bright upper-middle parts.
    float warm = smoothstep(0.55, 0.8, light) * (1.0 - smoothstep(0.85, 1.0, light));
    color *= mix(vec3(1.0), vec3(1.0, 0.985, 0.95), uWarmth * warm);
    return vec4(color, cover);
  }

  void main() {
    vec3 dir = normalize(vDir);
    float pixel = length(fwidth(dir)); // a pixel's size in radians, for smooth edges
    float az = atan(dir.x, -dir.z);
    float se = clamp(dir.y, -1.0, 1.0);
    float ce = sqrt(1.0 - se * se);
    float el = asin(se);

    float t = clamp((el - uSkyRange.x) / (uSkyRange.y - uSkyRange.x), 0.0, 1.0);
    vec3 sky = mix(toPerceptual(uSkyBottom), toPerceptual(uSkyTop), t);
    vec3 color = sky;

    // Far clouds first, so nearer ones cover them.
    for (int i = 0; i < MAX_CLOUDS; i++) {
      if (i >= uCount) break;
      vec4 place = uPlace[i];
      vec4 look = uLook[i];
      float width = place.z;
      float d = mod(az - place.x - place.w * uTime + 0.5 * BAND, BAND) - 0.5 * BAND;
      if (abs(d) > 0.6 * width) continue;
      float rise = el - place.y;
      if (rise < -0.05 * width || rise > (look.z + 0.05) * width) continue;
      // Position on a flat card facing the viewer at the middle of the cloud's bottom.
      float sb = sin(place.y);
      float cb = cos(place.y);
      float cd = cos(d);
      vec2 p = vec2(ce * sin(d), se * cb - ce * cd * sb) / ((se * sb + ce * cd * cb) * width);
      vec4 cloud = shadeCloud(p, i, look, pixel / width);
      cloud.rgb = mix(cloud.rgb, sky, look.x);
      float shown = smoothstep(look.w, look.w + 0.06, uCoverage);
      color = mix(color, cloud.rgb, cloud.a * uOpacity * shown);
    }

    gl_FragColor = vec4(toLinear(color), 1.0);
    #include <colorspace_fragment>
    #include <dithering_fragment>
  }`;
