/**
 * Combustible Voronoi — ported from Shane (Shadertoy)
 * Source: https://www.shadertoy.com/view/4tlSzl
 * License: CC BY-NC-SA 3.0
 *
 * Animated 3D Voronoi cells with a fire/lava color palette.
 * Multiple Voronoi layers at different scales, edge glow where cells meet,
 * second-derivative edge detection for bright seams. Classic fire gradient.
 *
 * Audio reactivity:
 *   uEnergy          → cell animation speed, fire intensity
 *   uBass            → cell scale / magma pressure
 *   uOnsetSnap       → fire eruption (brightness burst + cell scatter)
 *   uHighs           → edge glow intensity (hot seams)
 *   uBeatSnap        → pulsing cell brightness
 *   uStemDrumOnset   → explosion effect (cells scatter outward)
 *   uClimaxIntensity → full inferno mode
 *   uSpectralFlux    → palette cycling speed
 *   uSlowEnergy      → ember drift speed
 *   uTimbralBrightness → white-hot core intensity
 *   uDynamicRange    → contrast between fire and dark
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const combustibleVoronoiVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  caEnabled: true,
  thermalShimmerEnabled: true,
  lightLeakEnabled: true,
  lensDistortionEnabled: true,
});

export const combustibleVoronoiFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Combustible Voronoi core (Shane) ───
// https://www.shadertoy.com/view/4tlSzl — CC BY-NC-SA 3.0

// 2D hash for Voronoi cell centers — must not collide with noise.ts
vec2 _cv_hash22(vec2 p) {
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(262144.0, 32768.0) * n) * 0.75 + 0.125;
}

// Smooth 2D hash for continuous variation
float _cv_hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 2x2 rotation matrix
mat2 _cv_rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

// ─── 2D Voronoi with edge detection ───
// Returns vec3(minDist, edgeDist, cellID)
// edgeDist = second_min - min (bright where cells meet)
vec3 _cv_voronoi(vec2 p, float animSpeed, float scatter) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);

  float d1 = 8.0;  // closest distance
  float d2 = 8.0;  // second closest
  vec2 closestId = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = ip + neighbor;
      vec2 cellCenter = _cv_hash22(cellId);

      // Animate cell centers with sin/cos — the Shane signature
      cellCenter = 0.5 + 0.45 * sin(animSpeed * TAU * cellCenter + scatter);

      vec2 diff = neighbor + cellCenter - fp;
      float dist = dot(diff, diff); // squared distance for speed

      if (dist < d1) {
        d2 = d1;
        d1 = dist;
        closestId = cellId;
      } else if (dist < d2) {
        d2 = dist;
      }
    }
  }

  d1 = sqrt(d1);
  d2 = sqrt(d2);

  return vec3(d1, d2 - d1, _cv_hash21(closestId));
}

// ─── Fire color palette ───
// Maps a 0-1 temperature value to dark red → orange → yellow → white
vec3 _cv_fireGradient(float t, vec3 palCol1, vec3 palCol2, float paletteBlend) {
  // Classic fire: black → dark red → orange → yellow → white hot
  vec3 c1 = vec3(0.02, 0.0, 0.0);      // black/dark
  vec3 c2 = vec3(0.6, 0.05, 0.0);      // deep red
  vec3 c3 = vec3(1.0, 0.35, 0.0);      // orange
  vec3 c4 = vec3(1.0, 0.75, 0.2);      // yellow
  vec3 c5 = vec3(1.0, 0.95, 0.8);      // white hot

  vec3 fire;
  if (t < 0.25) {
    fire = mix(c1, c2, t * 4.0);
  } else if (t < 0.5) {
    fire = mix(c2, c3, (t - 0.25) * 4.0);
  } else if (t < 0.75) {
    fire = mix(c3, c4, (t - 0.5) * 4.0);
  } else {
    fire = mix(c4, c5, (t - 0.75) * 4.0);
  }

  // Blend toward song palette — tints the fire without destroying it
  vec3 palTint = mix(palCol1, palCol2, t);
  fire = mix(fire, fire * palTint * 2.0, paletteBlend);

  return fire;
}

// ─── Layered Voronoi fire ───
// Multiple Voronoi layers at different scales for turbulent fire
float _cv_layeredFire(vec2 p, float time, float animSpeed, float scatter,
                      float bassScale, out float edgeGlow, out float cellId) {
  float fire = 0.0;
  edgeGlow = 0.0;
  cellId = 0.0;

  float amplitude = 1.0;
  float totalAmp = 0.0;
  float scale = 1.0;

  // 4 octaves of Voronoi at increasing scales
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 sp = p * (3.0 + fi * 2.5) * scale * bassScale;

    // Offset each layer slightly in time for parallax
    sp += vec2(time * (0.3 + fi * 0.15), time * (0.1 - fi * 0.08));

    // Domain rotation between layers
    sp *= _cv_rot2(fi * 0.5 + time * 0.05);

    vec3 v = _cv_voronoi(sp, animSpeed + fi * 0.1, scatter);

    // Distance-based fire density (inverted: closer to cell center = hotter)
    float layerFire = 1.0 - smoothstep(0.0, 0.45, v.x);

    // Edge glow: bright seams where cells meet
    float layerEdge = smoothstep(0.08, 0.0, v.y);

    fire += layerFire * amplitude;
    edgeGlow += layerEdge * amplitude * 1.5;

    // Use lowest octave cell ID for stable color variation
    if (i == 0) cellId = v.z;

    totalAmp += amplitude;
    amplitude *= 0.5;
    scale *= 1.1;
  }

  fire /= totalAmp;
  edgeGlow /= totalAmp;

  return fire;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio inputs ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float beat = clamp(uBeatSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumHit = clamp(uStemDrumOnset, 0.0, 1.0);
  float spectralFlux = clamp(uSpectralFlux, 0.0, 1.0);
  float tBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float effectiveBeat = beat * smoothstep(0.3, 0.7, uBeatConfidence);

  // ─── Palette ───
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1;
  hue1 += chromaHueMod + chordHue;
  hue2 += chromaHueMod * 0.5;

  vec3 palCol1 = paletteHueColor(hue1, 0.85, 0.95);
  vec3 palCol2 = paletteHueColor(hue2, 0.85, 0.95);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam: faster, denser cells, brighter. Space: slow drift, dim embers. Chorus: vibrant blaze. Solo: dramatic eruptions.
  float sectionSpeed = mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.2, sChorus) * mix(1.0, 1.3, sSolo);
  float sectionIntensity = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.3, sChorus);
  float sectionScale = mix(1.0, 0.85, sJam) * mix(1.0, 1.3, sSpace); // jam=smaller cells (denser), space=larger
  sectionSpeed *= 1.0 + uPeakApproaching * 0.3;

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // ─── Time / animation ───
  float timeBase = uDynamicTime * 0.08;
  float animSpeed = (0.4 + energy * 0.6 + slowE * 0.3) * sectionSpeed;
  float time = timeBase * animSpeed;

  // ─── Domain warping: organic fire turbulence ───
  float energyFreq = 1.0 + energy * 0.5;
  vec2 warpedP = p;
  warpedP += vec2(
    fbm3(vec3(p * 0.8 * energyFreq, uDynamicTime * 0.04)),
    fbm3(vec3(p * 0.8 * energyFreq + 77.0, uDynamicTime * 0.04))
  ) * (0.15 + bass * 0.12);

  // Drum hit: scatter cells by displacing the domain
  warpedP += drumHit * 0.15 * vec2(
    sin(uDynamicTime * 8.0 + p.y * 5.0),
    cos(uDynamicTime * 8.0 + p.x * 5.0)
  );

  // Onset eruption: radial burst from center
  float onsetBurst = onset * 0.12;
  vec2 radial = normalize(warpedP + 0.001) * onsetBurst;
  warpedP += radial;

  // ─── Compute layered Voronoi fire ───
  float bassScale = mix(1.0, 0.75, bass) * sectionScale;
  float scatter = uDynamicTime * 0.3 + spectralFlux * 2.0; // flux cycles the cell animation
  float edgeGlow, cellId;
  float fire = _cv_layeredFire(warpedP, time, animSpeed * 0.3, scatter, bassScale, edgeGlow, cellId);

  // Onset: intensify fire
  fire = fire + onset * 0.35;
  fire = clamp(fire, 0.0, 1.0);

  // ─── Fire color mapping ───
  float paletteBlend = 0.2 + energy * 0.1;
  float paletteCycle = spectralFlux * 0.3 + uDynamicTime * 0.01;
  vec3 col = _cv_fireGradient(fire, palCol1, palCol2, paletteBlend);

  // ─── Edge glow: bright hot seams ───
  float edgeIntensity = edgeGlow * (0.6 + highs * 1.2) * sectionIntensity;
  vec3 edgeColor = _cv_fireGradient(0.85 + highs * 0.15, palCol1, palCol2, paletteBlend * 0.5);
  col += edgeColor * edgeIntensity;

  // ─── White-hot core from timbral brightness ───
  float hotCore = fire * fire * fire * tBright * 0.4;
  col += vec3(1.0, 0.95, 0.85) * hotCore;

  // ─── Secondary fire layer: deeper, slower, bigger cells ───
  float edgeGlow2, cellId2;
  vec2 deepP = warpedP * 0.4 + vec2(time * 0.15, -time * 0.08);
  float deepFire = _cv_layeredFire(deepP, time * 0.5, animSpeed * 0.15, scatter * 0.7, 1.2, edgeGlow2, cellId2);
  vec3 deepColor = _cv_fireGradient(deepFire * 0.7, palCol2, palCol1, paletteBlend);
  col += deepColor * 0.25 * sectionIntensity;

  // ─── Ember particles drifting upward ───
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float seed = fi * 11.37 + 3.14;
    vec2 emberPos = vec2(
      sin(seed * 7.0 + uDynamicTime * 0.2) * 0.6,
      fract(seed * 0.31 + uDynamicTime * (0.04 + energy * 0.30)) * 2.5 - 1.0
    );
    // Embers drift with wind
    emberPos.x += sin(uDynamicTime * 0.5 + fi) * 0.15 * slowE;

    float dist = length(p - emberPos);
    float size = 0.004 + highs * 0.003;
    float ember = smoothstep(size, size * 0.2, dist);
    float flicker = 0.4 + 0.6 * sin(uDynamicTime * (5.0 + fi * 2.0) + seed);
    float emberTemp = 0.6 + _cv_hash21(vec2(fi, 0.0)) * 0.4;
    col += _cv_fireGradient(emberTemp, palCol1, palCol2, 0.15) * ember * flicker * energy * 0.5;
  }

  // ─── Beat pulse: brightness swell ───
  col *= 1.0 + effectiveBeat * 0.2 * (1.0 + climaxBoost * 0.4);

  // ─── Onset flash: brief white-hot burst ───
  col += vec3(1.0, 0.9, 0.7) * onset * 0.12 * energy;

  // ─── Drum explosion: radial brightness ───
  float explDist = length(p);
  float explosion = drumHit * smoothstep(0.6, 0.0, explDist) * 0.25;
  col += _cv_fireGradient(0.9, palCol1, palCol2, 0.1) * explosion;

  // ─── Climax: full inferno — everything burns ───
  col *= 1.0 + climaxBoost * 0.6;
  col += vec3(0.15, 0.06, 0.02) * climaxBoost * fire;

  // ─── Vocal presence: warm amber glow ───
  float vocalWarmth = clamp(uVocalPresence, 0.0, 1.0) * clamp(uVocalEnergy, 0.0, 1.0);
  col += palCol1 * vocalWarmth * 0.06 * fire;

  // ─── Dynamic range → fire contrast ───
  float fireContrast = mix(0.8, 1.3, dynRange);
  vec3 luma = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
  col = mix(luma, col, fireContrast);

  // ─── Chroma hue modulation ───
  if (abs(uChromaHue) > 0.01) {
    vec3 hsvCol = rgb2hsv(col);
    hsvCol.x = fract(hsvCol.x + uChromaHue * 0.08);
    col = hsv2rgb(hsvCol);
  }

  // ─── Semantic modulation ───
  col *= 1.0 + uSemanticAggressive * 0.2;
  col *= 1.0 + uSemanticChaotic * 0.1;

  // ─── Dead iconography ───
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);

  // ─── Vignette: fire fades at edges ───
  float vigScale = mix(0.38, 0.26, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 0.8, vignette);
  vec3 vigTint = palCol1 * 0.02;
  col = mix(vigTint, col, vignette);

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
