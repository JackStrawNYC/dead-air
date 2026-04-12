/**
 * Wharf Rat Rain Clouds — oppressive low storm that breaks apart for redemption.
 * Based on Protean Clouds engine (nimitz, Shadertoy view/3l23Rh, CC BY-NC-SA 3.0)
 *
 * Narrative arc: trapped under suffocating gray ceiling -> clouds part -> golden light.
 * The build is SLOW and EARNED. Dense, heavy, low storm clouds press down.
 * At climax: magnificent clearing, sunbeams piercing through cloud gaps.
 *
 * Audio reactivity:
 *   uEnergy         -> barely affects until the build, then tears clouds apart
 *   uClimaxIntensity -> how much clouds part to reveal light
 *   uHarmonicTension -> cloud darkness and density (more tension = darker, heavier)
 *   uBass            -> low rumble density wobble
 *   uSlowEnergy      -> drift speed of cloud mass
 *   uVocalPresence   -> subtle light breaks (August West's voice = cracks of light)
 *   uPeakApproaching -> gradual cloud thinning as build approaches
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const wharfRatStormVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "heavy",
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  caEnabled: true,
  dofEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
});

export const wharfRatStormFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _wr_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _wr_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _wr_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

// Storm-specific displacement — slow, heavy, lateral movement
vec2 _wr_disp(float t) {
  return vec2(sin(t * 0.08) * 1.5, cos(t * 0.06) * 0.4) * 1.5;
}

// Storm cloud density — HEAVY, OPPRESSIVE, LOW
// Completely different character from generic protean clouds:
// thick layered stratus pressing down, not buoyant cumulus
vec2 _wr_map(vec3 p, float prm, float tension, float climaxOpen) {
  vec3 p2 = p;
  p2.xy -= _wr_disp(p.z).xy;

  // Very slow rotation — storm clouds barely turn
  p.xy *= _wr_rot(sin(p.z * 0.3 + uTime * 0.02) * 0.04 + uTime * 0.015);

  float cl = dot(p2.xy, p2.xy);
  float d = 0.0;
  p *= 0.55; // slightly larger scale for heavy clouds
  float z = 1.0;
  float trk = 1.0;

  // Turbulence amplitude: tension makes it heavier
  float dspAmp = 0.15 + tension * 0.15 + prm * 0.12;
  // Bass adds low-frequency rumble to density
  dspAmp += uBass * 0.08;

  // 5 octaves of displaced sine turbulence
  for (int i = 0; i < 5; i++) {
    // Much slower time multiplier than standard protean
    p += sin(p.zxy * 0.65 * trk + uTime * trk * 0.15) * dspAmp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.6; // slightly more low-frequency dominance
    trk *= 1.35;
    p = p * _wr_m3;
  }

  // Base density is MUCH higher than standard — oppressive ceiling
  // tension increases density; climax opens gaps
  float baseDensity = 3.8 + tension * 1.5 - climaxOpen * 3.0;
  d = abs(d + prm * baseDensity) + prm * 0.4 - 2.2;

  // Altitude bias: density concentrated LOW (y < 0 is the thick ceiling)
  float altBias = smoothstep(2.0, -1.0, p2.y) * 0.4;
  d -= altBias;

  return vec2(d + cl * 0.15 + 0.2, cl);
}

vec4 _wr_render(vec3 ro, vec3 rd, float time, float prm, float tension, float climaxOpen, float energy) {
  vec4 rez = vec4(0);
  const float ldst = 8.0;
  vec3 lpos = vec3(_wr_disp(time + ldst) * 0.5, time + ldst);
  float t = 1.0;
  float fogT = 0.0;

  // Storm uses fewer steps at low energy (oppressive stillness)
  // More steps only when energy builds
  int maxSteps = 60 + int(energy * 40.0);

  // Climax light source: golden sun breaking through from above
  vec3 sunDir = normalize(vec3(0.3, 1.0, 0.5));
  float sunBreak = climaxOpen * climaxOpen; // quadratic — light comes FAST once clouds part

  for (int i = 0; i < 100; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.99) break;

    vec3 pos = ro + t * rd;
    vec2 mpv = _wr_map(pos, prm, tension, climaxOpen);
    float den = clamp(mpv.x - 0.3, 0.0, 1.0) * 1.2;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    vec4 col = vec4(0);
    if (mpv.x > 0.6) {
      // Storm palette: slate gray, muted blue, dark iron
      // Tension pushes toward darker, more threatening tones
      vec3 stormBase = mix(
        vec3(0.35, 0.38, 0.42), // slate gray
        vec3(0.15, 0.16, 0.22), // dark iron
        tension * 0.7
      );

      // Muted blue undertone in deeper clouds
      vec3 deepBlue = vec3(0.12, 0.15, 0.25);
      float depthFactor = smoothstep(0.5, 2.0, t);
      stormBase = mix(stormBase, deepBlue, depthFactor * 0.4);

      col = vec4(
        stormBase + sin(vec3(0.5, 0.6, 0.8) + mpv.y * 0.05) * 0.08,
        0.1
      );
      col *= den * den * den;
      col.rgb *= _wr_linstep(4.0, -2.5, mpv.x) * 1.8;

      // Differential lighting (nimitz technique)
      float dif = clamp((den - _wr_map(pos + 0.8, prm, tension, climaxOpen).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _wr_map(pos + 0.35, prm, tension, climaxOpen).x) / 2.5, 0.001, 1.0);

      // Storm lighting: very dim ambient, slight blue from above
      vec3 ambient = vec3(0.008, 0.012, 0.02);
      vec3 diffLight = vec3(0.02, 0.03, 0.04) * dif;
      col.xyz *= den * (ambient + diffLight * 1.5);

      // === CLIMAX LIGHT BREAKTHROUGH ===
      // Golden sunlight piercing through thinning cloud gaps
      if (sunBreak > 0.01) {
        float sunScatter = max(0.0, dot(rd, sunDir));
        float godPhase = pow(sunScatter, 6.0 + (1.0 - sunBreak) * 10.0);

        // Light penetration: less dense areas let more light through
        float lightPen = (1.0 - den * 0.8) * sunBreak;

        // Golden redemption light
        vec3 goldenLight = vec3(1.0, 0.85, 0.5) * godPhase * lightPen * 0.6;
        // Pale silver-blue break light
        vec3 breakLight = vec3(0.7, 0.75, 0.85) * lightPen * 0.15;

        col.rgb += (goldenLight + breakLight) * sunBreak;
      }

      // === VOCAL PRESENCE: cracks of light ===
      // August West's voice creates subtle luminous breaks
      float vocalLight = uVocalPresence * uVocalEnergy * 0.08;
      float vocalBreak = snoise(pos * 2.0 + vec3(0.0, uTime * 0.1, 0.0));
      vocalBreak = smoothstep(0.3, 0.8, vocalBreak);
      col.rgb += vec3(0.6, 0.65, 0.7) * vocalLight * vocalBreak * (1.0 - den * 0.5);
    }

    // Fog accumulation — heavier than standard
    float fogC = exp(t * 0.25 - 2.0);
    col.rgba += vec4(0.04, 0.05, 0.07, 0.12) * clamp(fogC - fogT, 0.0, 1.0);
    fogT = fogC;

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.09, 0.3);
  }
  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _wr_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _wr_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_wr_getsat(ic) - mix(_wr_getsat(a), _wr_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

// Rain streaks — subtle diagonal lines in the volume
float rainStreak(vec2 p, float time) {
  // Diagonal rain falling
  vec2 rp = p * vec2(40.0, 12.0);
  rp.y += time * 8.0; // falling speed
  rp.x += rp.y * 0.3; // diagonal angle
  float cell = floor(rp.x);
  float h = fract(sin(cell * 127.1) * 43758.5);
  float streak = smoothstep(0.48, 0.5, fract(rp.x)) * smoothstep(0.52, 0.5, fract(rp.x));
  streak *= smoothstep(0.0, 0.3, fract(rp.y + h)) * smoothstep(1.0, 0.7, fract(rp.y + h));
  return streak * step(0.6, h); // only ~40% of cells have rain
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  // The climax opening: combination of climax + peak approaching
  // The break is EARNED — peakApproaching gives a slow tease, climax blows it open
  float climaxOpen = isClimax * climaxIntensity * 0.7 + peakApproach * 0.15;
  climaxOpen = clamp(climaxOpen, 0.0, 1.0);

  // SLOW time — storm clouds barely move
  float timeScale = 1.2 + slowE * 0.5;
  float time = uDynamicTime * timeScale;

  // === CAMERA: looking UPWARD at oppressive ceiling ===
  // The camera tilts up to emphasize the crushing weight of the storm
  vec3 ro = vec3(0.0, -1.5, time * 0.5); // below the cloud deck
  ro += vec3(sin(uTime * 0.03) * 0.8, 0.0, 0.0); // very slow lateral drift

  float dspAmp = 0.6;
  ro.xy += _wr_disp(ro.z) * dspAmp;

  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_wr_disp(time * 0.5 + tgtDst) * dspAmp, time * 0.5 + tgtDst));

  // Tilt camera UP toward the cloud ceiling
  target.y -= 0.6 + climaxOpen * 0.3; // look more up as clouds part (to see the light)

  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);
  rd.xy *= _wr_rot(-_wr_disp(time * 0.5 + 3.5).x * 0.1);

  // === PROTEAN PARAMETERS ===
  // prm controls the density character
  float prm = 0.6 + tension * 0.3; // high base = heavy clouds
  prm += bass * 0.30; // bass rumble
  // Energy barely affects until the build
  prm += energy * 0.1 * smoothstep(0.4, 0.7, energy); // gated energy response
  // Climax thins clouds dramatically
  prm -= climaxOpen * 0.5;

  vec4 scn = _wr_render(ro, rd, time, prm, tension, climaxOpen, energy);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend (nimitz)
  col = _wr_iLerp(col.bgr, col.rgb, clamp(1.0 - prm, 0.05, 1.0));

  // === PALETTE TINTING: desaturated storm palette ===
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(hue1, 0.55, 0.85);
  vec3 palCol2 = paletteHueColor(hue2, 0.55, 0.85);
  // Very subtle palette influence — storm is mostly gray
  float palMix = 0.06 + energy * 0.12;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.05) * 0.5 + 0.5), palMix);

  // === GOD RAYS THROUGH CLOUD BREAKS (climax only) ===
  if (climaxOpen > 0.05) {
    vec3 sunDir = normalize(vec3(0.3, 1.0, 0.5));
    float sunDot = max(0.0, dot(rd, sunDir));
    float g = 0.82;
    float phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * sunDot, 1.5));

    // God rays accumulate — 6 steps toward sun
    float godRayAccum = 0.0;
    for (int j = 0; j < 6; j++) {
      float gt = 0.5 + float(j) * 0.5;
      vec3 gpos = ro + rd * gt;
      float gDen = fbm6(gpos * 0.25 + vec3(time * 0.05, 0.0, time * 0.02));
      gDen *= (1.0 - climaxOpen * 0.6); // thinner at climax
      float inscatter = exp(-gDen * 3.0) * 0.08;
      godRayAccum += inscatter;
    }

    // Warm golden rays — the redemption light
    vec3 rayColor = vec3(1.0, 0.88, 0.55);
    col += rayColor * godRayAccum * phase * climaxOpen * 1.8;

    // Pale blue edge light on cloud breaks
    vec3 rimLight = vec3(0.6, 0.7, 0.85) * pow(sunDot, 2.0) * climaxOpen * 0.3;
    col += rimLight * (1.0 - scn.a * 0.5);
  }

  // === SKY: dark oppressive gradient, brightens at climax ===
  float skyGrad = smoothstep(-0.3, 0.5, rd.y);
  vec3 darkSky = vec3(0.06, 0.07, 0.1); // nearly black
  vec3 stormSky = vec3(0.18, 0.20, 0.25); // slate
  vec3 breakSky = vec3(0.5, 0.55, 0.7); // pale blue break
  vec3 goldenSky = vec3(0.85, 0.75, 0.45); // golden opening
  vec3 skyColor = mix(darkSky, stormSky, skyGrad);
  skyColor = mix(skyColor, breakSky, climaxOpen * skyGrad * 0.5);
  skyColor = mix(skyColor, goldenSky, climaxOpen * climaxOpen * skyGrad * 0.4);
  col = mix(skyColor, col, scn.a);

  // === RAIN STREAKS (before climax) ===
  float rainIntensity = (1.0 - climaxOpen) * 0.08 * (0.5 + tension * 0.5);
  float rain = rainStreak(p, uDynamicTime * 3.0);
  col += vec3(0.4, 0.42, 0.5) * rain * rainIntensity;

  // === TONE: oppressive desaturation, lifted at climax ===
  // Desaturate the storm — everything is gray and heavy
  vec3 hsvCol = rgb2hsv(col);
  float desatAmount = 0.5 * (1.0 - climaxOpen * 0.7); // climax restores saturation
  hsvCol.y *= (1.0 - desatAmount);
  // Darken overall — oppressive
  hsvCol.z *= 0.7 + climaxOpen * 0.5 + energy * 0.1;
  col = hsv2rgb(hsvCol);

  // Gamma: slightly crushed blacks, lifted at climax
  col = pow(col, vec3(0.65 - climaxOpen * 0.1, 0.7 - climaxOpen * 0.08, 0.75 - climaxOpen * 0.05));

  // Heavy vignette — claustrophobic
  vec2 q = vUv;
  float vig = pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.08) * 0.6 + 0.4;
  vig = mix(vig, pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.15) * 0.8 + 0.2, climaxOpen);
  col *= vig;

  // Beat pulse — very subtle in the storm, stronger at climax
  col *= 1.0 + uBeatSnap * (0.03 + climaxOpen * 0.1);

  // Dynamic range: thunder darkness/brightness swing
  col *= 1.0 + uDynamicRange * 0.08 * (1.0 - climaxOpen);

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
