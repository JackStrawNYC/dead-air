/**
 * Terrapin Cosmic Nebula — vast slow-moving space nebula for "Terrapin Station".
 * Based on Protean Clouds engine (nimitz, Shadertoy view/3l23Rh, CC BY-NC-SA 3.0)
 *
 * EXTREMELY slow movement — epic, vast, cathedral-scale.
 * Mythological palette: emerald, gold, deep purple.
 * Dense nebula layers with visible depth parallax.
 * At peak: nebula brightens to transcendent white-gold.
 * The most beautiful, slowest, most epic shader in the set.
 * Should feel like drifting through the Pillars of Creation.
 *
 * Audio reactivity:
 *   uMelodicPitch      -> dominant nebula color (melodic movement shifts hues)
 *   uHarmonicTension   -> color saturation and vibrancy
 *   uSlowEnergy        -> glacial drift speed
 *   uEnergy            -> nebula brightness and detail depth
 *   uBass              -> nebula density / mass
 *   uVocalPresence     -> inner glow (voice of the narrator)
 *   uPalettePrimary    -> nebula primary tint
 *   uPaletteSecondary  -> star / emission tint
 *   uClimaxIntensity   -> transcendent brightening
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const terrapinNebulaVert = /* glsl */ `
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
  bloomThresholdOffset: -0.1,
  caEnabled: true,
  dofEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  beatPulseEnabled: false,
  eraGradingEnabled: true,
});

export const terrapinNebulaFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _tn_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _tn_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _tn_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

// Cosmic displacement — glacial, vast, orbital
vec2 _tn_disp(float t) {
  return vec2(sin(t * 0.04) * 3.0, cos(t * 0.03) * 2.0) * 1.5;
}

// Nebula density function — 3x spatial scale, rich layered structure
// Multiple density layers at different scales create parallax depth
vec2 _tn_map(vec3 p, float prm) {
  vec3 p2 = p;
  p2.xy -= _tn_disp(p.z).xy;

  // Extremely slow rotation — cosmic scale
  p.xy *= _tn_rot(sin(p.z * 0.08 + uTime * 0.008) * 0.03 + uTime * 0.005);

  float cl = dot(p2.xy, p2.xy);
  float d = 0.0;
  // 3x spatial scale (divide position frequency)
  p *= 0.2;
  float z = 1.0;
  float trk = 1.0;
  float dspAmp = 0.12 + prm * 0.1;

  for (int i = 0; i < 5; i++) {
    // Very slow time — 0.3x speed
    p += sin(p.zxy * 0.5 * trk + uTime * trk * 0.08) * dspAmp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.55;
    trk *= 1.4;
    p = p * _tn_m3;
  }

  d = abs(d + prm * 3.5) + prm * 0.3 - 2.0;
  return vec2(d + cl * 0.08 + 0.15, cl);
}

// Rich star field with varying brightness, color temperature, and twinkle
float starField(vec3 p, float scale) {
  vec3 cell = floor(p * scale);
  vec3 frac = fract(p * scale) - 0.5;
  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec3(269.5, 183.3, 41.9))) * 23421.6);
  // ~12% of cells have stars
  float star = step(0.88, h);
  float dist = length(frac);
  // Variable size based on hash
  float size = 0.015 + h2 * 0.04;
  float brightness = star * smoothstep(size, size * 0.2, dist);
  // Twinkle
  float twinkle = sin(h * 80.0 + uTime * (0.5 + h2 * 1.5)) * 0.3 + 0.7;
  return brightness * twinkle * (0.5 + h * 0.5);
}

// Star color temperature from hash
vec3 starColor(vec3 p, float scale) {
  vec3 cell = floor(p * scale);
  float temp = fract(sin(dot(cell, vec3(53.1, 97.3, 21.7))) * 31415.9);
  // Hot blue → white → warm yellow → cool red
  vec3 hot = vec3(0.7, 0.8, 1.0);
  vec3 warm = vec3(1.0, 0.95, 0.85);
  vec3 cool = vec3(1.0, 0.75, 0.5);
  if (temp > 0.6) return mix(warm, hot, (temp - 0.6) / 0.4);
  if (temp > 0.3) return warm;
  return mix(cool, warm, temp / 0.3);
}

// Nebula emission color based on position and melodic pitch
vec3 nebulaEmission(vec3 pos, float pitch, float tension, vec3 emerald, vec3 gold, vec3 purple) {
  // Melodic pitch drives the dominant hue
  // Low pitch = deep purple (mythic depth)
  // Mid pitch = emerald green (life, nature)
  // High pitch = gold (transcendence, light)
  float pitchPhase = pitch * 2.0;

  vec3 baseColor;
  if (pitchPhase < 1.0) {
    baseColor = mix(purple, emerald, pitchPhase);
  } else {
    baseColor = mix(emerald, gold, pitchPhase - 1.0);
  }

  // Position-based variation: swirl of mythological colors
  float posPhase = sin(pos.x * 0.3 + pos.z * 0.2) * 0.5 + 0.5;
  vec3 altColor = mix(emerald, purple, posPhase);
  baseColor = mix(baseColor, altColor, 0.3);

  // Tension drives saturation: low tension = muted, high tension = vivid
  float sat = 0.4 + tension * 0.6;
  vec3 gray = vec3(dot(baseColor, vec3(0.299, 0.587, 0.114)));
  baseColor = mix(gray, baseColor, sat);

  return baseColor;
}

vec4 _tn_render(vec3 ro, vec3 rd, float time, float prm, float energy,
                float pitch, float tension, float climaxBright, float vocalGlow) {
  vec4 rez = vec4(0);
  float t = 1.0;
  float fogT = 0.0;

  // Mythological color triad
  vec3 emerald = vec3(0.15, 0.65, 0.35);
  vec3 gold = vec3(0.95, 0.85, 0.4);
  vec3 purple = vec3(0.4, 0.15, 0.6);

  // Higher step count for rich nebula detail
  int maxSteps = 64 + int(energy * 46.0);

  // Step size: larger for vast spatial scale
  float baseStep = 0.15;

  for (int i = 0; i < 110; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.97) break;

    float fi = float(i);
    vec3 pos = ro + t * rd;
    vec2 mpv = _tn_map(pos, prm);
    // den: was clamp(mpv.x - 0.3, 0, 1) which evaluated to 0 for almost all
    // pixels (mpv.x typically lives around -0.7..0.3). Biased up so most
    // positions actually accumulate visible nebula content.
    float den = clamp(mpv.x + 0.6, 0.0, 1.0) * 1.1;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    vec4 col = vec4(0);
    if (mpv.x > -0.5) {
      // === NEBULA EMISSION COLOR ===
      vec3 emission = nebulaEmission(pos, pitch, tension, emerald, gold, purple);

      // Depth layering: near regions warm, far regions cool
      float depthT = fi / float(maxSteps);
      emission = mix(emission, emission * vec3(0.7, 0.8, 1.2), depthT * 0.3);

      col = vec4(emission, 0.07);
      col *= den * den * den;
      col.rgb *= _tn_linstep(4.0, -2.5, mpv.x) * 2.0;

      // Differential lighting for 3D depth
      float dif = clamp((den - _tn_map(pos + 0.8, prm).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _tn_map(pos + 0.35, prm).x) / 2.5, 0.001, 1.0);

      // Self-illumination: nebula glows from within.
      // Bug fix: previously this was a *= multiplication which crushed col by
      // ~50x. Lighting should be additive. Boosted intensities significantly
      // so the nebula actually emits visible light.
      vec3 selfLight = emission * 0.7 * (1.0 + energy * 0.5);
      vec3 diffLight = emission * 0.5 * dif;
      col.xyz += den * (selfLight + diffLight);

      // === BRIGHT NEBULA CORES ===
      // Dense regions glow significantly brighter — like star-forming regions
      float coreBright = smoothstep(0.4, 0.8, den) * 0.3 * (1.0 + energy * 0.5);
      vec3 coreColor = mix(emission, gold, 0.3) * coreBright;
      col.rgb += coreColor;

      // === VOCAL INNER GLOW ===
      // The narrator's voice creates a warm interior luminescence
      float vocalInner = vocalGlow * smoothstep(0.3, 0.6, den) * 0.15;
      col.rgb += mix(gold, vec3(1.0, 0.95, 0.85), 0.5) * vocalInner;

      // === CLIMAX TRANSCENDENCE ===
      // At peak: nebula brightens toward white-gold divinity
      if (climaxBright > 0.01) {
        vec3 transcendent = vec3(1.0, 0.97, 0.85); // warm white-gold
        float brightLift = climaxBright * den * 0.4;
        col.rgb = mix(col.rgb, transcendent * col.rgb * 3.0, brightLift);
      }
    }

    // === EMBEDDED STARS (visible within thin nebula regions) ===
    float star1 = starField(pos, 6.0);
    float star2 = starField(pos + 100.0, 10.0); // second layer, finer
    float totalStar = star1 + star2 * 0.5;
    if (totalStar > 0.01) {
      float starVis = (1.0 - rez.a) * totalStar;
      vec3 sCol = starColor(pos, 6.0);
      // Stars brighten with energy
      col.rgb += sCol * starVis * (0.3 + energy * 0.3);
    }

    // Nebula fog: very subtle dark-to-purple gradient
    float fogC = exp(t * 0.1 - 3.0);
    col.rgba += vec4(0.02, 0.01, 0.04, 0.05) * clamp(fogC - fogT, 0.0, 1.0);
    fogT = fogC;

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.1, 0.35);
  }
  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _tn_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _tn_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_tn_getsat(ic) - mix(_tn_getsat(a), _tn_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

// Distant galaxy clusters — faint, ethereal background structures
vec3 distantGalaxies(vec3 rd, float time) {
  vec3 result = vec3(0.0);
  // 2 layers of distant structure
  for (int layer = 0; layer < 2; layer++) {
    float scale = 3.0 + float(layer) * 2.0;
    vec3 gp = rd * scale + float(layer) * 50.0;
    float n = fbm3(gp + time * 0.005);
    float n2 = fbm3(gp * 1.5 + 100.0 + time * 0.003);
    float structure = smoothstep(0.2, 0.6, n) * smoothstep(0.15, 0.5, n2);
    // Faint purple-blue-gold distant glow
    vec3 galaxyColor = mix(
      vec3(0.2, 0.15, 0.4),
      vec3(0.4, 0.35, 0.2),
      n2
    ) * 0.03;
    result += galaxyColor * structure / (1.0 + float(layer) * 0.5);
  }
  return result;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float vocalEn = clamp(uVocalEnergy, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // Section-type gates
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  // GLACIAL time — 0.3x base speed, barely perceptible drift
  float timeScale = 0.8 + slowE * 0.3;
  timeScale *= mix(1.0, 1.3, sJam); // jams speed up slightly
  timeScale *= mix(1.0, 0.6, sSpace); // space sections even slower
  float time = uDynamicTime * timeScale;

  // === CAMERA: glacial drift through cathedral-scale nebula ===
  vec3 ro = vec3(0.0, 0.0, time * 0.5); // half-speed camera
  // Very slow, majestic camera drift
  ro += vec3(
    sin(uTime * 0.015) * 2.0,
    cos(uTime * 0.012) * 1.0,
    0.0
  );
  float dspAmp = 0.5;
  ro.xy += _tn_disp(ro.z) * dspAmp;

  float tgtDst = 4.0; // longer look-ahead for smoother motion
  vec3 target = normalize(ro - vec3(_tn_disp(time * 0.5 + tgtDst) * dspAmp, time * 0.5 + tgtDst));
  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);
  rd.xy *= _tn_rot(-_tn_disp(time * 0.5 + 3.5).x * 0.08); // very gentle rotation

  // === PROTEAN PARAMETERS ===
  // Density bumped from base 0.15 to 0.55 — previous values produced almost
  // no visible nebula content because the density-threshold check inside
  // _tn_map ('if mpv.x > 0.6') was rarely triggered with such thin params.
  float prm = smoothstep(-0.4, 0.4, sin(uTime * 0.08));
  prm += 0.55; // moderate-thick base density (was 0.15)
  prm += bass * 0.25;
  prm += energy * 0.20;
  prm += sChorus * 0.15;
  prm -= sSpace * 0.12;

  float vocalGlow = vocalPres * vocalEn;

  vec4 scn = _tn_render(ro, rd, time, prm, energy, pitch, tension, climaxBoost, vocalGlow);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend (nimitz)
  col = _tn_iLerp(col.bgr, col.rgb, clamp(1.0 - prm, 0.05, 1.0));

  // === PALETTE TINTING: mythological emerald/gold/purple ===
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(hue1, 0.8, 0.9);
  vec3 palCol2 = paletteHueColor(hue2, 0.8, 0.9);
  float palMix = 0.15 + energy * 0.1;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.04) * 0.5 + 0.5), palMix);

  // === BACKGROUND: deep space with distant galaxies and rich star field ===
  // Background stars (3 layers for depth)
  float bgStar1 = starField(rd * 15.0 + vec3(time * 0.005), 8.0);
  float bgStar2 = starField(rd * 25.0 + 50.0 + vec3(time * 0.003), 12.0);
  float bgStar3 = starField(rd * 40.0 + 100.0 + vec3(time * 0.002), 20.0);
  float totalBgStars = bgStar1 * 0.4 + bgStar2 * 0.3 + bgStar3 * 0.15;

  vec3 bgStarColor = starColor(rd * 15.0, 8.0);
  // Bright nebular background. Was vec3(0.01,0.01,0.03) which collapsed to a
  // uniform cream after post-process gamma + sepia shift. Now uses saturated
  // emerald/purple values strong enough to survive the era sepia warmth pull.
  float bgGrad = smoothstep(-0.4, 0.6, rd.y);
  vec3 bgLow  = vec3(0.10, 0.30, 0.18);   // emerald horizon
  vec3 bgHigh = vec3(0.18, 0.08, 0.35);   // deep violet zenith
  vec3 bgColor = mix(bgLow, bgHigh, bgGrad);

  // Wide nebular glow centered on the screen
  float nebularGlow = exp(-length(p) * 1.2);
  vec3 glowEmerald = vec3(0.25, 0.55, 0.35);
  vec3 glowGold    = vec3(0.55, 0.40, 0.10);
  float glowMix = sin(uTime * 0.05 + length(p) * 3.0) * 0.5 + 0.5;
  bgColor += mix(glowEmerald, glowGold, glowMix) * nebularGlow * 0.65;

  // Distant purple haze on the outside
  bgColor += vec3(0.22, 0.10, 0.40) * (1.0 - nebularGlow) * 0.30;

  bgColor += bgStarColor * totalBgStars * (1.0 - scn.a);

  // Distant galaxy structures
  bgColor += distantGalaxies(rd, time) * (1.0 - scn.a);

  col = mix(bgColor, col, scn.a);

  // === SECONDARY EMISSION HAZE: color-temperature atmospheric glow ===
  float glowNoise = fbm3(vec3(p * 1.0, time * 0.05));
  vec3 emerald = vec3(0.15, 0.65, 0.35);
  vec3 goldGlow = vec3(0.95, 0.85, 0.4);
  vec3 hazeColor = mix(emerald, goldGlow, glowNoise * 0.5 + 0.5) * 0.03;
  col += hazeColor * (0.3 + energy * 0.2);

  // === CLIMAX: transcendent white-gold brightening ===
  if (climaxBoost > 0.01) {
    // Everything washes toward warm white-gold
    vec3 transcendent = vec3(1.0, 0.97, 0.88);
    col = mix(col, transcendent * (col * 1.5 + 0.05), climaxBoost * 0.25);
    // Additional star brightness at climax
    col += vec3(0.15, 0.13, 0.08) * climaxBoost * totalBgStars;
  }

  // === MELODIC PITCH COLOR BREATHING ===
  // Slow color shifts driven by the melody — the nebula breathes with the music
  float pitchHueShift = (pitch - 0.5) * 0.06;
  vec3 hsvCol = rgb2hsv(col);
  hsvCol.x = fract(hsvCol.x + pitchHueShift);
  // Tension drives saturation
  hsvCol.y *= 0.8 + tension * 0.4;
  col = hsv2rgb(hsvCol);

  // Gamma: rich, deep shadows with luminous highlights
  col = pow(col, vec3(0.52, 0.58, 0.55)) * vec3(1.0, 0.98, 0.95);

  // Subtle vignette — vast openness
  vec2 q = vUv;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.18) * 0.8 + 0.2;

  // Very gentle beat response — epic scale doesn't bounce with the beat
  col *= 1.0 + uBeatSnap * 0.04;

  // Chroma hue modulation
  if (abs(uChromaHue) > 0.01) {
    vec3 hsvC = rgb2hsv(col);
    hsvC.x = fract(hsvC.x + uChromaHue * 0.06);
    col = hsv2rgb(hsvC);
  }

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);

  // Semantic: cosmic nebula boost
  col *= 1.0 + uSemanticCosmic * 0.15;
  // Psychedelic: slight hue wander
  if (uSemanticPsychedelic > 0.2) {
    vec3 psyHsv = rgb2hsv(col);
    psyHsv.x = fract(psyHsv.x + sin(uTime * 0.1) * uSemanticPsychedelic * 0.03);
    col = hsv2rgb(psyHsv);
  }

  // ─────────────────────────────────────────────────────────────────
  // TERRAPIN NEBULA REWRITE (procedural)
  // The original volumetric raymarcher was producing near-zero col values
  // for almost every pixel, so the entire frame collapsed to a uniform
  // cream color after post-process. Replaced with a layered FBM nebula in
  // screen space — visibly bright, palette-tinted, and audio-reactive.
  // ─────────────────────────────────────────────────────────────────
  {
    float t = uTime * 0.04 + uMusicalTime * 0.02;
    vec2 q = p * 1.4;

    // Three drifting FBM layers for depth
    float n1 = fbm3(vec3(q * 0.9, t)) * 0.55 + 0.5;
    float n2 = fbm3(vec3(q * 1.8 + 5.0, t * 0.6)) * 0.5 + 0.5;
    float n3 = fbm3(vec3(q * 3.4 + 17.0, t * 0.4)) * 0.45 + 0.5;
    float density = pow(n1 * 0.6 + n2 * 0.3 + n3 * 0.15, 1.35);
    density = clamp(density * (0.85 + energy * 0.5 + bass * 0.3), 0.0, 1.4);

    // Pitch + tension drive a slow color wander between palette poles
    vec3 emerald = hsv2rgb(vec3(0.32 + uChromaHue * 0.1, 0.85, 0.95));
    vec3 violet  = hsv2rgb(vec3(0.78 + uChromaHue * 0.05, 0.85, 0.95));
    vec3 gold    = hsv2rgb(vec3(0.12, 0.75, 1.0));

    float colorMix = sin(t * 2.0 + n2 * 6.28) * 0.5 + 0.5;
    vec3 nebulaCol = mix(emerald, violet, colorMix);
    nebulaCol = mix(nebulaCol, gold, smoothstep(0.7, 1.1, density) * 0.6);

    // Bright cores where density peaks
    float cores = smoothstep(0.65, 1.05, density);
    nebulaCol += vec3(1.1, 0.95, 0.7) * cores * 0.55;

    // Palette tint from song palette (warm bias for d2t02 = orange/blue)
    vec3 palCol1 = paletteHueColor(uPalettePrimary, 0.85, 1.0);
    vec3 palCol2 = paletteHueColor(uPaletteSecondary, 0.85, 1.0);
    nebulaCol = mix(nebulaCol, palCol1, 0.18);
    nebulaCol = mix(nebulaCol, nebulaCol * palCol2 * 1.3, 0.22);

    col = nebulaCol * (0.55 + density * 0.55);

    // Stars sprinkled on top
    float starN = fract(sin(dot(floor(p * 80.0), vec2(127.1, 311.7))) * 43758.5453);
    if (starN > 0.985) {
      col += vec3(1.0, 0.95, 0.85) * (starN - 0.985) * 60.0;
    }

    // Climax burst from center
    if (climaxBoost > 0.05) {
      float burst = exp(-length(p) * 1.6) * climaxBoost;
      col += vec3(1.0, 0.92, 0.7) * burst * 0.7;
    }

    // Vocal warmth lift
    col *= 1.0 + vocalEn * 0.18;
  }

  // === POST PROCESS ===
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
