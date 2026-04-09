/**
 * Psychedelic Garden — raymarched fractal sunflower field for "China Cat Sunflower".
 * Art Nouveau meets acid trip: Fibonacci spiral sunflower heads, twisted stems,
 * butterfly particle trails, volumetric pollen haze. The garden breathes with music.
 *
 * Ground-level camera looking through a field of stylized sunflowers.
 * Sunflower discs with petal rings, S-curve stems, Vogel spiral seeds,
 * undulating grassy ground, floating pollen/firefly particles, butterfly pairs.
 * During jams: flowers morph into fractal golden-ratio spirals.
 * During space: flowers close, garden goes still, moonlit blue.
 * During climax: petal storm explosion.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              → stem sway amplitude, ground undulation
 *   uEnergy            → bloom state (closed→open), pollen density, color saturation
 *   uDrumOnset         → petal burst, butterfly launch
 *   uVocalPresence     → sun warmth, subsurface scattering glow
 *   uHarmonicTension   → flower morphing (natural→alien/fractal)
 *   uMelodicPitch      → flower height variation
 *   uSectionType       → jam=fractal spiral mode, space=moonlit garden, chorus=full bloom
 *   uClimaxPhase       → flowers explode into petal storm
 *   uBeatSnap          → sunlight flash
 *   uSemanticPsychedelic → kaleidoscopic geometry folding
 *   uSlowEnergy        → drift speed, atmospheric density
 *   uHighs             → petal shimmer, butterfly count
 *   uChromaHue         → petal color shift
 *   uSpaceScore        → ambient garden stillness
 *   uTimbralBrightness → subsurface petal translucency
 *   uDynamicRange      → contrast between flower and shadow
 *   uJamPhase          → fractal recursion depth
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const psychedelicGardenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  lightLeakEnabled: true,
  beatPulseEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
});

export const psychedelicGardenFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define PHI 1.61803398
#define MAX_DIST 60.0
#define SURF_DIST 0.002
#define MAX_STEPS 96

// ─── Hashing ───

float pgHash(float n) {
  return fract(sin(n) * 43758.5453);
}

float pgHash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 pgHash22(vec2 p) {
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
  );
}

vec3 pgHash33(vec3 p) {
  return vec3(
    fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453),
    fract(sin(dot(p, vec3(269.5, 183.3, 246.1))) * 43758.5453),
    fract(sin(dot(p, vec3(113.5, 271.9, 124.6))) * 43758.5453)
  );
}

// ─── SDF Primitives ───

float pgSdSphere(vec3 p, float r) {
  return length(p) - r;
}

float pgSdCylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float pgSdDisc(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float pgSdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float pgSdPlane(vec3 p) {
  return p.y;
}

float pgSmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Rotation ───

mat2 pgRot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// ─── Garden scene parameters (set per-frame in main) ───

float pgBloomState;     // 0 = closed bud, 1 = full bloom
float pgFractalMorph;   // 0 = natural, 1 = fractal spiral
float pgGardenTime;     // slow dynamic time
float pgSwayAmp;        // bass-driven sway
float pgMoonlight;      // 0 = day, 1 = night (space sections)
float pgPetalStorm;     // 0 = calm, 1 = full storm (climax)
float pgKaleidoFoldCount; // psychedelic geometry fold count (renamed: collided with pgKaleidoFold function)
float pgSubsurface;     // petal translucency

// ─── Sunflower Head SDF ───
// Disc center with petal ring — elongated ellipsoids around perimeter

float pgSunflowerHead(vec3 p, float cellSeed, float bloomAmt) {
  // Disc face (flat cylinder)
  float discR = 0.18 + cellSeed * 0.04;
  float disc = pgSdDisc(p, discR, 0.03);

  // Fibonacci seed spiral on disc face (Vogel's model)
  float seedAccum = 1e10;
  float goldenAngle = PI * (3.0 - sqrt(5.0));
  for (int i = 0; i < 24; i++) {
    float fi = float(i) + 1.0;
    float seedR = discR * 0.85 * sqrt(fi / 24.0);
    float seedA = fi * goldenAngle;
    vec3 seedPos = vec3(seedR * cos(seedA), 0.035, seedR * sin(seedA));
    float seedD = pgSdSphere(p - seedPos, 0.012 + 0.004 * sin(fi * 1.7));
    seedAccum = min(seedAccum, seedD);
  }
  disc = pgSmoothMin(disc, seedAccum, 0.01);

  // Petal ring: 13 petals (Fibonacci number) around the disc
  float petalAccum = 1e10;
  float petalCount = 13.0;
  float spreadFactor = mix(0.02, 1.0, bloomAmt); // petals unfurl with energy

  for (int i = 0; i < 13; i++) {
    float fi = float(i);
    float angle = fi / petalCount * TAU + cellSeed * TAU;
    // Petals tilt outward as they bloom
    float tiltAngle = mix(0.1, 0.7, bloomAmt) + sin(fi * 2.3 + pgGardenTime * 0.3) * 0.05;

    // Petal position: on perimeter, radiating outward
    vec3 petalCenter = vec3(
      cos(angle) * (discR + 0.08 * spreadFactor),
      0.02 - sin(tiltAngle) * 0.06 * spreadFactor,
      sin(angle) * (discR + 0.08 * spreadFactor)
    );

    // Rotate petal to face outward
    vec3 localP = p - petalCenter;
    float ca = cos(angle), sa = sin(angle);
    localP.xz = mat2(ca, sa, -sa, ca) * localP.xz;

    // Petal shape: elongated ellipsoid
    float petalLen = (0.10 + cellSeed * 0.03) * spreadFactor;
    float petalW = 0.035 + 0.01 * sin(fi * 3.7);
    vec3 petalScale = vec3(petalW, 0.008 + 0.003 * bloomAmt, petalLen);
    float petalD = pgSdEllipsoid(localP, petalScale);

    // Fractal morph: petals develop sub-petals during jams
    if (pgFractalMorph > 0.1) {
      float subAngle = atan(localP.z, localP.x) * 3.0 + pgGardenTime;
      float subR = length(localP.xz);
      float subPetal = subR - petalLen * 0.4 * (0.5 + 0.5 * cos(subAngle));
      petalD = mix(petalD, min(petalD, subPetal * 0.3), pgFractalMorph * 0.5);
    }

    petalAccum = pgSmoothMin(petalAccum, petalD, 0.008);
  }

  return pgSmoothMin(disc, petalAccum, 0.012);
}

// ─── Stem SDF: S-curve cylinder ───

float pgStem(vec3 p, float height, float cellSeed) {
  // S-curve displacement
  float swayPhase = cellSeed * TAU + pgGardenTime * 1.5;
  float sway = pgSwayAmp * sin(p.y * 2.0 + swayPhase) * 0.15;
  float sway2 = pgSwayAmp * cos(p.y * 1.3 + swayPhase * 0.7) * 0.08;

  vec3 stemP = p;
  stemP.x -= sway;
  stemP.z -= sway2;

  // Tapered cylinder (thicker at base)
  float radius = mix(0.025, 0.012, clamp(p.y / height, 0.0, 1.0));
  float d = length(stemP.xz) - radius;
  d = max(d, -p.y);         // cut below ground
  d = max(d, p.y - height); // cut above height
  return d;
}

// ─── Leaf SDF ───

float pgLeaf(vec3 p, float size, float angle) {
  // Tilt leaf along stem
  p.xy = pgRot(angle) * p.xy;
  // Elongated ellipsoid leaf
  vec3 leafScale = vec3(size * 0.3, size * 0.05, size);
  float d = pgSdEllipsoid(p, leafScale);
  // Vein: thin line down center
  float vein = max(abs(p.x) - size * 0.01, abs(p.z) - size * 0.95);
  d = min(d, max(vein, d + 0.005));
  return d;
}

// ─── Ground SDF ───

float pgGround(vec3 p) {
  float undulation = snoise(vec3(p.x * 0.5, 0.0, p.z * 0.5 + pgGardenTime * 0.05)) * 0.15;
  undulation += snoise(vec3(p.x * 1.5, 0.0, p.z * 1.5)) * 0.05;
  undulation *= (1.0 + pgSwayAmp * 0.5);
  return p.y - undulation;
}

// ─── Full scene SDF ───

struct PgHitInfo {
  float dist;
  float matId; // 0=ground, 1=stem, 2=petal, 3=disc, 4=leaf
  float cellSeed;
};

PgHitInfo pgMap(vec3 p) {
  PgHitInfo info;
  info.dist = 1e10;
  info.matId = 0.0;
  info.cellSeed = 0.0;

  // Ground
  float gnd = pgGround(p);
  if (gnd < info.dist) {
    info.dist = gnd;
    info.matId = 0.0;
  }

  // Flower field: repeat in XZ grid
  float cellSize = 2.5;
  vec2 cellId = floor(p.xz / cellSize);
  vec2 cellUv = fract(p.xz / cellSize) - 0.5;

  // Check 3x3 neighborhood for overlapping flowers
  for (int ox = -1; ox <= 1; ox++) {
    for (int oz = -1; oz <= 1; oz++) {
      vec2 neighborId = cellId + vec2(float(ox), float(oz));
      float presence = pgHash21(neighborId);
      if (presence < 0.3) continue; // sparse field

      vec2 offset = pgHash22(neighborId * 1.73 + 5.0) * 0.6 - 0.3;
      float cellSeed = pgHash21(neighborId * 2.71);

      // World position of this flower's base
      vec3 flowerBase = vec3(
        (neighborId.x + 0.5 + offset.x) * cellSize,
        0.0,
        (neighborId.y + 0.5 + offset.y) * cellSize
      );

      // Flower height varies with melodic pitch and seed
      float flowerH = 1.2 + cellSeed * 0.8 + pgHash(cellSeed * 17.3) * 0.4;

      // Local space relative to flower base
      vec3 localP = p - flowerBase;

      // Stem
      float stemD = pgStem(localP, flowerH, cellSeed);
      if (stemD < info.dist) {
        info.dist = stemD;
        info.matId = 1.0;
        info.cellSeed = cellSeed;
      }

      // Leaves on stem (2 per flower)
      for (int lf = 0; lf < 2; lf++) {
        float lfY = flowerH * (0.25 + float(lf) * 0.25);
        float lfSide = float(lf) * 2.0 - 1.0;
        vec3 leafP = localP - vec3(lfSide * 0.06, lfY, 0.0);

        // Apply stem sway to leaf position
        float swayPhase = cellSeed * TAU + pgGardenTime * 1.5;
        float stemSway = pgSwayAmp * sin(lfY * 2.0 + swayPhase) * 0.15;
        leafP.x -= stemSway;

        float leafD = pgLeaf(leafP, 0.12, lfSide * 0.8);
        if (leafD < info.dist) {
          info.dist = leafD;
          info.matId = 4.0;
          info.cellSeed = cellSeed;
        }
      }

      // Flower head at top of stem
      float swayPhaseHead = cellSeed * TAU + pgGardenTime * 1.5;
      float headSwayX = pgSwayAmp * sin(flowerH * 2.0 + swayPhaseHead) * 0.15;
      float headSwayZ = pgSwayAmp * cos(flowerH * 1.3 + swayPhaseHead * 0.7) * 0.08;

      vec3 headP = localP - vec3(headSwayX, flowerH, headSwayZ);
      // Tilt flower face toward sun (slight forward lean)
      headP.yz = pgRot(-0.3 - cellSeed * 0.2) * headP.yz;

      // Per-cell bloom state variation
      float localBloom = pgBloomState + sin(cellSeed * TAU + pgGardenTime * 0.4) * 0.15;
      localBloom = clamp(localBloom, 0.0, 1.0);

      float headD = pgSunflowerHead(headP, cellSeed, localBloom);
      if (headD < info.dist) {
        info.dist = headD;
        info.matId = (abs(headP.y) < 0.04 && length(headP.xz) < 0.18) ? 3.0 : 2.0;
        info.cellSeed = cellSeed;
      }
    }
  }

  return info;
}

// ─── Raymarching ───

PgHitInfo pgRaymarch(vec3 ro, vec3 rd) {
  PgHitInfo info;
  info.dist = 0.0;
  info.matId = -1.0;
  info.cellSeed = 0.0;

  float t = 0.0;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 pos = ro + rd * t;
    PgHitInfo scene = pgMap(pos);
    if (scene.dist < SURF_DIST) {
      info.dist = t;
      info.matId = scene.matId;
      info.cellSeed = scene.cellSeed;
      return info;
    }
    t += scene.dist * 0.7; // conservative step for organic SDFs
    if (t > MAX_DIST) break;
  }
  info.dist = t;
  return info;
}

// ─── Normal calculation ───

vec3 pgNormal(vec3 p) {
  float eps = 0.001;
  float d = pgMap(p).dist;
  return normalize(vec3(
    pgMap(p + vec3(eps, 0.0, 0.0)).dist - d,
    pgMap(p + vec3(0.0, eps, 0.0)).dist - d,
    pgMap(p + vec3(0.0, 0.0, eps)).dist - d
  ));
}

// ─── Soft shadow ───

float pgSoftShadow(vec3 ro, vec3 rd, float mint, float maxt, float k) {
  float result = 1.0;
  float t = mint;
  for (int i = 0; i < 32; i++) {
    if (t > maxt) break;
    float d = pgMap(ro + rd * t).dist;
    if (d < 0.001) return 0.0;
    result = min(result, k * d / t);
    t += clamp(d, 0.02, 0.2);
  }
  return clamp(result, 0.0, 1.0);
}

// ─── Ambient occlusion ───

float pgAO(vec3 p, vec3 n) {
  float aoVal = 0.0;
  float scale = 1.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i) + 1.0;
    float dist = 0.02 * fi;
    float d = pgMap(p + n * dist).dist;
    aoVal += (dist - d) * scale;
    scale *= 0.6;
  }
  return clamp(1.0 - aoVal * 3.0, 0.0, 1.0);
}

// ─── Subsurface scattering approximation for petals ───

float pgSSS(vec3 p, vec3 lightDir, vec3 viewDir, vec3 n) {
  vec3 sssDir = normalize(lightDir + n * 0.3);
  float sssDot = pow(clamp(dot(viewDir, -sssDir), 0.0, 1.0), 3.0);
  float thickness = clamp(pgMap(p - lightDir * 0.1).dist * 10.0, 0.0, 1.0);
  return sssDot * (1.0 - thickness) * pgSubsurface;
}

// ─── Pollen / Firefly particles (screen space) ───

vec3 pgPollenParticles(vec2 screenP, float energy, float time, float drumOnset) {
  vec3 accum = vec3(0.0);
  float count = mix(8.0, 30.0, energy);

  for (int i = 0; i < 30; i++) {
    if (float(i) >= count) break;
    float fi = float(i);
    float seed = pgHash(fi * 13.7);
    float seed2 = pgHash(fi * 27.3 + 5.0);

    // 3D Lissajous path projected
    float px = sin(time * (0.1 + seed * 0.08) + seed * TAU) * 0.8;
    float py = mix(-0.2, 0.5, seed2) + sin(time * (0.12 + seed2 * 0.06) + fi * 1.3) * 0.15;

    // Drum onset launches new particles upward
    py += drumOnset * seed * 0.3 * exp(-mod(time, 2.0) * 2.0);

    vec2 particlePos = screenP - vec2(px, py);
    float dist = length(particlePos);

    // Point glow
    float glow = 0.003 / (dist * dist + 0.003);
    float twinkle = 0.5 + 0.5 * sin(time * (3.0 + seed * 4.0) + fi);

    // Warm golden pollen color
    vec3 pollenCol = mix(
      vec3(1.0, 0.9, 0.4),
      vec3(0.4, 1.0, 0.6),
      seed
    );
    accum += pollenCol * glow * twinkle * 0.06;
  }
  return accum;
}

// ─── Butterfly pairs (screen space) ───

vec3 pgButterflies(vec2 screenP, float energy, float time, float drumOnset, vec3 col1, vec3 col2) {
  vec3 accum = vec3(0.0);
  float count = mix(1.0, 5.0, energy) + drumOnset * 3.0;

  for (int i = 0; i < 5; i++) {
    if (float(i) >= count) break;
    float fi = float(i);
    float seed = pgHash(fi * 37.1 + 100.0);

    // Sine-wave flight path
    float px = sin(time * (0.08 + seed * 0.05) + seed * TAU) * 0.7;
    float py = 0.1 + seed * 0.3 + sin(time * 0.15 + fi * 2.0) * 0.1;

    vec2 bp = (screenP - vec2(px, py)) * 12.0;

    // Wing flap
    float flap = sin(time * (6.0 + seed * 3.0)) * 0.5;

    // Left wing (triangle-ish via ellipse)
    vec2 lwp = bp - vec2(-0.3, 0.0);
    lwp.x *= 1.0 + flap;
    float lw = length(lwp * vec2(1.0, 1.8)) - 0.4;

    // Right wing
    vec2 rwp = bp - vec2(0.3, 0.0);
    rwp.x *= 1.0 - flap;
    float rw = length(rwp * vec2(1.0, 1.8)) - 0.4;

    // Body
    float body = length(bp * vec2(6.0, 1.2)) - 0.15;

    float d = min(min(lw, rw), body);
    float vis = smoothstep(0.05, 0.0, d);

    vec3 wingCol = mix(col1, col2, seed);
    wingCol = mix(wingCol, vec3(1.0, 0.6, 0.0), 0.3);
    accum += wingCol * vis * 0.3;
  }
  return accum;
}

// ─── Volumetric pollen haze (integrated along ray) ───

vec3 pgVolHaze(vec3 ro, vec3 rd, float maxT, float energy, float time) {
  vec3 haze = vec3(0.0);
  float hazeAlpha = 0.0;
  int hazeSteps = int(mix(6.0, 14.0, energy));

  for (int i = 0; i < 14; i++) {
    if (i >= hazeSteps) break;
    float fi = float(i);
    float t = 1.0 + fi * (min(maxT, 20.0) / 14.0);
    vec3 pos = ro + rd * t;

    // Haze density: concentrated at flower level (y=0.5-2.5)
    float heightMask = smoothstep(0.0, 0.5, pos.y) * smoothstep(3.0, 1.5, pos.y);
    float density = fbm3(pos * 0.3 + vec3(0.0, 0.0, time * 0.05)) * 0.5 + 0.3;
    density *= heightMask * 0.02;
    density *= energy * 0.5 + 0.5;

    if (density > 0.001) {
      float alpha = density * (1.0 - hazeAlpha);
      // Golden sun-scatter color
      float sunDot = max(0.0, dot(rd, normalize(vec3(1.0, 2.0, 0.5))));
      float scatter = pow(sunDot, 4.0);
      vec3 hazeCol = mix(
        vec3(0.8, 0.7, 0.3) * 0.5,    // ambient gold
        vec3(1.0, 0.9, 0.5),            // bright sun scatter
        scatter
      );
      // Moonlight tints haze blue
      hazeCol = mix(hazeCol, vec3(0.2, 0.3, 0.6) * 0.4, pgMoonlight);

      haze += hazeCol * alpha;
      hazeAlpha += alpha;
    }
  }
  return haze;
}

// ─── Kaleidoscopic UV fold (psychedelic semantic) ───

vec2 pgKaleidoFold(vec2 p, float folds) {
  float angle = atan(p.y, p.x);
  float r = length(p);
  float segAngle = TAU / folds;
  angle = mod(angle, segAngle);
  angle = abs(angle - segAngle * 0.5);
  return vec2(cos(angle), sin(angle)) * r;
}

// ─── Petal storm particles (climax) ───

vec3 pgPetalStormParticles(vec2 screenP, float stormIntensity, float time, vec3 col1, vec3 col2) {
  if (stormIntensity < 0.01) return vec3(0.0);
  vec3 accum = vec3(0.0);
  float count = stormIntensity * 40.0;

  for (int i = 0; i < 40; i++) {
    if (float(i) >= count) break;
    float fi = float(i);
    float seed = pgHash(fi * 7.13 + 200.0);
    float seed2 = pgHash(fi * 11.37 + 300.0);

    // Petals spiral outward and fall
    float spawnT = mod(time + seed * 5.0, 5.0);
    float spiralAngle = spawnT * 3.0 + seed * TAU;
    float spiralR = spawnT * 0.15;
    float fallY = 0.3 - spawnT * 0.12;

    vec2 petalPos = screenP - vec2(
      cos(spiralAngle) * spiralR,
      fallY + sin(spiralAngle * 2.0) * 0.05
    );

    // Elongated rotating petal shape
    float petalAngle = time * 3.0 + seed * TAU;
    petalPos = pgRot(petalAngle) * petalPos;
    float d = length(petalPos * vec2(1.0, 3.0)) - 0.008;

    float vis = smoothstep(0.003, 0.0, d) * smoothstep(0.0, 0.5, spawnT) * smoothstep(5.0, 3.5, spawnT);
    vec3 petalCol = mix(col1, col2, seed);
    petalCol *= 1.0 + seed2 * 0.3;
    accum += petalCol * vis * 0.15;
  }
  return accum;
}


void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio state ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = uChromaHue;
  float spaceScr = clamp(uSpaceScore, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float beatSnp = clamp(uBeatSnap, 0.0, 1.0);
  float semPsy = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float tBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float jamPhase = uJamPhase;

  // ─── Section type decode ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax decode ───
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // ─── Set global scene parameters ───
  pgGardenTime = uDynamicTime * (0.06 + slowE * 0.04) * mix(1.0, 1.6, sJam) * mix(1.0, 0.3, sSpace);

  pgBloomState = mix(0.15, 1.0, energy);
  pgBloomState = mix(pgBloomState, 1.0, sChorus * 0.6);
  pgBloomState = mix(pgBloomState, 1.0, sJam * 0.4);
  pgBloomState = mix(pgBloomState, 0.05, sSpace * 0.8);
  pgBloomState += climaxBoost * 0.2;
  pgBloomState += drumOnset * 0.2;
  pgBloomState = clamp(pgBloomState, 0.0, 1.0);

  pgFractalMorph = sJam * tension * 0.8 + semPsy * 0.3;
  pgFractalMorph = mix(pgFractalMorph, pgFractalMorph * 1.5, step(1.0, jamPhase)); // building phase intensifies
  pgFractalMorph = clamp(pgFractalMorph, 0.0, 1.0);

  pgSwayAmp = bass * mix(1.0, 2.0, sJam) * mix(1.0, 0.2, sSpace);
  pgMoonlight = sSpace * 0.8 + spaceScr * 0.4;
  pgMoonlight = clamp(pgMoonlight, 0.0, 1.0);

  pgPetalStorm = climaxBoost * 0.6 + step(2.5, climaxPhase) * climaxI * 0.4;
  pgPetalStorm = clamp(pgPetalStorm, 0.0, 1.0);

  pgKaleidoFoldCount = semPsy * 4.0 + 2.0; // 2-6 fold segments
  pgSubsurface = 0.3 + vocalPres * 0.4 + tBright * 0.3;

  // ─── Kaleidoscopic UV folding (psychedelic semantic) ───
  vec2 marchP = p;
  if (semPsy > 0.15) {
    float foldStrength = smoothstep(0.15, 0.5, semPsy);
    vec2 folded = pgKaleidoFold(p, pgKaleidoFoldCount);
    marchP = mix(p, folded, foldStrength * 0.3);
  }

  // ─── Camera: ground level looking through the field ───
  vec3 ro = uCamPos;
  vec3 camTgt = uCamTarget;

  // Gentle breathing with bass
  ro.y += sin(pgGardenTime * 0.5) * 0.05 * bass;

  vec3 forward = normalize(camTgt - ro);
  vec3 rgt = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 upd = cross(rgt, forward);
  float fovScale = tan(radians(uCamFov) * 0.5);
  vec3 rd = normalize(forward + rgt * marchP.x * fovScale + upd * marchP.y * fovScale);

  // ─── Palette ───
  float hue1 = uPalettePrimary + chromaH * 0.08;
  float hue2 = uPaletteSecondary + chromaH * 0.06;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;

  vec3 petalCol1 = paletteHueColor(hue1, sat, 0.95);
  vec3 petalCol2 = paletteHueColor(hue2, sat, 0.95);
  // Warm sunflower bias
  petalCol1 = mix(petalCol1, vec3(1.0, 0.85, 0.15), 0.2);
  petalCol2 = mix(petalCol2, vec3(0.95, 0.55, 0.10), 0.15);
  // Moonlight desaturates and cools
  petalCol1 = mix(petalCol1, vec3(0.4, 0.5, 0.7), pgMoonlight * 0.6);
  petalCol2 = mix(petalCol2, vec3(0.3, 0.4, 0.6), pgMoonlight * 0.5);

  vec3 stemCol = mix(vec3(0.15, 0.45, 0.10), vec3(0.25, 0.55, 0.15), energy);
  stemCol = mix(stemCol, vec3(0.1, 0.15, 0.2), pgMoonlight * 0.7);

  vec3 discCol = mix(vec3(0.4, 0.25, 0.05), vec3(0.6, 0.4, 0.1), energy);
  vec3 leafCol = mix(vec3(0.12, 0.4, 0.08), vec3(0.2, 0.5, 0.12), slowE);

  // ─── Sun/Moon light direction ───
  vec3 sunDir = normalize(mix(
    vec3(1.0, 2.5, 0.5),               // day: sun from above-right
    vec3(-0.5, 1.5, -0.3),             // night: moon from above-left
    pgMoonlight
  ));

  vec3 sunColor = mix(
    vec3(1.0, 0.92, 0.7) * (1.0 + vocalPres * 0.3),   // warm sun
    vec3(0.3, 0.4, 0.7),                                  // cool moonlight
    pgMoonlight
  );

  // Beat snap sunlight flash
  sunColor *= 1.0 + beatSnp * 0.25 * (1.0 + climaxBoost * 0.3);

  // ─── SKY ───
  float skyGrad = smoothstep(-0.1, 0.8, rd.y);
  vec3 skyLow = mix(vec3(0.95, 0.75, 0.45), vec3(0.15, 0.1, 0.25), pgMoonlight);
  vec3 skyHigh = mix(vec3(0.45, 0.6, 0.9), vec3(0.03, 0.05, 0.15), pgMoonlight);
  skyLow = mix(skyLow, vec3(1.0, 0.6, 0.3), vocalPres * 0.2 * (1.0 - pgMoonlight));
  vec3 skyCol = mix(skyLow, skyHigh, skyGrad);

  // Sun disc
  float sunDot = max(0.0, dot(rd, sunDir));
  skyCol += sunColor * pow(sunDot, 32.0) * 0.5 * (1.0 - pgMoonlight);
  // Sun glow
  skyCol += sunColor * pow(sunDot, 4.0) * 0.15;

  // Cloud wisps
  float cloudN = fbm3(vec3(rd.xz * 3.0 + pgGardenTime * 0.03, rd.y * 2.0));
  float cloudMask = smoothstep(0.2, 0.7, rd.y);
  skyCol += vec3(1.0, 0.97, 0.9) * smoothstep(0.2, 0.5, cloudN) * cloudMask * 0.08 * (1.0 - pgMoonlight * 0.7);

  // Stars at night
  if (pgMoonlight > 0.3) {
    float starField = pow(pgHash21(floor(rd.xz * 200.0)), 20.0);
    float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + pgHash21(floor(rd.xz * 200.0)) * 100.0);
    skyCol += vec3(0.8, 0.85, 1.0) * starField * twinkle * pgMoonlight * 0.4;
  }

  // ─── RAYMARCH ───
  PgHitInfo htInfo = pgRaymarch(ro, rd);

  vec3 col = skyCol;

  if (htInfo.dist < MAX_DIST) {
    vec3 hitPos = ro + rd * htInfo.dist;
    vec3 n = pgNormal(hitPos);

    // ─── Material color ───
    vec3 matCol;
    if (htInfo.matId < 0.5) {
      // Ground: grass-like noise texture
      float grassN = fbm3(vec3(hitPos.xz * 3.0, pgGardenTime * 0.1));
      float grassDetail = snoise(vec3(hitPos.xz * 12.0, pgGardenTime * 0.2));
      matCol = mix(vec3(0.12, 0.35, 0.08), vec3(0.2, 0.5, 0.12), grassN * 0.5 + 0.5);
      matCol += vec3(0.05, 0.08, 0.02) * grassDetail;
      matCol = mix(matCol, vec3(0.05, 0.08, 0.12), pgMoonlight * 0.7);
      // Dynamic range: darker shadows in high dynamic range
      matCol *= mix(0.7, 1.0, 1.0 - dynRange * 0.3);
    } else if (htInfo.matId < 1.5) {
      matCol = stemCol;
    } else if (htInfo.matId < 2.5) {
      // Petals: blend based on cell seed
      matCol = mix(petalCol1, petalCol2, htInfo.cellSeed);
      // Energy saturation boost
      float petalLuma = dot(matCol, vec3(0.299, 0.587, 0.114));
      matCol = mix(vec3(petalLuma), matCol, sat);
    } else if (htInfo.matId < 3.5) {
      matCol = discCol;
    } else {
      matCol = leafCol;
    }

    // ─── Lighting ───
    float diff = max(0.0, dot(n, sunDir));
    float aoVal = pgAO(hitPos, n);

    // Soft shadow (skip for ground hits far away to save perf)
    float shadow = 1.0;
    if (htInfo.dist < 25.0) {
      shadow = pgSoftShadow(hitPos + n * 0.01, sunDir, 0.05, 8.0, 12.0);
    }

    // Dappled light: tree-canopy-like shadow pattern
    float dapple = snoise(vec3(hitPos.xz * 2.0 + pgGardenTime * vec2(0.02, 0.01), hitPos.y * 0.5));
    dapple = 0.7 + 0.3 * dapple;
    shadow *= dapple;

    // Half-Lambert for softer diffuse
    float halfLambert = diff * 0.5 + 0.5;
    halfLambert *= halfLambert;

    vec3 diffuseLight = sunColor * halfLambert * shadow;
    vec3 ambient = mix(
      vec3(0.08, 0.06, 0.04),   // warm ambient day
      vec3(0.03, 0.04, 0.08),   // cool ambient night
      pgMoonlight
    ) * aoVal;

    // Subsurface scattering for petals and leaves
    float sss = 0.0;
    if (htInfo.matId > 1.5 && htInfo.matId < 2.5) {
      // Petals: strong subsurface
      sss = pgSSS(hitPos, sunDir, -rd, n) * 1.5;
    } else if (htInfo.matId > 3.5) {
      // Leaves: medium subsurface
      sss = pgSSS(hitPos, sunDir, -rd, n) * 0.8;
    }
    vec3 sssColor = matCol * sunColor * sss;

    // Specular: Blinn-Phong
    vec3 halfVec = normalize(sunDir - rd);
    float spec = pow(max(0.0, dot(n, halfVec)), 32.0);
    // Petals get soft specular, disc gets harder
    float specMult = (htInfo.matId > 2.5 && htInfo.matId < 3.5) ? 0.4 : 0.15;
    specMult += highs * 0.1; // highs = shimmer
    vec3 specular = sunColor * spec * specMult;

    // Rim light (backlight through petals)
    float rim = pow(1.0 - max(0.0, dot(n, -rd)), 3.0);
    vec3 rimLight = sunColor * rim * 0.15 * (1.0 + energy * 0.3);

    // ─── Compose lighting ───
    col = matCol * (diffuseLight + ambient) + sssColor + specular + rimLight;

    // ─── Depth fog ───
    float fogDist = htInfo.dist;
    float fogAmount = 1.0 - exp(-fogDist * fogDist * 0.0008);
    fogAmount = clamp(fogAmount, 0.0, 1.0);
    vec3 fogCol = mix(skyCol, skyCol * 0.8, 0.5);
    col = mix(col, fogCol, fogAmount);
  }

  // ─── Volumetric pollen haze ───
  vec3 haze = pgVolHaze(ro, rd, htInfo.dist, energy, pgGardenTime);
  col += haze;

  // ─── Pollen / firefly particles ───
  col += pgPollenParticles(p, energy, uTime, drumOnset);

  // ─── Butterfly pairs ───
  col += pgButterflies(p, energy, uTime, drumOnset, petalCol1, petalCol2);

  // ─── Petal storm (climax) ───
  col += pgPetalStormParticles(p, pgPetalStorm, uTime, petalCol1, petalCol2);

  // ─── Beat snap flash ───
  col *= 1.0 + beatSnp * 0.15 * (1.0 + climaxBoost * 0.3);

  // ─── Climax color surge ───
  if (climaxBoost > 0.01) {
    col = mix(col, col * vec3(1.2, 1.1, 0.9), climaxBoost * 0.3);
  }

  // ─── SDF Icon Emergence ───
  {
    float nf = fbm3(vec3(p * 2.0, pgGardenTime));
    col += iconEmergence(p, uTime, energy, bass, petalCol1, petalCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, petalCol1, petalCol2, nf, uSectionIndex);
  }

  // ─── Post-processing ───
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
