/**
 * Crystalline Void — raymarched hexagonal/icosahedral crystals drifting through
 * a cool deep-space void. Bridge shader for Veneta routing: fills the gap
 * between high-energy neon shaders and contemplative geometric shaders.
 *
 * HIGH energy + COOL palette + GEOMETRIC aesthetic. Ice shards in deep space
 * with electric fractures crackling across sharp facets. Aurora-like edge glow,
 * sparse cool stars in the background, ambient rim light from above.
 *
 * Audio reactivity (17+ uniforms):
 *   uEnergy          -> master brightness + crystal count + facet sharpness
 *   uBass            -> crystal pulse + size breathing
 *   uHighs           -> electric fracture intensity + sparkle
 *   uMids            -> internal refraction glow
 *   uChromaHue       -> color shift within cool range (indigo→cyan→ice→silver)
 *   uBeatSnap        -> crystal flash on confident beats
 *   uOnsetSnap       -> fracture spawn / electric crackle
 *   uOnset           -> secondary fracture trigger
 *   uSectionType     -> jam=more crackling, space=still, chorus=brighter
 *   uTempo           -> rotation speed of crystal cluster
 *   uMelodicPitch    -> vertical drift
 *   uMelodicDirection-> horizontal drift
 *   uHarmonicTension -> fracture complexity
 *   uBeatStability   -> crystal form cohesion
 *   uClimaxPhase     -> triumphant silver-white surge
 *   uCoherence       -> crystal cluster coherence
 *   uVocalEnergy     -> aurora edge glow intensity
 *   uTimbralBrightness -> facet highlight sharpness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const crystallineVoidVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const crystallineVoidFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: false,
  caEnabled: true,
  lightLeakEnabled: false,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_CRYSTALS 7

// ---- Rotation matrices ----
mat3 cvRotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
}

mat3 cvRotX(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
}

mat3 cvRotZ(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
}

// ---- Hexagonal prism SDF (classic crystal shard) ----
float sdHexPrism(vec3 p, vec2 h) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
  vec2 d = vec2(
    length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x),
    p.z - h.y
  );
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ---- Octahedron SDF (icosahedral-ish crystal) ----
float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

// ---- Dodecahedral-ish icosahedron approximation ----
float sdIcosa(vec3 p, float r) {
  // Plane fold along icosahedral symmetry axes
  const float phi = 1.618034;
  vec3 n1 = normalize(vec3(0.0, phi, 1.0));
  vec3 n2 = normalize(vec3(phi, 1.0, 0.0));
  vec3 n3 = normalize(vec3(1.0, 0.0, phi));
  float d = 0.0;
  d = max(d, abs(dot(p, n1)));
  d = max(d, abs(dot(p, n2)));
  d = max(d, abs(dot(p, n3)));
  d = max(d, abs(dot(p, n1.yzx)));
  d = max(d, abs(dot(p, n2.yzx)));
  d = max(d, abs(dot(p, n3.yzx)));
  return d - r;
}

// ---- Crystal instance data ----
struct Crystal {
  vec3 pos;
  float size;
  int kind; // 0=hex, 1=octa, 2=icosa
  float rotA;
  float rotB;
};

Crystal cvGetCrystal(int idx, float time, float bass, float energy, float stability, float melodicPitch, float melodicDir) {
  Crystal c;
  float fi = float(idx);
  // Pseudo-random base positions
  float px = sin(fi * 12.9898 + 1.0) * 43758.5453;
  float py = sin(fi * 78.233 + 2.0) * 43758.5453;
  float pz = sin(fi * 45.164 + 3.0) * 43758.5453;
  px = fract(px) - 0.5;
  py = fract(py) - 0.5;
  pz = fract(pz) - 0.5;

  // Spread crystals across a volume
  float radius = 3.5 + fi * 0.3;
  float angle = fi * 1.37 + time * 0.06;
  c.pos = vec3(
    cos(angle) * radius + px * 1.5 + melodicDir * 0.8,
    py * 2.2 + sin(time * 0.12 + fi * 0.7) * 0.6 + melodicPitch * 1.2,
    sin(angle) * radius + pz * 1.5
  );

  // Size varies, bass pumps it
  float baseSize = 0.35 + fract(fi * 0.271) * 0.35;
  float breathe = 1.0 + bass * 0.18 * sin(time * 1.5 + fi * 2.1);
  breathe *= mix(0.85, 1.0, stability); // less stable = more size jitter
  c.size = baseSize * breathe * (0.9 + energy * 0.25);

  // Rotation — each crystal tumbles independently
  c.rotA = time * (0.25 + fract(fi * 0.383) * 0.4) + fi * 1.3;
  c.rotB = time * (0.18 + fract(fi * 0.591) * 0.35) + fi * 0.7;

  // Kind
  c.kind = int(mod(fi, 3.0));
  return c;
}

float cvCrystalSDF(vec3 p, Crystal c) {
  vec3 q = p - c.pos;
  q = cvRotY(c.rotA) * q;
  q = cvRotX(c.rotB) * q;
  if (c.kind == 0) {
    return sdHexPrism(q, vec2(c.size * 0.6, c.size));
  } else if (c.kind == 1) {
    return sdOctahedron(q, c.size);
  } else {
    return sdIcosa(q, c.size * 0.8);
  }
}

// ---- Scene SDF (union of all crystals) ----
float cvSceneSDF(vec3 p, float time, float bass, float energy, float stability,
                  float melodicPitch, float melodicDir, int count,
                  out int hitIdx) {
  float d = 1e6;
  hitIdx = -1;
  for (int i = 0; i < MAX_CRYSTALS; i++) {
    if (i >= count) break;
    Crystal c = cvGetCrystal(i, time, bass, energy, stability, melodicPitch, melodicDir);
    float cd = cvCrystalSDF(p, c);
    if (cd < d) {
      d = cd;
      hitIdx = i;
    }
  }
  return d;
}

// ---- Scene normal (gradient) ----
vec3 cvSceneNormal(vec3 p, float time, float bass, float energy, float stability,
                    float melodicPitch, float melodicDir, int count) {
  const float eps = 0.002;
  int dummy;
  vec2 e = vec2(eps, 0.0);
  float dx = cvSceneSDF(p + e.xyy, time, bass, energy, stability, melodicPitch, melodicDir, count, dummy) -
              cvSceneSDF(p - e.xyy, time, bass, energy, stability, melodicPitch, melodicDir, count, dummy);
  float dy = cvSceneSDF(p + e.yxy, time, bass, energy, stability, melodicPitch, melodicDir, count, dummy) -
              cvSceneSDF(p - e.yxy, time, bass, energy, stability, melodicPitch, melodicDir, count, dummy);
  float dz = cvSceneSDF(p + e.yyx, time, bass, energy, stability, melodicPitch, melodicDir, count, dummy) -
              cvSceneSDF(p - e.yyx, time, bass, energy, stability, melodicPitch, melodicDir, count, dummy);
  return normalize(vec3(dx, dy, dz));
}

// ---- Electric fracture lines on a facet ----
float cvFractureField(vec3 p, float time, float highs, float tension, float onset) {
  // Sharp ridged noise creates branching crack pattern
  vec3 q = p * 3.5;
  float crack = ridged4(q + vec3(time * 0.4, 0.0, time * 0.3));
  float crack2 = ridged4(q * 2.1 + vec3(0.0, time * 0.6, 0.0));
  crack = max(crack, crack2 * 0.8);

  // Complexity rises with tension
  crack += ridged4(q * 4.0 + vec3(time * 0.8, 0.0, 0.0)) * tension * 0.6;

  // Threshold — only the brightest ridges become lightning
  float threshold = mix(0.78, 0.58, highs);
  threshold -= onset * 0.12;
  return smoothstep(threshold, threshold + 0.06, crack);
}

// ---- Background star field (cool, sparse) ----
float cvStarField(vec3 rd, float seed) {
  vec3 cell = floor(rd * 80.0 + seed);
  vec3 fr = fract(rd * 80.0 + seed) - 0.5;
  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  float star = step(0.985, h);
  float dist = length(fr);
  return star * smoothstep(0.05, 0.005, dist) * h;
}

// ---- Aurora-like edge glow ----
vec3 cvAurora(vec2 p, float time, float vocal, vec3 tintA, vec3 tintB) {
  float y = p.y;
  float wave1 = sin(p.x * 2.0 + time * 0.3) * 0.3;
  float wave2 = sin(p.x * 3.7 + time * 0.45 + 1.0) * 0.2;
  float curtain = exp(-abs(y + 0.4 - wave1 - wave2) * 3.0);
  float shimmer = fbm(vec2(p.x * 4.0, time * 0.6)) * 0.5 + 0.5;
  vec3 col = mix(tintA, tintB, shimmer) * curtain * (0.3 + vocal * 0.7);
  // Second curtain up top
  float curtainTop = exp(-abs(y - 0.5 - wave1 * 0.5) * 4.0);
  col += mix(tintB, tintA, shimmer) * curtainTop * 0.15 * (0.3 + vocal * 0.4);
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ---- Audio clamping ----
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float onsetRaw = clamp(uOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.08; // cool palette — small hue movement
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float vocalGlow = clamp(uVocalEnergy, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float tempoNorm = clamp(uTempo / 180.0, 0.3, 1.5);
  float e2 = energy * energy;
  float slowTime = uDynamicTime * 0.01;

  // ---- Section modulation ----
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sectionRotMul = mix(1.0, 1.4, sJam) * mix(1.0, 0.08, sSpace);
  float sectionBright = mix(1.0, 1.05, sJam) * mix(1.0, 0.72, sSpace) * mix(1.0, 1.28, sChorus) * mix(1.0, 1.12, sSolo);
  float sectionFracture = mix(1.0, 1.6, sJam) * mix(1.0, 0.25, sSpace) * mix(1.0, 1.15, sChorus);

  // ---- Climax ----
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ---- Cool palette: deep indigo → cyan → ice blue → silver-white ----
  // Hue range stays in cool zone: 0.50 (cyan) → 0.72 (indigo)
  float baseHueIndigo = 0.68 + chromaHueMod * 0.5;
  float baseHueCyan = 0.52 + chromaHueMod;
  float baseHueIce = 0.58 + chromaHueMod * 0.3;
  float sat = mix(0.35, 0.85, e2) * uPaletteSaturation;
  // Climax shifts toward silver-white (low saturation)
  sat *= mix(1.0, 0.25, climaxBoost);

  vec3 deepIndigo = hsv2rgb(vec3(baseHueIndigo, sat * 1.0, 0.35));
  vec3 brightCyan = hsv2rgb(vec3(baseHueCyan, sat * 0.95, 0.85));
  vec3 iceBlue    = hsv2rgb(vec3(baseHueIce, sat * 0.5, 0.95));
  vec3 silverWhite = vec3(0.92, 0.96, 1.0);
  vec3 electricWhite = vec3(1.0, 1.0, 1.05);

  // ---- Camera ----
  float clusterSpin = slowTime * sectionRotMul * tempoNorm;
  float camOrbit = clusterSpin * 0.6;
  vec3 rayOrig = vec3(
    sin(camOrbit * 0.4) * 2.0,
    melodicPitch * 1.0 - 0.3 + sin(slowTime * 0.2) * 0.4,
    cos(camOrbit * 0.4) * 2.0 - 7.5
  );
  vec3 camLookAt = vec3(sin(slowTime * 0.1) * 0.4, 0.0, 0.0);
  vec3 camFwd = normalize(camLookAt - rayOrig);
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camVert = cross(camSide, camFwd);
  float fovScale = tan(radians(52.0) * 0.5);
  vec3 rayDir = normalize(camFwd + camSide * screenP.x * fovScale + camVert * screenP.y * fovScale);

  // ---- Background: dark cool void ----
  vec3 col = vec3(0.002, 0.004, 0.010);
  // Subtle gradient top → bottom (slightly lighter above)
  col += mix(vec3(0.0), vec3(0.004, 0.008, 0.018), smoothstep(-0.5, 0.6, screenP.y));

  // ---- Background stars (sparse, cool) ----
  float stars = cvStarField(rayDir, 0.0);
  float stars2 = cvStarField(rayDir * 1.3, 17.3) * 0.6;
  col += mix(iceBlue, silverWhite, 0.6) * (stars + stars2) * (0.5 + highs * 0.4);

  // ---- Aurora-like edge glow ----
  vec3 aurora = cvAurora(screenP, uDynamicTime * 0.3, vocalGlow, brightCyan, deepIndigo);
  col += aurora * (0.35 + sChorus * 0.2);

  // ---- Crystal count varies with energy ----
  int crystalCount = int(mix(4.0, float(MAX_CRYSTALS), energy));

  // ---- Raymarch the crystal cluster ----
  float t = 0.0;
  float maxDist = 20.0;
  int marchSteps = 72;
  int hitIdx = -1;
  bool hit = false;
  vec3 hitP;

  for (int i = 0; i < 72; i++) {
    if (i >= marchSteps) break;
    vec3 p = rayOrig + rayDir * t;
    int curIdx;
    float d = cvSceneSDF(p, clusterSpin, bass, energy, stability, melodicPitch, melodicDir, crystalCount, curIdx);
    if (d < 0.002) {
      hit = true;
      hitIdx = curIdx;
      hitP = p;
      break;
    }
    if (t > maxDist) break;
    t += max(d * 0.85, 0.01);
  }

  if (hit) {
    vec3 n = cvSceneNormal(hitP, clusterSpin, bass, energy, stability, melodicPitch, melodicDir, crystalCount);

    // Key light from above
    vec3 keyDir = normalize(vec3(0.2, 0.85, 0.4));
    float keyDot = max(0.0, dot(n, keyDir));
    float keyHard = pow(keyDot, mix(3.0, 12.0, timbralBright));

    // Fill from below (cool indigo reflected)
    vec3 fillDir = normalize(vec3(-0.3, -0.6, 0.2));
    float fillDot = max(0.0, dot(n, fillDir));

    // Rim light (fresnel on view direction)
    float fresnel = pow(1.0 - max(0.0, dot(-rayDir, n)), 3.5);

    // Facet color — each crystal slightly different hue within cool range
    float fiHit = float(hitIdx);
    float hueShift = fract(fiHit * 0.157) * 0.06;
    vec3 facetBase = hsv2rgb(vec3(baseHueIce + hueShift, sat * 0.6, 0.85));
    vec3 facetDark = hsv2rgb(vec3(baseHueIndigo + hueShift, sat * 0.9, 0.3));

    // Base shading
    vec3 crystalCol = mix(facetDark, facetBase, keyDot * 0.6 + 0.1);

    // Key highlight (hard specular — silver-white)
    crystalCol += silverWhite * keyHard * (0.6 + timbralBright * 0.5);

    // Fill light
    crystalCol += brightCyan * fillDot * 0.15;

    // Rim / fresnel — bright cyan edge glow
    crystalCol += brightCyan * fresnel * (0.55 + mids * 0.4 + vocalGlow * 0.3);

    // ---- Internal refraction glow (mids-driven) ----
    // Sample a point slightly inside the crystal using refracted direction
    vec3 refractDir = refract(rayDir, n, 0.75);
    float internalNoise = fbm3(hitP * 2.0 + refractDir * 0.3 + vec3(slowTime, 0.0, 0.0));
    vec3 internalGlow = mix(deepIndigo, brightCyan, internalNoise);
    crystalCol += internalGlow * (0.1 + mids * 0.35) * (1.0 - fresnel * 0.5);

    // ---- Electric fracture lines (white-hot) ----
    float fractureAmt = cvFractureField(hitP, clusterSpin, highs, tension, onset);
    fractureAmt *= sectionFracture;
    // Fractures pulse with beat + onset
    fractureAmt *= 0.6 + 0.4 * sin(uTime * 8.0 + fiHit * 3.0) * 0.5 + 0.5;
    fractureAmt *= 0.8 + onset * 0.6 + onsetRaw * 0.3;
    // White-hot color
    vec3 fractureCol = mix(electricWhite, brightCyan, 0.3);
    crystalCol += fractureCol * fractureAmt * (0.9 + highs * 1.2) * (1.0 + climaxBoost * 0.8);

    // ---- Beat flash: whole crystal briefly brightens on confident beat ----
    float beatFlash = effectiveBeat * (0.25 + bass * 0.4);
    crystalCol *= 1.0 + beatFlash;
    crystalCol += silverWhite * beatFlash * 0.15;

    // Section brightness
    crystalCol *= sectionBright;

    // Climax silver surge
    crystalCol = mix(crystalCol, crystalCol * silverWhite * 1.8, climaxBoost * 0.5);

    // Depth fade — distant crystals cool and dim
    float distFade = exp(-t * 0.08);
    crystalCol = mix(deepIndigo * 0.3, crystalCol, distFade);

    col = crystalCol;
  } else {
    // ---- No hit: atmospheric void + distant glow from cluster ----
    // Volumetric haze near the cluster center (cool fog)
    float hazeT = 7.0;
    vec3 hazeP = rayOrig + rayDir * hazeT;
    float hazeDist = length(hazeP);
    float haze = exp(-hazeDist * 0.12) * 0.4;
    col += mix(deepIndigo, brightCyan, 0.4) * haze * (0.2 + energy * 0.3);

    // Distant beat flash reflection on void
    col += deepIndigo * 0.08 * effectiveBeat;
  }

  // ---- Coherence warp on whole frame ----
  // Low coherence adds subtle chromatic wobble (stays within cool hues)
  if (coherence < 0.4) {
    float wobble = (0.4 - coherence) * 2.5;
    float n1 = snoise(vec3(screenP * 3.0, uDynamicTime * 0.4)) * 0.5 + 0.5;
    col = mix(col, col * mix(vec3(0.85, 0.95, 1.1), vec3(1.0, 1.05, 1.1), n1), wobble * 0.25);
  }

  // ---- Climax boost ----
  col *= 1.0 + climaxBoost * 0.45;

  // ---- Sparkle dust (highs) — tiny cool pinpricks across void ----
  {
    float sparkNoise = snoise(vec3(screenP * 30.0, uTime * 2.0));
    float spark = smoothstep(0.88, 0.96, sparkNoise) * highs * 0.6 * e2;
    col += silverWhite * spark;
  }

  // ---- SDF icon emergence ----
  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 c1 = brightCyan;
    vec3 c2 = iceBlue;
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.4;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ---- Atmospheric depth fog (cool) ----
  float fogNoise_ad = fbm3(vec3(screenP * 0.6, uDynamicTime * 0.015));
  float fogDensity_ad = mix(0.25, 0.02, energy);
  vec3 fogColor_ad = vec3(0.003, 0.006, 0.015);
  col = mix(col, fogColor_ad, fogDensity_ad * (0.4 + fogNoise_ad * 0.6));

  // ---- Vignette (cool, not black) ----
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.002, 0.004, 0.012), col, vignette);

  // ---- Post-processing ----
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
