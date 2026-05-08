/**
 * Sacred Geometry Sanctum — raymarched 3D temple interior built from sacred geometry.
 *
 * Full SDF architecture: flower-of-life lattice walls, Metatron's cube floating center,
 * platonic solid SDFs orbiting. Every surface follows the golden ratio (phi = 1.618).
 * The space itself IS sacred geometry — walls are punctured flower-of-life patterns,
 * light streams through geometry gaps as golden volumetric rays.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → geometry breathing / scale pulse on all structures
 *   uEnergy           → complexity (more platonic solids appear, wall detail increases)
 *   uDrumOnset        → geometry rotation snap (discrete angular jumps)
 *   uVocalPresence    → golden light intensity through geometry gaps
 *   uHarmonicTension  → geometry distortion (perfect → warped/organic)
 *   uSectionType      → jam=fractal multiplication, space=single floating shape in void,
 *                        chorus=full temple revealed, solo=dramatic spotlight
 *   uClimaxPhase      → geometry explodes into golden particles then reforms
 *   uSlowEnergy       → camera drift speed
 *   uHighs            → edge glow sharpness, specular intensity
 *   uMelodicPitch     → vertical camera shift
 *   uBeatSnap         → pulse flash on geometry edges
 *   uCoherence        → high=crisp sacred geometry, low=organic/wobbly
 *   uSpaceScore       → void expansion, fewer structures
 *   uTimbralBrightness→ surface reflectivity / golden ratio shimmer
 *   uSemanticCosmic   → depth fog color shift toward deep indigo
 *   uSemanticPsychedelic → wall pattern complexity multiplication
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const sacredGeometryVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.04,
  halationEnabled: true,
  caEnabled: false,
  lightLeakEnabled: true,
  grainStrength: "normal",
  eraGradingEnabled: true,
  lensDistortionEnabled: true,
  beatPulseEnabled: false,
  dofEnabled: true,
});

export const sacredGeometryFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define SG2_PI 3.14159265
#define SG2_TAU 6.28318530
#define SG2_PHI 1.61803398
#define SG2_INV_PHI 0.61803398
#define SG2_SQRT3 1.7320508

// ─── Hash ───
float sg2Hash(vec3 p) {
  p = fract(p * vec3(127.1, 311.7, 74.7));
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}

// ─── Smooth min for organic SDF blending ───
float sg2Smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── SDF: Box ───
float sg2Box(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// ─── SDF: Octahedron (platonic solid) ───
float sg2Octa(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

// ─── SDF: Tetrahedron ───
float sg2Tetra(vec3 p, float s) {
  float md = max(max(-p.x - p.y - p.z, p.x + p.y - p.z),
                 max(-p.x + p.y + p.z, p.x - p.y + p.z));
  return (md - s) / sqrt(3.0);
}

// ─── SDF: Icosahedron (approximate via dodecahedron dual) ───
float sg2Icosa(vec3 p, float rad) {
  // Golden ratio vertices for icosahedron
  float gn = SG2_PHI;
  // 6 symmetry planes from golden-ratio-defined normals
  vec3 n1 = normalize(vec3(1.0, gn, 0.0));
  vec3 n2 = normalize(vec3(0.0, 1.0, gn));
  vec3 n3 = normalize(vec3(gn, 0.0, 1.0));
  p = abs(p);
  float d = dot(p, n1);
  d = max(d, dot(p, n2));
  d = max(d, dot(p, n3));
  return d - rad;
}

// ─── SDF: Dodecahedron ───
float sg2Dodeca(vec3 p, float rad) {
  float gn = SG2_PHI;
  vec3 n1 = normalize(vec3(0.0, SG2_INV_PHI, gn));
  vec3 n2 = normalize(vec3(SG2_INV_PHI, gn, 0.0));
  vec3 n3 = normalize(vec3(gn, 0.0, SG2_INV_PHI));
  vec3 n4 = normalize(vec3(1.0, 1.0, 1.0));
  p = abs(p);
  float d = dot(p, n1);
  d = max(d, dot(p, n2));
  d = max(d, dot(p, n3));
  d = max(d, dot(p, n4));
  return d - rad;
}

// ─── SDF: Cylinder (for pillars) ───
float sg2Cyl(vec3 p, float r, float h) {
  float dxy = length(p.xz) - r;
  float dy = abs(p.y) - h;
  return min(max(dxy, dy), 0.0) + length(max(vec2(dxy, dy), 0.0));
}

// ─── SDF: Torus (sacred ring) ───
float sg2Torus(vec3 p, float R, float r) {
  vec2 q = vec2(length(p.xz) - R, p.y);
  return length(q) - r;
}

// ─── Flower of Life pattern (2D, for wall carving) ───
// Returns distance to nearest circle edge in the 7-circle lattice
float sg2FlowerOfLife(vec2 p, float radius) {
  float d = 1e5;
  // Center circle
  d = min(d, abs(length(p) - radius));
  // 6 surrounding circles
  for (int i = 0; i < 6; i++) {
    float ang = float(i) * SG2_TAU / 6.0;
    vec2 center = vec2(cos(ang), sin(ang)) * radius;
    d = min(d, abs(length(p - center) - radius));
  }
  // Second ring (12 circles at 2x distance) for full Flower of Life
  for (int i = 0; i < 6; i++) {
    float ang = float(i) * SG2_TAU / 6.0;
    vec2 center = vec2(cos(ang), sin(ang)) * radius * 2.0;
    d = min(d, abs(length(p - center) - radius));
  }
  for (int i = 0; i < 6; i++) {
    float ang = (float(i) + 0.5) * SG2_TAU / 6.0;
    vec2 center = vec2(cos(ang), sin(ang)) * radius * SG2_SQRT3;
    d = min(d, abs(length(p - center) - radius));
  }
  return d;
}

// ─── Metatron's Cube SDF (3D wireframe structure) ───
// 13 spheres + connecting lines forming the 3D sacred geometry
float sg2MetatronCube(vec3 p, float scale, float thickness) {
  float d = 1e5;
  // Center sphere
  d = min(d, length(p) - thickness * 2.0);
  // 6 vertices of octahedron (inner ring)
  float innerR = scale * SG2_INV_PHI;
  for (int i = 0; i < 6; i++) {
    float ang = float(i) * SG2_TAU / 6.0;
    vec3 vpos = vec3(cos(ang) * innerR, 0.0, sin(ang) * innerR);
    d = min(d, length(p - vpos) - thickness);
    // Connecting line from center to vertex (capsule)
    vec3 pa = p;
    vec3 ba = vpos;
    float proj = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    d = min(d, length(pa - ba * proj) - thickness * 0.5);
  }
  // Top and bottom vertices
  vec3 topV = vec3(0.0, scale * 0.8, 0.0);
  vec3 botV = vec3(0.0, -scale * 0.8, 0.0);
  d = min(d, length(p - topV) - thickness);
  d = min(d, length(p - botV) - thickness);
  // Connect top/bottom to center
  float projT = clamp(dot(p, topV) / dot(topV, topV), 0.0, 1.0);
  d = min(d, length(p - topV * projT) - thickness * 0.5);
  float projB = clamp(dot(p, botV) / dot(botV, botV), 0.0, 1.0);
  d = min(d, length(p - botV * projB) - thickness * 0.5);
  // Cross-connections between opposing vertices (star pattern)
  for (int i = 0; i < 3; i++) {
    float ang1 = float(i) * SG2_TAU / 6.0;
    float ang2 = ang1 + SG2_PI;
    vec3 v1 = vec3(cos(ang1) * innerR, 0.0, sin(ang1) * innerR);
    vec3 v2 = vec3(cos(ang2) * innerR, 0.0, sin(ang2) * innerR);
    vec3 seg = v2 - v1;
    float pr = clamp(dot(p - v1, seg) / dot(seg, seg), 0.0, 1.0);
    d = min(d, length(p - v1 - seg * pr) - thickness * 0.4);
  }
  return d;
}

// ─── Rotation matrices ───
mat3 sg2RotY(float a) {
  float ca = cos(a); float sa = sin(a);
  return mat3(ca, 0.0, sa, 0.0, 1.0, 0.0, -sa, 0.0, ca);
}
mat3 sg2RotX(float a) {
  float ca = cos(a); float sa = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, ca, -sa, 0.0, sa, ca);
}
mat3 sg2RotZ(float a) {
  float ca = cos(a); float sa = sin(a);
  return mat3(ca, -sa, 0.0, sa, ca, 0.0, 0.0, 0.0, 1.0);
}

// ─── Temple walls with flower-of-life carving ───
float sg2TempleWalls(vec3 p, float bassBreath, float tension, float psyche) {
  // Octagonal temple shell (8-sided prism via max of planes)
  float wallDist = 1e5;
  float templeR = 4.0 + bassBreath * 0.3;
  // 8 wall planes
  for (int i = 0; i < 8; i++) {
    float ang = float(i) * SG2_TAU / 8.0;
    vec2 n2d = vec2(cos(ang), sin(ang));
    float plane = dot(p.xz, n2d) - templeR;
    wallDist = max(wallDist == 1e5 ? plane : wallDist, plane);
  }
  // Floor and ceiling as phi-proportioned heights
  float ceilH = templeR * SG2_INV_PHI;
  float floorD = -p.y - ceilH;
  float ceilD = p.y - ceilH;
  float walls = max(wallDist, min(floorD, ceilD));
  walls = max(walls, min(floorD, ceilD));
  // Combine: inverted (we're inside the temple)
  float temple = -min(-wallDist, min(-floorD, -ceilD));

  // Carve flower-of-life into walls
  // Project onto wall surface for 2D pattern
  float wallAng = atan(p.z, p.x);
  float wallU = wallAng * templeR;
  float wallV = p.y;
  float flowerScale = 0.5 + psyche * 0.3;
  float flower = sg2FlowerOfLife(vec2(wallU, wallV) * flowerScale, 0.6);

  // Tension warps the flower pattern
  float warpAmt = tension * 0.15;
  flower += snoise(vec3(wallU * 2.0, wallV * 2.0, tension * 3.0)) * warpAmt;

  // Carve: thin flower lines become openings in the wall
  float carveDepth = 0.08 + psyche * 0.06;
  float carved = max(temple, -(flower - carveDepth));

  return carved;
}

// ─── Complete scene SDF ───
float sg2Map(vec3 p, float energy, float bass, float tension, float tm,
             float sJam, float sSpace, float sChorus, float sSolo,
             float climB, float psyche, float coherence) {
  float bassBreath = bass * 0.2;

  // Section blending: how much temple vs void
  float templePresence = 1.0;
  templePresence *= mix(1.0, 0.0, sSpace);  // space = void
  templePresence *= mix(1.0, 1.2, sChorus); // chorus = full temple
  templePresence = clamp(templePresence, 0.0, 1.0);

  float d = 1e5;

  // ─── Temple shell ───
  if (templePresence > 0.01) {
    float temple = sg2TempleWalls(p, bassBreath, tension, psyche);
    d = min(d, temple);

    // ─── Pillars: phi-spaced around perimeter ───
    float pillarR = 3.2 + bassBreath * 0.2;
    int numPillars = 6;
    for (int i = 0; i < 6; i++) {
      float ang = float(i) * SG2_TAU / 6.0 + SG2_PI / 6.0;
      vec3 pillarPos = vec3(cos(ang) * pillarR, 0.0, sin(ang) * pillarR);
      float pillar = sg2Cyl(p - pillarPos, 0.15 + bass * 0.03, 2.5);
      d = min(d, pillar);

      // Toroidal rings at phi-proportioned heights on each pillar
      for (int j = 0; j < 3; j++) {
        float ringY = -1.5 + float(j) * SG2_PHI * 0.9;
        vec3 ringP = p - pillarPos - vec3(0.0, ringY, 0.0);
        float ring = sg2Torus(ringP, 0.25 + bass * 0.12, 0.03);
        d = min(d, ring);
      }
    }
  }

  // ─── Central Metatron's Cube (always present, scales with energy) ───
  float metScale = 0.8 + energy * 0.4 + bassBreath * 0.5;
  // Space mode: single object, scaled up
  metScale *= mix(1.0, 1.8, sSpace);
  // Climax: pulsing expansion
  metScale *= 1.0 + climB * 0.4 * sin(tm * 4.0);

  // Rotate with time + drum onset snaps
  float metRot = tm * 0.15;
  vec3 mp = sg2RotY(metRot) * sg2RotX(metRot * SG2_INV_PHI) * p;

  // Tension warps from perfect geometry
  if (tension > 0.1) {
    mp += vec3(
      snoise(vec3(mp * 1.5 + tm * 0.5)) * tension * 0.15,
      snoise(vec3(mp * 1.5 + 50.0 + tm * 0.5)) * tension * 0.15,
      snoise(vec3(mp * 1.5 + 100.0 + tm * 0.5)) * tension * 0.15
    );
  }

  float metatron = sg2MetatronCube(mp, metScale, 0.04 + energy * 0.02);
  d = min(d, metatron);

  // ─── Orbiting platonic solids (appear with energy) ───
  float orbitR = 1.8 + bassBreath * 0.3;
  float orbitSpeed = tm * 0.2;

  // Octahedron orbit (visible at low energy)
  {
    float ang = orbitSpeed;
    vec3 oPos = vec3(cos(ang) * orbitR, sin(tm * 0.3) * 0.5, sin(ang) * orbitR);
    vec3 op = sg2RotY(tm * 0.4) * sg2RotX(tm * 0.3) * (p - oPos);
    float sz = 0.2 + bass * 0.14;
    d = min(d, sg2Octa(op, sz));
  }

  // Tetrahedron (energy > 0.25)
  if (energy > 0.2) {
    float vis = smoothstep(0.2, 0.4, energy);
    float ang2 = orbitSpeed + SG2_TAU / 3.0;
    vec3 tPos = vec3(cos(ang2) * orbitR, sin(tm * 0.25 + 2.0) * 0.5, sin(ang2) * orbitR);
    vec3 tp = sg2RotZ(tm * 0.35) * sg2RotY(tm * 0.25) * (p - tPos);
    float tsz = 0.25 + bass * 0.14;
    float tetra = sg2Tetra(tp, tsz);
    d = min(d, tetra / vis); // vis modulates effective distance
  }

  // Icosahedron (energy > 0.5)
  if (energy > 0.4) {
    float ang3 = orbitSpeed + SG2_TAU * 2.0 / 3.0;
    vec3 iPos = vec3(cos(ang3) * orbitR, sin(tm * 0.35 + 4.0) * 0.5, sin(ang3) * orbitR);
    vec3 ip = sg2RotX(tm * 0.3) * sg2RotZ(tm * 0.2) * (p - iPos);
    float isz = 0.18 + bass * 0.12;
    d = min(d, sg2Icosa(ip, isz));
  }

  // Dodecahedron (energy > 0.75)
  if (energy > 0.65) {
    float ang4 = -orbitSpeed * 0.7 + SG2_PI;
    vec3 dPos = vec3(cos(ang4) * orbitR * 0.8, 1.0 + sin(tm * 0.2) * 0.3, sin(ang4) * orbitR * 0.8);
    vec3 dp = sg2RotY(-tm * 0.25) * sg2RotX(tm * 0.15) * (p - dPos);
    float dsz = 0.2 + bass * 0.12;
    d = min(d, sg2Dodeca(dp, dsz));
  }

  // ─── Jam: fractal repetition of geometry ───
  if (sJam > 0.01) {
    // Repeat the Metatron's cube in a smaller grid
    vec3 jamP = p;
    float jamSpacing = 3.0;
    jamP.xz = mod(jamP.xz + jamSpacing * 0.5, jamSpacing) - jamSpacing * 0.5;
    vec3 jmp = sg2RotY(metRot * 1.5) * sg2RotX(metRot * 0.8) * jamP;
    float jamMet = sg2MetatronCube(jmp, metScale * 0.5, 0.03);
    d = min(d, mix(d, jamMet, sJam));
  }

  // ─── Climax: geometry fractures into particles ───
  if (climB > 0.1) {
    float particleField = 1e5;
    // Scattered golden spheres from exploded geometry
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float seed = sg2Hash(vec3(fi * 127.1, fi * 311.7, fi * 74.7));
      float expandR = climB * 2.0 * (0.5 + seed * 0.5);
      float pAng = seed * SG2_TAU + tm * (0.5 + seed);
      float pElev = (seed - 0.5) * 2.0;
      vec3 pPos = vec3(cos(pAng) * expandR, pElev * expandR * 0.5, sin(pAng) * expandR);
      float pSize = 0.04 + seed * 0.06;
      particleField = min(particleField, length(p - pPos) - pSize);
    }
    d = min(d, particleField);
  }

  // ─── Floor sacred geometry pattern ───
  if (templePresence > 0.01) {
    float floorY = -(4.0 * SG2_INV_PHI) + 0.01;
    float floorPlane = p.y - floorY;
    // Carve flower pattern into floor
    float floorFlower = sg2FlowerOfLife(p.xz * 0.8, 0.5);
    float floorCarved = max(floorPlane, -(floorFlower - 0.03));
    d = min(d, abs(floorCarved) - 0.01);
  }

  return d;
}

// ─── Compute normal via central differences ───
vec3 sg2Normal(vec3 p, float energy, float bass, float tension, float tm,
               float sJam, float sSpace, float sChorus, float sSolo,
               float climB, float psyche, float coherence) {
  vec2 eps = vec2(0.002, 0.0);
  float b0 = sg2Map(p, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence);
  return normalize(vec3(
    sg2Map(p + eps.xyy, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence) - b0,
    sg2Map(p + eps.yxy, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence) - b0,
    sg2Map(p + eps.yyx, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence) - b0
  ));
}

// ─── Ambient occlusion ───
float sg2AO(vec3 p, vec3 n, float energy, float bass, float tension, float tm,
            float sJam, float sSpace, float sChorus, float sSolo,
            float climB, float psyche, float coherence) {
  float occ = 1.0;
  for (int i = 1; i < 5; i++) {
    float fi = float(i);
    float stepD = 0.12 * fi;
    float sampD = sg2Map(p + n * stepD, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence);
    occ -= (stepD - sampD) * (0.35 / fi);
  }
  return clamp(occ, 0.12, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Audio clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float coherence = clamp(uCoherence, 0.0, 2.0);
  float spaceS = clamp(uSpaceScore, 0.0, 1.0);
  float timbralB = clamp(uTimbralBrightness, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float beatSnp = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  // ─── Section type decomposition ───
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType) + spaceS * 0.5;
  sSpace = clamp(sSpace, 0.0, 1.0);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // ─── Climax state ───
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Time (slowed, section-modulated) ───
  float tm = uDynamicTime * (0.05 + slowE * 0.03) * (1.0 + sJam * 0.4 - sSpace * 0.3);
  // Drum onset snaps: discrete angular jumps
  tm += drumOn * 0.15;

  // ─── Palette ───
  float h1 = uPalettePrimary;
  vec3 palPrimary = paletteHueColor(h1, 0.85, 0.95);
  float h2 = uPaletteSecondary;
  vec3 palSecondary = paletteHueColor(h2, 0.85, 0.95);

  // Golden light color modulated by vocal presence
  vec3 goldenLight = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.95, 0.8), vocalP);
  goldenLight *= 0.5 + vocalP * 0.8;

  // ─── Camera ───
  float camDrift = tm * 0.8;
  float camSwayX = sin(tm * 0.12) * 0.6 * mix(1.0, 0.1, sSpace);
  float camSwayZ = cos(tm * 0.09) * 0.6 * mix(1.0, 0.1, sSpace);
  float camY = 0.0 + (melPitch - 0.5) * 0.6;
  // Space: pull camera back for vast void feeling
  float camPull = mix(0.0, 3.0, sSpace);

  vec3 ro = vec3(camSwayX, camY, camSwayZ - camPull);
  vec3 lookAt = vec3(sin(tm * 0.06) * 0.3, (melPitch - 0.5) * 0.2, 2.0 - camPull);
  vec3 fw = normalize(lookAt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 upVec = cross(fw, ri);
  float fov = 0.8 + energy * 0.1 + climB * 0.2;
  vec3 rd = normalize(p.x * ri + p.y * upVec + fov * fw);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 marchPos = ro;
  bool marchHit = false;
  int maxSteps = int(mix(60.0, 90.0, energy));

  for (int i = 0; i < 90; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * totalDist;
    float dist = sg2Map(ps, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence);

    // Climax: jitter the field for particle dissolution effect
    if (climB > 0.3) {
      dist += climB * 0.4 * (0.5 + 0.5 * snoise(ps * 2.0 + tm * 5.0));
    }

    if (dist < 0.002) {
      marchPos = ps;
      marchHit = true;
      break;
    }
    if (totalDist > 20.0) break;
    totalDist += dist * 0.7;
  }

  // ─── Shading ───
  vec3 col = vec3(0.0);

  if (marchHit) {
    vec3 norm = sg2Normal(marchPos, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence);
    float occl = sg2AO(marchPos, norm, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence);

    // ─── Lighting: golden directional + ambient ───
    // Main light from above (temple skylight through geometry)
    vec3 lightDir = normalize(vec3(0.3, 0.9, 0.4));
    float diff = max(dot(norm, lightDir), 0.0);

    // Specular: timbral brightness controls reflectivity
    float specPow = 16.0 + highs * 48.0 + timbralB * 32.0;
    float spec = pow(max(dot(reflect(-lightDir, norm), -rd), 0.0), specPow);

    // Fresnel: rim lighting
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.5);

    // ─── Surface color ───
    // Walls: stone-like with palette tint
    float depthFade = clamp(totalDist / 15.0, 0.0, 1.0);
    vec3 stoneColor = mix(palPrimary * 0.15, palPrimary * 0.04, depthFade);

    // Flower-of-life pattern on surfaces: project worldspace to get 2D pattern
    float wallAng2 = atan(marchPos.z, marchPos.x);
    float surfPattern = sg2FlowerOfLife(
      vec2(wallAng2 * 2.5, marchPos.y * 1.5) * (1.0 + psyche * 0.5),
      0.4
    );
    float patternLine = smoothstep(0.06, 0.0, surfPattern);

    // Golden glow in flower pattern lines (light through gaps)
    vec3 patternGlow = goldenLight * patternLine * (0.15 + vocalP * 0.3);

    // Beat snap flash on edges
    vec3 beatFlash = vec3(1.0, 0.95, 0.85) * patternLine * beatSnp * 0.4;

    // Compose surface. Spectral centroid (audio brightness) lifts the
    // specular contribution AND the flower-of-life pattern glow — so
    // bright audio (cymbals, vocal sibilance) etches the sacred-geometry
    // edges in golden light; dark audio (sub-bass, low pads) lets them
    // recede into stone.
    float sgCentroid = clamp(uCentroid, 0.0, 1.0);
    col = stoneColor * (0.05 + diff * 0.3) * occl;
    col += palSecondary * spec * (0.12 + sgCentroid * 0.10) * (1.0 + timbralB * 0.5);
    col += mix(palSecondary, goldenLight, 0.5) * fresnel * 0.08;
    col += patternGlow * (1.0 + sgCentroid * 0.35);
    col += beatFlash;

    // Coherence: high = sharp golden edges, low = diffuse warm glow
    float edgeSharp = mix(0.3, 1.0, coherence);
    col *= edgeSharp + (1.0 - edgeSharp) * 0.7;

    // Solo: dramatic spotlight
    if (sSolo > 0.01) {
      float spotlight = exp(-length(marchPos.xz) * 0.8);
      col += goldenLight * spotlight * sSolo * 0.2;
    }

    // Energy boost
    col *= 1.0 + energy * 0.35;

  } else {
    // ─── Background: deep void with sacred geometry hints ───
    float bgGrad = rd.y * 0.5 + 0.5;
    vec3 voidColor = mix(vec3(0.005, 0.003, 0.012), vec3(0.015, 0.01, 0.025), bgGrad);
    // Cosmic coloring
    voidColor = mix(voidColor, vec3(0.01, 0.005, 0.03), cosmic * 0.5);
    col = voidColor;

    // Distant stars
    vec3 starCell = floor(rd * 40.0);
    float starHash = fract(sin(dot(starCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float starBright = step(0.92, starHash) * smoothstep(0.04, 0.01, length(fract(rd * 40.0) - 0.5));
    col += mix(vec3(0.8, 0.85, 1.0), palSecondary, 0.3) * starBright * 0.3;

    // Climax: golden nebula in void
    if (climB > 0.1) {
      float nebula = fbm3(rd * 3.0 + tm * 0.3);
      col += goldenLight * nebula * climB * 0.15;
    }
  }

  // ─── Volumetric golden light (god rays through flower-of-life gaps) ───
  {
    vec3 lightPos = vec3(0.0, 3.0, 2.0);
    float rayAccum = 0.0;
    for (int g = 0; g < 12; g++) {
      float gDist = 0.3 + float(g) * 0.6;
      if (gDist > totalDist && marchHit) break;
      vec3 gp = ro + rd * gDist;
      // Sample scene to check if in open space (light can reach)
      float sceneDist = sg2Map(gp, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence);
      float inLight = smoothstep(-0.1, 0.3, sceneDist);
      // Fog density varies with position
      float fogD = fbm3(gp * 0.4 + tm * 0.02) * (0.08 + bass * 0.1);
      // Distance to light source
      float lightFade = 1.0 / (1.0 + length(gp - lightPos) * 0.15);
      rayAccum += inLight * fogD * lightFade * 0.025;
    }
    col += goldenLight * rayAccum * (0.4 + vocalP * 0.6 + climB * 0.4);
  }

  // ─── Volumetric haze (atmospheric depth) ───
  {
    float hazeDensity = mix(0.03, 0.01, energy);
    float hazeD = 1.0 - exp(-totalDist * hazeDensity);
    vec3 hazeColor = mix(vec3(0.01, 0.008, 0.02), palPrimary * 0.03, 0.3 + cosmic * 0.3);
    col = mix(col, hazeColor, hazeD);
  }

  // ─── Climax: golden particle sparkle overlay ───
  if (climB > 0.2) {
    float sparkle = snoise(vec3(p * 30.0, tm * 2.0));
    sparkle = smoothstep(0.7, 1.0, sparkle);
    col += goldenLight * sparkle * climB * 0.3;
  }

  // ─── Beat pulse brightness ───
  col *= 1.0 + beatSnp * 0.08;

  // ─── Vignette ───
  float vigScale = mix(0.28, 0.22, energy);
  float vig = 1.0 - dot(p * vigScale, p * vigScale);
  vig = smoothstep(0.0, 1.0, vig);
  col = mix(vec3(0.003, 0.002, 0.006), col, vig);

  // ─── Minimum black floor ───
  col = max(col, vec3(0.008, 0.006, 0.012));

  // ─── Icon emergence ───
  {
    float nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, uBass, palPrimary, palSecondary, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, uBass, palPrimary, palSecondary, nf, uSectionIndex);
  }

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
