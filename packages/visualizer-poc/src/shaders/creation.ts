/**
 * Creation — ported from Silexars (Shadertoy)
 * Source: https://www.shadertoy.com/view/XsXXDn — MIT/CC
 *
 * The quintessential psychedelic shader: iterative trigonometric domain warping
 * produces mesmerizing, ever-morphing prismatic color fields. Each RGB channel
 * is computed with a slight phase offset, creating chromatic separation that
 * intensifies with energy. Multiple layered passes at different scales add depth.
 *
 * Audio reactivity:
 *   uEnergy           -> overall speed, brightness, iteration richness
 *   uBass             -> coordinate warping amplitude (spatial distortion)
 *   uOnsetSnap        -> radial burst (rings expand outward)
 *   uBeatSnap         -> scale pulse
 *   uSlowEnergy       -> channel phase separation (more = more prismatic)
 *   uHighs            -> ring frequency / fine detail
 *   uMelodicPitch     -> dominant color temperature shift
 *   uHarmonicTension  -> distortion intensity in the domain warp
 *   uClimaxIntensity  -> full prismatic explosion
 *   uSpectralFlux     -> flow speed variation
 *   uTimbralBrightness-> glow intensity modulation
 *   uDynamicRange     -> contrast between bright rings and dark voids
 *   uSpaceScore       -> ethereal drift factor
 *   uSectionType      -> section-type modulation (jam/space/chorus/solo)
 *   uPalettePrimary/Secondary -> base color tinting
 *   uChromaHue        -> harmonic hue modulation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const creationVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  bloomThresholdOffset: -0.1,
  halationEnabled: true,
  caEnabled: true,
  lensDistortionEnabled: true,
  paletteCycleEnabled: true,
});

export const creationFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Core Creation algorithm (Silexars) ───
// Single-channel evaluation: returns brightness for one color channel.
// The magic: uv distortion via sin/length creates concentric ring interference.
float _cr_creation(vec2 uv, float z) {
  float l = length(uv);
  uv += uv / max(l, 0.001) * (sin(z) + 1.0) * abs(sin(l * 9.0 - z - z));
  return 0.01 / length(mod(uv, 1.0) - 0.5);
}

// Extended pass with variable ring frequency and warp intensity.
float _cr_creationEx(vec2 uv, float z, float freq, float warpAmt) {
  float l = length(uv);
  float warp = (sin(z) + 1.0) * abs(sin(l * freq - z - z));
  uv += uv / max(l, 0.001) * warp * warpAmt;
  return 0.01 / length(mod(uv, 1.0) - 0.5);
}

// Radial burst: onset-driven ring expansion
float _cr_radialBurst(vec2 p, float onset, float time) {
  float r = length(p);
  float wave = sin(r * 20.0 - time * 8.0) * 0.5 + 0.5;
  wave *= exp(-r * 3.0);
  return wave * onset;
}

// Volumetric glow accumulation from multiple ring evaluations
vec3 _cr_glowAccum(vec2 uv, float z, float freq, int passes) {
  vec3 glow = vec3(0.0);
  float step = 0.15;
  for (int i = 0; i < 4; i++) {
    if (i >= passes) break;
    float d = float(i) * step;
    float val = _cr_creationEx(uv, z + d, freq, 0.6);
    glow += val * exp(-d * 3.0) * vec3(0.3, 0.5, 0.7);
  }
  return glow * 0.15;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Clamp audio inputs ───
  float energy    = clamp(uEnergy, 0.0, 1.0);
  float bass      = clamp(uBass, 0.0, 1.0);
  float highs     = clamp(uHighs, 0.0, 1.0);
  float onset     = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap  = clamp(uBeatSnap, 0.0, 1.0);
  float slowE     = clamp(uSlowEnergy, 0.0, 1.0);
  float tension   = clamp(uHarmonicTension, 0.0, 1.0);
  float flux      = clamp(uSpectralFlux, 0.0, 1.0);
  float dynRange  = clamp(uDynamicRange, 0.0, 1.0);
  float brightness = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float melPitch  = clamp(uMelodicPitch, 0.0, 1.0);
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  // ─── Section-type modulation ───
  // 0=intro, 1=verse, 2=chorus, 3=bridge, 4=solo, 5=jam, 6=outro, 7=space
  float sectionT  = uSectionType;
  float jamFactor   = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float spaceFactor = smoothstep(6.5, 7.5, sectionT);
  float chorusFactor = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float soloFactor  = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Time modulation ───
  // Base speed: slow during space, fast during jams, flux adds variation
  float _cr_speedMod = 1.0 + energy * 0.6 + flux * 0.3;
  _cr_speedMod *= mix(1.0, 1.4, jamFactor);
  _cr_speedMod *= mix(1.0, 0.35, spaceFactor);
  _cr_speedMod *= mix(1.0, 1.2, chorusFactor);
  _cr_speedMod *= mix(1.0, 1.15, soloFactor);
  // Space score further slows things for hypnotic drift
  _cr_speedMod *= mix(1.0, 0.5, spaceScore);

  float _cr_time = uDynamicTime * _cr_speedMod;

  // ─── Channel phase separation ───
  // slowEnergy widens the phase offset between R, G, B channels.
  // More separation = more prismatic rainbow effect.
  // Climax: channels fully separate for intense rainbow explosion.
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  float _cr_chanSep = 0.04 + slowE * 0.06 + climaxBoost * 0.12;
  // Jam: wider separation for acid-drenched prismatic effect
  _cr_chanSep += jamFactor * 0.04;
  // Space: minimal separation, near-monochrome hypnosis
  _cr_chanSep *= mix(1.0, 0.3, spaceFactor);

  // ─── Coordinate warping ───
  // Bass drives spatial distortion; tension adds harmonic complexity
  float _cr_warpAmp = bass * 0.12 + tension * 0.08;
  vec2 _cr_warpedP = p;
  _cr_warpedP += vec2(
    sin(p.y * 3.0 + _cr_time * 0.7) * _cr_warpAmp,
    cos(p.x * 3.0 + _cr_time * 0.6) * _cr_warpAmp
  );
  // Noise-based organic warp
  _cr_warpedP += vec2(
    snoise(vec3(_cr_warpedP * 1.5, _cr_time * 0.15)),
    snoise(vec3(_cr_warpedP * 1.5 + 50.0, _cr_time * 0.15))
  ) * (0.04 + tension * 0.08);

  // Beat pulse: momentary scale expansion
  float _cr_scale = 1.0 - beatSnap * 0.08;
  _cr_warpedP *= _cr_scale;

  // Onset burst: expand rings outward
  float _cr_onsetExpand = onset * 0.15;
  _cr_warpedP *= 1.0 - _cr_onsetExpand;

  // ─── Ring frequency ───
  // Highs drive fine detail; base 9.0 from original algorithm
  float _cr_ringFreq = 9.0 + highs * 6.0 + energy * 3.0;
  // Jam: denser ring patterns
  _cr_ringFreq += jamFactor * 4.0;
  // Space: fewer, wider rings
  _cr_ringFreq -= spaceFactor * 4.0;
  _cr_ringFreq = max(_cr_ringFreq, 4.0);

  // ─── PRIMARY LAYER: the core Creation algorithm ───
  vec3 _cr_col1 = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float z = _cr_time + fi * _cr_chanSep;
    _cr_col1[i] = _cr_creationEx(_cr_warpedP, z, _cr_ringFreq, 1.0);
  }

  // ─── SECONDARY LAYER: deeper, slower, larger scale for depth ───
  vec3 _cr_col2 = vec3(0.0);
  vec2 _cr_deepP = _cr_warpedP * 0.6;
  float _cr_deepTime = _cr_time * 0.6;
  float _cr_deepFreq = _cr_ringFreq * 0.5;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float z = _cr_deepTime + fi * _cr_chanSep * 1.5;
    _cr_col2[i] = _cr_creationEx(_cr_deepP, z, _cr_deepFreq, 0.8);
  }

  // ─── TERTIARY LAYER: fast, fine detail overlay ───
  vec3 _cr_col3 = vec3(0.0);
  float _cr_detailAmt = energy * 0.5 + highs * 0.3;
  if (_cr_detailAmt > 0.1) {
    vec2 _cr_fineP = _cr_warpedP * 1.8;
    float _cr_fineTime = _cr_time * 1.3;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float z = _cr_fineTime + fi * _cr_chanSep * 0.5;
      _cr_col3[i] = _cr_creationEx(_cr_fineP, z, _cr_ringFreq * 1.5, 0.5);
    }
    _cr_col3 *= _cr_detailAmt;
  }

  // ─── Composite layers ───
  // Primary dominates; secondary adds depth; tertiary adds sparkle
  float _cr_depthMix = 0.25 + slowE * 0.1;
  float _cr_detailMix = 0.15;
  vec3 col = _cr_col1 + _cr_col2 * _cr_depthMix + _cr_col3 * _cr_detailMix;

  // ─── Volumetric glow accumulation ───
  // Adds subtle halo around bright ring intersections
  int _cr_glowPasses = 2 + int(energy * 2.0);
  vec3 _cr_glow = _cr_glowAccum(_cr_warpedP, _cr_time, _cr_ringFreq, _cr_glowPasses);
  _cr_glow *= (0.5 + brightness * 0.5);
  col += _cr_glow;

  // ─── Radial onset burst ───
  if (onset > 0.05) {
    float _cr_burst = _cr_radialBurst(p, onset, _cr_time);
    col += _cr_burst * vec3(1.0, 0.95, 0.85) * 0.4;
  }

  // ─── Palette tinting ───
  float hue1 = hsvToCosineHue(uPalettePrimary);
  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 palCol1 = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  vec3 palCol2 = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // Tint the raw prismatic color toward the song palette
  float _cr_palMix = 0.2 + energy * 0.1;
  vec3 _cr_palBlend = mix(palCol1, palCol2, sin(_cr_time * 0.08) * 0.5 + 0.5);
  col *= mix(vec3(1.0), _cr_palBlend, _cr_palMix);

  // Melodic pitch shifts color temperature: low=warm amber, high=cool blue
  vec3 _cr_warmShift = vec3(1.12, 0.96, 0.85);
  vec3 _cr_coolShift = vec3(0.88, 0.96, 1.15);
  col *= mix(_cr_warmShift, _cr_coolShift, melPitch);

  // Chroma hue modulation: live harmonic content rotates the palette
  if (abs(uChromaHue) > 0.01) {
    vec3 _cr_hsv = rgb2hsv(col);
    _cr_hsv.x = fract(_cr_hsv.x + uChromaHue * 0.12);
    col = hsv2rgb(_cr_hsv);
  }

  // ─── Dynamic range contrast ───
  // High dynamic range: deep blacks and bright peaks
  // Low dynamic range: compressed, dreamy
  float _cr_contrast = 0.8 + dynRange * 0.4;
  col = pow(max(col, vec3(0.0)), vec3(_cr_contrast));

  // ─── Energy brightness ───
  float _cr_bright = 0.6 + energy * 0.5 + brightness * 0.15;
  _cr_bright += peakApproach * 0.12;
  col *= _cr_bright;

  // ─── Climax: prismatic explosion ───
  if (climaxBoost > 0.01) {
    // Saturate and brighten dramatically
    col *= 1.0 + climaxBoost * 0.6;
    // Extra prismatic detail layer
    vec3 _cr_climaxExtra = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float z = _cr_time * 1.5 + fi * _cr_chanSep * 2.0;
      _cr_climaxExtra[i] = _cr_creationEx(_cr_warpedP * 1.3, z, _cr_ringFreq * 1.2, 1.2);
    }
    col += _cr_climaxExtra * climaxBoost * 0.3;
  }

  // ─── Jam phase modulation ───
  // Exploration: gentle swirl; build: intensifying; peak: full psychedelic overload
  if (uJamPhase >= 0.0 && jamFactor > 0.01) {
    float jpBuild = smoothstep(0.5, 1.5, uJamPhase) * (1.0 - step(1.5, uJamPhase));
    float jpPeak  = smoothstep(1.5, 2.5, uJamPhase) * (1.0 - step(2.5, uJamPhase));
    col *= 1.0 + jpBuild * 0.15 + jpPeak * 0.3;
  }

  // ─── Vocal presence warmth ───
  float _cr_vocalWarm = clamp(uVocalPresence, 0.0, 1.0) * clamp(uVocalEnergy, 0.0, 1.0);
  col += vec3(0.06, 0.03, 0.0) * _cr_vocalWarm * 0.3;

  // ─── Beat pulse brightness swell ───
  col *= 1.0 + beatSnap * 0.12;

  // ─── Onset flash ───
  col += vec3(1.0, 0.97, 0.92) * onset * 0.08 * energy;

  // ─── Vignette ───
  float _cr_vigScale = mix(0.28, 0.20, energy);
  float _cr_vignette = 1.0 - dot(p * _cr_vigScale, p * _cr_vigScale);
  _cr_vignette = smoothstep(0.0, 1.0, _cr_vignette);
  vec3 _cr_vigColor = mix(palCol1, palCol2, 0.5) * 0.03;
  col = mix(_cr_vigColor, col, _cr_vignette);

  // ─── Dead iconography ───
  {
    float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);
  }

  // ─── Semantic: psychedelic boost ───
  float _cr_psychBoost = uSemanticPsychedelic * 0.3;
  col = mix(col, col * vec3(1.0 + _cr_psychBoost * 0.15, 1.0, 1.0 + _cr_psychBoost * 0.1), _cr_psychBoost);

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
