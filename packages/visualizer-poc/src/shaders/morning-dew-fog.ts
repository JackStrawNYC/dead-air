/**
 * Morning Dew Fog — ground-hugging fog over a misty field at dawn.
 * Protean Clouds engine (nimitz, CC BY-NC-SA 3.0) with density biased
 * to the lower half of the frame. Cold gray-blue at rest, warm amber/gold
 * as energy rises. Fog thins and tears apart at climax revealing golden sky.
 *
 * Audio reactivity:
 *   uSlowEnergy      -> fog thickness (more = denser blanket)
 *   uEnergy          -> color shift (cold -> warm), fog thinning
 *   uClimaxIntensity -> fog tears apart, golden light floods through
 *   uBass            -> low rumble ripples in the fog surface
 *   uVocalPresence   -> wisps rise from the ground (vocal = mist curling up)
 *   uMelodicPitch    -> subtle vertical lift of fog ceiling
 *   uHarmonicTension -> color desaturation (tension = bleached)
 *   uSpaceScore      -> extreme stillness, fog nearly frozen
 *   uPeakApproaching -> anticipatory brightening on horizon
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const morningDewFogVert = /* glsl */ `
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
  caEnabled: false,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
});

export const morningDewFogFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _mdf_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _mdf_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _mdf_mag2(vec2 p) { return dot(p, p); }

float _mdf_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

float _mdf_prm1 = 0.0;
vec2  _mdf_bsMo = vec2(0);

// Displacement — very slow horizontal drift for ground fog
vec2 _mdf_disp(float t) {
  return vec2(sin(t * 0.08) * 1.5, cos(t * 0.06) * 0.5) * 1.2;
}

// Density function — Protean Clouds turbulence with ground-hugging mask
vec2 _mdf_map(vec3 p, float groundMask) {
  vec3 p2 = p;
  p2.xy -= _mdf_disp(p.z).xy;

  // Very gentle rotation — contemplative, not chaotic
  p.xy *= _mdf_rot(sin(p.z * 0.5 + uTime * 0.15) * 0.06 + uTime * 0.02);
  float cl = _mdf_mag2(p2.xy);
  float d = 0.0;
  p *= 0.61;
  float z = 1.0;
  float trk = 1.0;
  float dspAmp = 0.1 + _mdf_prm1 * 0.2;

  // Bass rumbles through the fog floor
  dspAmp += uBass * 0.12;

  for (int i = 0; i < 5; i++) {
    p += sin(p.zxy * 0.75 * trk + uTime * trk * 0.25) * dspAmp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.57;
    trk *= 1.4;
    p = p * _mdf_m3;
  }
  d = abs(d + _mdf_prm1 * 3.0) + _mdf_prm1 * 0.3 - 2.5 + _mdf_bsMo.y;

  // Ground-hugging: multiply density by mask that fades above horizon
  d *= groundMask;

  return vec2(d + cl * 0.2 + 0.25, cl);
}

vec4 _mdf_render(vec3 ro, vec3 rd, float time, float energy, float slowE,
                 float climaxTear, float groundBias, vec3 fogColor, vec3 skyColor) {
  vec4 rez = vec4(0);
  const float ldst = 8.0;
  vec3 lpos = vec3(_mdf_disp(time + ldst) * 0.5, time + ldst);
  float t = 1.5;
  float fogT = 0.0;

  // Step count: contemplative 60 at quiet, richer at peaks
  int maxSteps = 60 + int(energy * 50.0);

  for (int i = 0; i < 110; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.99) break;

    vec3 pos = ro + t * rd;

    // Ground mask: density strongest below y=0, fades above y=1.5
    // Vocal presence lifts wisps higher
    float vocalLift = clamp(uVocalPresence, 0.0, 1.0) * 0.8;
    float pitchLift = clamp(uMelodicPitch, 0.0, 1.0) * 0.4;
    float fogCeiling = 0.8 + vocalLift + pitchLift;
    float groundMask = smoothstep(fogCeiling, -0.5, pos.y) * groundBias;

    // Climax tears holes in the fog
    if (climaxTear > 0.01) {
      float tearNoise = snoise(pos * 1.5 + vec3(0.0, time * 0.5, 0.0));
      groundMask *= mix(1.0, smoothstep(-0.2, 0.6, tearNoise), climaxTear);
    }

    vec2 mpv = _mdf_map(pos, groundMask);
    float den = clamp(mpv.x - 0.3, 0.0, 1.0) * 1.12;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    // Fog THINS as energy increases (dawn lifting)
    den *= mix(1.0, 0.4, energy);
    // slowEnergy THICKENS fog
    den *= 0.8 + slowE * 0.6;

    vec4 col = vec4(0);
    if (mpv.x > 0.6) {
      col = vec4(
        sin(vec3(5.0, 0.4, 0.2) + mpv.y * 0.1 + sin(pos.z * 0.4) * 0.5 + 1.8) * 0.5 + 0.5,
        0.08
      );
      col *= den * den * den;
      col.rgb *= _mdf_linstep(4.0, -2.5, mpv.x) * 2.3;

      // Lighting: soft diffuse from above
      float dif = clamp((den - _mdf_map(pos + vec3(0.0, 0.8, 0.0), groundMask).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _mdf_map(pos + vec3(0.35, 0.0, 0.0), groundMask).x) / 2.5, 0.001, 1.0);

      // Color: cold gray-blue -> warm amber/gold based on energy
      vec3 coldColor = vec3(0.012, 0.025, 0.045);
      vec3 warmColor = vec3(0.06, 0.04, 0.015);
      vec3 baseLight = mix(coldColor, warmColor, energy);

      col.xyz *= den * (baseLight + 1.5 * mix(
        vec3(0.02, 0.035, 0.06),   // cold ambient
        vec3(0.065, 0.05, 0.02),    // warm dawn light
        energy
      ) * dif);

      // Tint with fog color
      col.rgb = mix(col.rgb, col.rgb * fogColor, 0.3);
    }

    // Atmospheric fog accumulation
    float fogC = exp(t * 0.2 - 2.2);
    vec4 fogLayer = vec4(fogColor * 0.06, 0.1) * clamp(fogC - fogT, 0.0, 1.0);
    col.rgba += fogLayer;
    fogT = fogC;

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.09, 0.3);
  }
  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _mdf_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _mdf_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_mdf_getsat(ic) - mix(_mdf_getsat(a), _mdf_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

// Horizon glow — warm band of light at the horizon line
vec3 horizonGlow(vec2 p, float energy, float climax, float peakApproach) {
  // Glow centered just below eye level
  float horizonY = -0.05;
  float dist = abs(p.y - horizonY);
  float glow = exp(-dist * dist * 12.0);

  // Widens and brightens with energy
  glow *= 0.3 + energy * 0.5 + climax * 0.8 + peakApproach * 0.3;

  // Cold to warm color
  vec3 coldGlow = vec3(0.15, 0.18, 0.25);
  vec3 warmGlow = vec3(0.9, 0.6, 0.2);
  vec3 peakGlow = vec3(1.0, 0.85, 0.5);

  vec3 glowColor = mix(coldGlow, warmGlow, energy);
  glowColor = mix(glowColor, peakGlow, climax);

  return glowColor * glow;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxTear = isClimax * climaxIntensity;

  // Section type modulation
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));

  // Time: very slow, contemplative; space sections nearly frozen
  float spaceFreeze = mix(1.0, 0.15, max(sSpace, spaceScore));
  float timeScale = (1.0 + slowE * 0.5) * spaceFreeze;
  float time = uDynamicTime * timeScale;

  // Palette
  float hue1 = hsvToCosineHue(uPalettePrimary);
  float hue2 = hsvToCosineHue(uPaletteSecondary);

  // Fog color: cold blue-gray at rest -> warm amber at energy
  vec3 coldFog = vec3(0.35, 0.40, 0.55);
  vec3 warmFog = vec3(0.75, 0.55, 0.30);
  vec3 fogColor = mix(coldFog, warmFog, energy * 0.7);
  // Tension desaturates
  fogColor = mix(fogColor, vec3(dot(fogColor, vec3(0.299, 0.587, 0.114))), tension * 0.4);
  // Blend with palette
  vec3 palCol1 = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  vec3 palCol2 = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  fogColor = mix(fogColor, fogColor * palCol1, 0.2);

  // Sky behind the fog: dark blue at rest, golden at climax
  vec3 nightSky = vec3(0.04, 0.05, 0.10);
  vec3 dawnSky = vec3(0.25, 0.18, 0.08);
  vec3 peakSky = vec3(0.95, 0.75, 0.35);
  vec3 skyColor = mix(nightSky, dawnSky, energy);
  skyColor = mix(skyColor, peakSky, climaxTear);

  // Camera: near ground level, looking across
  vec3 ro = vec3(0.0, 0.2, time);
  // Gentle sway
  ro.x += sin(uTime * 0.07) * 0.3;
  ro.y += sin(uTime * 0.05) * 0.05;
  ro.xy += _mdf_disp(ro.z) * 0.6;

  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_mdf_disp(time + tgtDst) * 0.6, time + tgtDst));
  // Look slightly downward to see ground fog
  target.y -= 0.15;
  target = normalize(target);

  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);

  // Audio-reactive parameters for the density function
  _mdf_prm1 = smoothstep(-0.4, 0.4, sin(uTime * 0.1));
  // Bass thickens the fog blanket
  _mdf_prm1 += bass * 0.2;
  // SlowEnergy adds density
  _mdf_prm1 += slowE * 0.15;
  // Climax tears fog apart (reduce prm1)
  _mdf_prm1 -= climaxTear * 0.8;
  // Space: minimal, ethereal
  _mdf_prm1 *= mix(1.0, 0.3, sSpace);
  // Jam: slightly more turbulent
  _mdf_prm1 += sJam * 0.1;

  // Ground bias: 1.0 = full fog, reduces with energy (fog lifting)
  float groundBias = mix(1.0, 0.35, energy * 0.6);
  groundBias = mix(groundBias, 0.1, climaxTear);

  vec4 scn = _mdf_render(ro, rd, time, energy, slowE, climaxTear, groundBias, fogColor, skyColor);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend
  col = _mdf_iLerp(col.bgr, col.rgb, clamp(1.0 - _mdf_prm1, 0.05, 1.0));

  // === SKY GRADIENT behind fog ===
  float skyGrad = smoothstep(-0.3, 0.5, rd.y);
  vec3 skyFinal = mix(skyColor * 0.6, skyColor, skyGrad);
  col = mix(skyFinal, col, scn.a);

  // === HORIZON GLOW (dawn breaking) ===
  vec3 hGlow = horizonGlow(p, energy, climaxTear, peakApproach);
  col += hGlow * (1.0 - scn.a * 0.6);

  // === GOLDEN LIGHT FLOODING THROUGH AT CLIMAX ===
  if (climaxTear > 0.1) {
    float floodNoise = fbm3(vec3(p * 3.0, time * 0.3));
    float floodMask = smoothstep(0.3, 0.7, floodNoise) * climaxTear;
    vec3 goldenFlood = vec3(1.0, 0.8, 0.4) * floodMask * 0.5;
    col += goldenFlood * (1.0 - scn.a * 0.5);
  }

  // === PEAK APPROACHING: anticipatory warmth on horizon ===
  if (peakApproach > 0.1) {
    float approachGlow = peakApproach * 0.15;
    col += vec3(0.4, 0.25, 0.1) * approachGlow * smoothstep(0.2, -0.1, p.y);
  }

  // Palette tinting
  float palMix = 0.1 + energy * 0.08;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.08) * 0.5 + 0.5), palMix);

  // Gamma / tone — slightly lifted for the foggy atmosphere
  col = pow(col, vec3(0.52, 0.58, 0.62)) * vec3(1.0, 0.98, 0.95);

  // Vignette — gentle
  vec2 q = vUv;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.08) * 0.8 + 0.2;

  // Beat pulse — very subtle for this contemplative shader
  col *= 1.0 + uBeatSnap * 0.04;

  // Onset: slight brightness increase
  col += vec3(0.8, 0.7, 0.5) * uOnsetSnap * 0.03 * energy;

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
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
