/**
 * Scarlet Begonias Golden Haze — warm sunlit haze with drifting light particles.
 * Based on Protean Clouds engine (nimitz, Shadertoy view/3l23Rh, CC BY-NC-SA 3.0)
 *
 * Light and airy — NOT dense. Thin golden haze emphasizing forward scatter.
 * Camera moves through a sunlit afternoon. Joyful, confident, sunny.
 * At peak: dazzling golden light, like being inside sunshine.
 *
 * Audio reactivity:
 *   uBeat / uBeatSnap   -> gentle brightness pulses (rhythmic sun-through-haze flickers)
 *   uHighs              -> sparkle particles in the haze
 *   uBeatStability      -> rhythmic coherence of light pulses
 *   uEnergy             -> overall glow intensity, particle count
 *   uSlowEnergy         -> drift speed of haze
 *   uOnsetSnap          -> bright scatter flash
 *   uMelodicPitch       -> haze color temperature (high=warm gold, low=amber)
 *   uPalettePrimary     -> base haze tint
 *   uPaletteSecondary   -> sparkle / highlight tint
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const scarletGoldenHazeVert = /* glsl */ `
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
  bloomThresholdOffset: -0.15,
  caEnabled: false,
  dofEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  beatPulseEnabled: true,
  eraGradingEnabled: true,
});

export const scarletGoldenHazeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _sg_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _sg_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _sg_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

// Light haze displacement — gentle, drifting, not turbulent
vec2 _sg_disp(float t) {
  return vec2(sin(t * 0.15) * 2.0, cos(t * 0.11) * 1.2);
}

// Golden haze density — VERY THIN, mostly transparent
// The goal is light scatter, not thick cloud mass
vec2 _sg_map(vec3 p, float prm) {
  vec3 p2 = p;
  p2.xy -= _sg_disp(p.z).xy;

  // Gentle rotation — lazy afternoon drift
  p.xy *= _sg_rot(sin(p.z * 0.15 + uTime * 0.04) * 0.06 + uTime * 0.02);

  float cl = dot(p2.xy, p2.xy);
  float d = 0.0;
  p *= 0.7; // larger scale for diffuse haze
  float z = 1.0;
  float trk = 1.0;
  float dspAmp = 0.06 + prm * 0.08; // very low displacement — soft, not turbulent

  for (int i = 0; i < 5; i++) {
    p += sin(p.zxy * 0.6 * trk + uTime * trk * 0.3) * dspAmp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.52; // even more low-frequency biased
    trk *= 1.5;
    p = p * _sg_m3;
  }

  // THIN density: high threshold so most of the volume is transparent
  d = abs(d + prm * 2.0) + prm * 0.2 - 3.5;
  return vec2(d + cl * 0.1 + 0.3, cl);
}

// Sparkle particles — hash-based bright motes in the golden light
float sparkleField(vec3 p, float time) {
  vec3 cell = floor(p * 15.0);
  vec3 frac = fract(p * 15.0) - 0.5;
  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  // Only ~8% of cells have sparkles
  float spark = step(0.92, h);
  float dist = length(frac);
  // Animated twinkle
  float twinkle = sin(h * 50.0 + time * (2.0 + h * 3.0)) * 0.5 + 0.5;
  float brightness = h * spark * smoothstep(0.06, 0.01, dist) * twinkle;
  return brightness;
}

vec4 _sg_render(vec3 ro, vec3 rd, float time, float prm, float energy, float highs) {
  vec4 rez = vec4(0);
  float t = 0.5;
  float fogT = 0.0;

  // Moderate steps — haze is thin so we don't need many
  int maxSteps = 50 + int(energy * 30.0);

  // Sun position: high and warm, slightly to the right
  vec3 sunDir = normalize(vec3(0.4, 0.7, 0.8));

  for (int i = 0; i < 80; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.95) break;

    vec3 pos = ro + t * rd;
    vec2 mpv = _sg_map(pos, prm);
    // den lifted: was clamp(mpv.x - 0.3, 0, 1) which was 0 for almost all
    // pixels. Bias up so the haze actually accumulates visible content.
    float den = clamp(mpv.x + 0.4, 0.0, 1.0) * 1.0;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    vec4 col = vec4(0);
    if (mpv.x > -0.5) {
      // === GOLDEN HAZE COLORS ===
      // Warm gold base with soft rose undertones
      vec3 goldBase = vec3(0.95, 0.82, 0.45);
      vec3 amberDeep = vec3(0.85, 0.6, 0.25);
      vec3 roseHint = vec3(0.9, 0.65, 0.55);

      // Mix based on depth and position
      float depthT = smoothstep(0.5, 3.0, t);
      vec3 hazeColor = mix(goldBase, amberDeep, depthT * 0.4);
      hazeColor = mix(hazeColor, roseHint, sin(pos.x * 0.5 + pos.z * 0.3) * 0.15 + 0.1);

      col = vec4(
        hazeColor + sin(vec3(1.0, 0.8, 0.3) + mpv.y * 0.08) * 0.06,
        0.04 // very low alpha per step — THIN haze
      );
      col *= den * den; // softer density curve (squared not cubed)
      col.rgb *= _sg_linstep(4.0, -2.5, mpv.x) * 2.5;

      // Differential lighting
      float dif = clamp((den - _sg_map(pos + 0.8, prm).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _sg_map(pos + 0.35, prm).x) / 2.5, 0.001, 1.0);

      // Warm ambient + strong forward scatter.
      // Bug fix: previously col.xyz *= (ambient + diffLight*2) which crushed
      // every pixel by ~95% since ambient was vec3(0.06,0.05,0.02). Lighting
      // should be additive, not multiplicative. Boosted intensities too.
      vec3 ambient = vec3(0.18, 0.15, 0.06);
      vec3 diffLight = vec3(0.45, 0.35, 0.15) * dif;
      col.xyz += den * (ambient + diffLight);

      // === DOMINANT FORWARD SCATTERING ===
      // This is the key visual: looking toward the sun through golden dust
      float sunDot = max(0.0, dot(rd, sunDir));

      // Henyey-Greenstein phase: VERY forward-biased (g=0.85)
      float g = 0.85;
      float phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * sunDot, 1.5));

      // Forward scatter illumination: intense warm golden glow
      vec3 scatterColor = vec3(1.0, 0.9, 0.55) * phase * 0.25;
      col.rgb += scatterColor * den;

      // Back-scatter rim: soft pink-gold on edges
      float backDot = max(0.0, dot(-rd, sunDir));
      col.rgb += vec3(0.8, 0.6, 0.4) * pow(backDot, 3.0) * 0.03 * den;
    }

    // Light golden fog
    float fogC = exp(t * 0.15 - 2.5);
    col.rgba += vec4(0.12, 0.1, 0.04, 0.06) * clamp(fogC - fogT, 0.0, 1.0);
    fogT = fogC;

    // === SPARKLE PARTICLES ===
    float sparkle = sparkleField(pos, uDynamicTime * 2.0);
    if (sparkle > 0.01) {
      // Highs drive sparkle intensity
      float sparkIntensity = sparkle * (0.3 + highs * 0.7) * (1.0 - rez.a);
      vec3 sparkColor = vec3(1.0, 0.95, 0.75); // bright warm white
      col.rgb += sparkColor * sparkIntensity * 0.4;
    }

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.1, 0.35);
  }
  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _sg_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _sg_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_sg_getsat(ic) - mix(_sg_getsat(a), _sg_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

// Lens flare: anamorphic horizontal streak toward sun
vec3 lensFlare(vec2 p, vec2 sunScreen) {
  vec2 d = p - sunScreen;
  float dist = length(d);

  // Horizontal anamorphic streak
  float streak = exp(-abs(d.y) * 30.0) * exp(-abs(d.x) * 2.0);
  // Central glow
  float glow = 1.0 / (dist * 8.0 + 0.3);
  // Starburst
  float angle = atan(d.y, d.x);
  float burst = pow(abs(sin(angle * 3.0)), 8.0) * 0.15 / (dist + 0.1);

  vec3 flareColor = vec3(1.0, 0.9, 0.5) * glow * 0.15;
  flareColor += vec3(1.0, 0.85, 0.4) * streak * 0.2;
  flareColor += vec3(0.9, 0.8, 0.5) * burst;

  return flareColor;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // Section-type gates
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Gentle, breezy time flow
  float timeScale = 2.5 + slowE * 1.0 + sJam * 0.5;
  float time = uDynamicTime * timeScale;

  // === CAMERA: drifting through golden afternoon ===
  vec3 ro = vec3(0.0, 0.0, time);
  ro += vec3(sin(uTime * 0.05) * 1.0, sin(uTime * 0.03) * 0.3, 0.0);
  float dspAmp = 0.7;
  ro.xy += _sg_disp(ro.z) * dspAmp;

  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_sg_disp(time + tgtDst) * dspAmp, time + tgtDst));
  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);
  rd.xy *= _sg_rot(-_sg_disp(time + 3.5).x * 0.15);

  // === PROTEAN PARAMETERS ===
  // THIN haze — prm stays low
  float prm = smoothstep(-0.4, 0.4, sin(uTime * 0.15));
  prm *= 0.6; // reduce overall density
  prm += energy * 0.30; // energy adds slight thickening
  prm += sJam * 0.1;
  prm -= sSpace * 0.15;

  vec4 scn = _sg_render(ro, rd, time, prm, energy, highs);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend (nimitz)
  col = _sg_iLerp(col.bgr, col.rgb, clamp(1.0 - prm, 0.05, 1.0));

  // === PALETTE TINTING: warm gold dominant ===
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(hue1, 0.8, 0.9);
  vec3 palCol2 = paletteHueColor(hue2, 0.8, 0.9);
  // Warm palette bias
  float palMix = 0.12 + energy * 0.20;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.08) * 0.5 + 0.5), palMix);

  // === FORWARD SCATTER ATMOSPHERIC GLOW ===
  // Overall screen-space golden glow toward sun direction
  vec3 sunDir = normalize(vec3(0.4, 0.7, 0.8));
  float sunDot = max(0.0, dot(rd, sunDir));
  float atmosphericGlow = pow(sunDot, 3.0) * 0.25 * (0.6 + energy * 0.4);
  vec3 glowColor = mix(vec3(1.0, 0.88, 0.5), vec3(1.0, 0.7, 0.4), energy);
  col += glowColor * atmosphericGlow * (1.0 - scn.a * 0.3);

  // === LENS FLARE: sun through haze ===
  vec2 sunScreen = vec2(0.25, 0.35); // upper right area
  vec3 flare = lensFlare(p, sunScreen) * (0.3 + energy * 0.4 + climaxBoost * 0.6);
  col += flare;

  // === SKY: warm golden gradient ===
  float skyGrad = smoothstep(-0.2, 0.6, rd.y);
  vec3 skyLow = vec3(0.7, 0.55, 0.3); // warm amber horizon
  vec3 skyHigh = vec3(0.35, 0.5, 0.75); // blue zenith with warm tint
  vec3 skyColor = mix(skyLow, skyHigh, skyGrad);
  // Sun glow in sky
  skyColor += vec3(0.4, 0.3, 0.1) * pow(sunDot, 5.0);
  col = mix(skyColor, col, scn.a * 0.8 + 0.2);

  // === BEAT PULSE: rhythmic warm brightness ===
  // Beat stability makes pulses more regular and confident
  float beatPulse = uBeatSnap * (0.08 + beatStab * 0.06);
  col *= 1.0 + beatPulse;

  // Onset snap: bright flash of scattered light
  col += vec3(1.0, 0.92, 0.6) * onsetSnap * 0.12 * energy;

  // === PITCH-DRIVEN COLOR TEMPERATURE ===
  // High melodic pitch = warmer gold; Low = deeper amber
  vec3 warmShift = vec3(0.08, 0.04, -0.02) * pitch;
  col += warmShift * energy * 0.5;

  // === AT PEAK: dazzling golden light ===
  col += vec3(0.3, 0.25, 0.1) * climaxBoost * 0.5;
  // Screen turns almost white-gold at maximum climax
  col = mix(col, vec3(1.0, 0.95, 0.75), climaxBoost * 0.15);

  // === SECONDARY GLOW: palette-tinted warm haze ===
  float glowNoise = fbm3(vec3(p * 1.5, time * 0.1));
  vec3 secondaryGlow = mix(palCol1, palCol2, glowNoise * 0.5 + 0.5) * 0.04;
  col += secondaryGlow * (0.4 + energy * 0.3);

  // Warm tone mapping
  col = pow(col, vec3(0.5, 0.55, 0.65)) * vec3(1.05, 1.0, 0.88);

  // Gentle vignette — open, not claustrophobic
  vec2 q = vUv;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.15) * 0.75 + 0.25;

  // Chroma hue modulation
  if (abs(uChromaHue) > 0.01) {
    vec3 hsvCol = rgb2hsv(col);
    hsvCol.x = fract(hsvCol.x + uChromaHue * 0.08);
    col = hsv2rgb(hsvCol);
  }

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);

  // === POST PROCESS ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
