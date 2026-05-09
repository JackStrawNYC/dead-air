/**
 * Mercury Pools — raymarched 3D liquid-as-solid metaball geometry.
 *
 * Audit gap: "Water/Liquid Geometry — We have ocean caustics, but no
 * shader where liquid IS solid geometry. Mercury pools, oil slicks,
 * honey flows with proper surface tension and refraction."
 *
 * This is that shader. 5 metaball SDFs blended via smin (smooth-min)
 * to create floating, merging, separating mercury blobs against a
 * dark cosmic backdrop. Reflective material with environment-fake
 * reflections (analytic sky), refractive caustic highlights, surface
 * ripples.
 *
 * Audio reactivity:
 *   uBass             → blobs converge / merge on bass hits
 *   uDrumOnset        → blob fission (splits apart on percussion)
 *   uEnergy           → animation speed, ripple amplitude
 *   uHarmonicTension  → surface viscosity (smin smoothness)
 *   uVocalPresence    → blob glow / inner luminescence
 *   uChordIndex       → palette tint (mercury silver → copper → gold)
 *   uBeatSnap         → surface ripple pulse on beat
 *   uShaderHoldProgress → camera arc — pulls back over the song
 *   uChromaHue        → environment hue (sky behind blobs)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const mercuryPoolsVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.04,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
  halationEnabled: true,
  grainStrength: "normal",
  lightLeakEnabled: false,
  lensDistortionEnabled: false,
  beatPulseEnabled: false,
});
const mpNormal = buildRaymarchNormal("mpMap($P, mt, bass, viscosity)", { eps: 0.002, name: "mpCalcNormal" });
const mpDepthAlpha = buildDepthAlphaOutput("td", "12.0");

export const mercuryPoolsFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;
#define TAU 6.28318530

// Smooth-min — the canonical metaball blend
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sphereSDF(vec3 p, vec3 c, float r) {
  return length(p - c) - r;
}

// Blob orbit — 5 mercury balls in a slow drifting pattern
vec3 blobCenter(int i, float t, float bass, float drumOn) {
  float fi = float(i);
  float a = fi * 1.2566 + t * 0.15; // 2*pi/5 spacing
  float r = 1.4 + sin(t * 0.3 + fi * 1.7) * 0.3 - bass * 0.4;
  // Bass pulls blobs toward origin (merging); drum onset pushes them out (fission)
  float radial = r + drumOn * 0.5;
  return vec3(
    cos(a) * radial,
    sin(t * 0.4 + fi * 0.9) * 0.5,
    sin(a) * radial + sin(t * 0.2 + fi) * 0.4
  );
}

float mpMap(vec3 p, float mt, float bass, float viscosity) {
  // Smooth-min blend factor — viscosity controls how "fused" the blobs feel
  float k = 0.6 + viscosity * 0.5;

  // 5 mercury blobs
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  vec3 c0 = blobCenter(0, mt, bass, drumOn);
  vec3 c1 = blobCenter(1, mt, bass, drumOn);
  vec3 c2 = blobCenter(2, mt, bass, drumOn);
  vec3 c3 = blobCenter(3, mt, bass, drumOn);
  vec3 c4 = blobCenter(4, mt, bass, drumOn);

  // Per-blob radius — slight variance + bass-driven swell
  float r0 = 0.55 + bass * 0.10 + sin(mt * 1.1) * 0.05;
  float r1 = 0.50 + bass * 0.08 + sin(mt * 1.3 + 0.7) * 0.05;
  float r2 = 0.60 + bass * 0.12 + sin(mt * 0.9 + 1.4) * 0.06;
  float r3 = 0.48 + bass * 0.07 + sin(mt * 1.4 + 2.1) * 0.04;
  float r4 = 0.55 + bass * 0.10 + sin(mt * 1.0 + 2.8) * 0.05;

  float d = sphereSDF(p, c0, r0);
  d = smin(d, sphereSDF(p, c1, r1), k);
  d = smin(d, sphereSDF(p, c2, r2), k);
  d = smin(d, sphereSDF(p, c3, r3), k);
  d = smin(d, sphereSDF(p, c4, r4), k);

  // Surface ripples — high-freq noise displacement on top of SDF
  // Beat-synced: ripple amplitude pulses on uBeatSnap
  float beatRipple = clamp(uBeatSnap, 0.0, 1.0);
  float ripple = (snoise(p * 4.0 + vec3(mt * 0.6)) * 0.5 + 0.5)
              * (0.02 + beatRipple * 0.04);
  d -= ripple;

  return d;
}

${mpNormal}

// Analytic environment — fake sky for reflections
vec3 sampleEnv(vec3 dir, float chromaHue) {
  // Vertical gradient: dark cosmic blue at horizon, warmer at zenith
  float vert = dir.y * 0.5 + 0.5;
  vec3 horizon = vec3(0.04, 0.06, 0.10);
  vec3 zenith = vec3(0.14, 0.10, 0.18);
  vec3 base = mix(horizon, zenith, vert);
  // Chromahue tint — environment shifts subtly with chord
  vec3 tint = paletteHueColor(chromaHue, 0.4, 0.5);
  base = mix(base, base * tint, 0.3);
  // A few "stars" — high-freq noise, sparse
  float stars = step(0.985, snoise(dir * 60.0) * 0.5 + 0.5);
  return base + vec3(0.7, 0.7, 0.85) * stars * 0.5;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // Audio uniforms
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float harmT = clamp(uHarmonicTension, 0.0, 1.0);
  float beatS = clamp(uBeatSnap, 0.0, 1.0);
  float centroid = clamp(uCentroid, 0.0, 1.0);
  int chordIdx = int(uChordIndex);
  float chromaHue = uChromaHue;

  // Time evolution
  float mt = uDynamicTime * (0.05 + slowE * 0.10);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);

  // Camera — pulls back slowly over the song hold
  float camDist = 4.5 + holdP * 0.8;
  float camOrbit = mt * 0.08;
  vec3 ro = vec3(
    sin(camOrbit) * camDist,
    0.6 + sin(mt * 0.2) * 0.15,
    cos(camOrbit) * camDist
  );
  vec3 lookAt = vec3(0.0, 0.0, 0.0);
  vec3 fw = normalize(lookAt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, ri);
  float fov = 0.92;
  vec3 rd = normalize(p.x * ri + p.y * up + fov * fw);

  // Raymarch
  float td = 0.0;
  vec3 hp = ro;
  bool hit = false;
  for (int i = 0; i < 96; i++) {
    vec3 ps = ro + rd * td;
    float d = mpMap(ps, mt, bass, harmT);
    if (d < 0.003) { hp = ps; hit = true; break; }
    if (td > 12.0) break;
    td += d * 0.85;
  }

  // ─── Palette ───
  // Mercury silver baseline — warm copper at chord index 4-7, cool blue at 8-11
  vec3 mercurySilver = vec3(0.78, 0.80, 0.82);
  vec3 mercuryCopper = vec3(0.85, 0.55, 0.30);
  vec3 mercuryGold = vec3(0.95, 0.78, 0.35);
  vec3 mercuryBlue = vec3(0.45, 0.55, 0.78);
  vec3 baseTint;
  float chordWarm = sin(float(chordIdx) * 0.523 + 1.5) * 0.5 + 0.5;
  if (float(chordIdx) < 4.0) baseTint = mix(mercurySilver, mercuryBlue, chordWarm);
  else if (float(chordIdx) < 8.0) baseTint = mix(mercurySilver, mercuryCopper, chordWarm);
  else baseTint = mix(mercurySilver, mercuryGold, chordWarm);

  vec3 col;
  if (hit) {
    vec3 n = mpCalcNormal(hp);

    // ─── Reflection ───
    // Mercury is highly reflective — sample environment along reflected ray
    vec3 reflDir = reflect(rd, n);
    vec3 envColor = sampleEnv(reflDir, chromaHue);

    // Inner luminescence (vocal-driven warm glow from beneath the surface)
    float innerGlow = vocalP * 0.4;

    // Fresnel — edges reflect more than centers
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.5);

    // Direct light — single sun-like key
    vec3 keyDir = normalize(vec3(0.4, 0.8, 0.3));
    float diff = max(dot(n, keyDir), 0.0);
    float spec = pow(max(dot(reflect(-keyDir, n), -rd), 0.0), 64.0);

    // Caustic refraction hint — brighter spots where the surface curls
    // Approximate via gradient magnitude (high curvature = caustic line)
    vec3 nx = mpCalcNormal(hp + vec3(0.05, 0.0, 0.0));
    vec3 ny = mpCalcNormal(hp + vec3(0.0, 0.05, 0.0));
    float curvature = length(nx - n) + length(ny - n);
    float caustic = pow(curvature * 8.0, 2.0);

    // Compose mercury color
    col = baseTint * (0.15 + diff * 0.3);                    // dim base
    col = mix(col, envColor, fresnel * 0.85);                 // reflection-heavy edges
    col += vec3(1.0, 0.95, 0.85) * spec * 0.6 * (0.5 + centroid * 0.5);  // hot specular
    col += baseTint * caustic * 0.4;                          // caustic-ish bright lines
    col += baseTint * innerGlow;                              // vocal glow

    // Beat-synced surface flash
    col *= 1.0 + beatS * 0.15;

    // Energy-driven brightness
    col *= 0.7 + energy * 0.5;

  } else {
    // Sky/miss — environment color
    col = sampleEnv(rd, chromaHue);
  }

  // Distance fog (subtle)
  float depthFade = clamp(td / 12.0, 0.0, 1.0);
  col = mix(col, sampleEnv(rd, chromaHue) * 0.6, depthFade * depthFade * 0.3);

  // Warm shadow floor
  col = max(col, vec3(0.012, 0.014, 0.022));

  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${mpDepthAlpha}
}
`;
