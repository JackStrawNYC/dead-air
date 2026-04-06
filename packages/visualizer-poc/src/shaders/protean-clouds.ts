/**
 * Protean Clouds — ported from nimitz (Shadertoy)
 * Source: https://www.shadertoy.com/view/3l23Rh
 * License: CC BY-NC-SA 3.0
 *
 * World-class volumetric raymarching with turbulent cloud density,
 * forward scattering, fog accumulation, and saturation-preserving color lerp.
 * Audio-reactive: energy drives density/speed, bass drives turbulence,
 * onsets trigger density bursts, climax tears clouds apart.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const proteanCloudsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  halationEnabled: true,
  bloomEnabled: false,
  caEnabled: false,
  dofEnabled: false,
  lensDistortionEnabled: false,
  lightLeakEnabled: false,
  beatPulseEnabled: false,
});

export const proteanCloudsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _pc_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _pc_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _pc_mag2(vec2 p) { return dot(p, p); }

float _pc_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

float _pc_prm1 = 0.0;
vec2 _pc_bsMo = vec2(0);

vec2 _pc_disp(float t) {
  return vec2(sin(t * 0.22) * 1.0, cos(t * 0.175) * 1.0) * 2.0;
}

vec2 _pc_map(vec3 p) {
  vec3 p2 = p;
  p2.xy -= _pc_disp(p.z).xy;
  p.xy *= _pc_rot(sin(p.z + uTime) * (0.1 + _pc_prm1 * 0.05) + uTime * 0.09);
  float cl = _pc_mag2(p2.xy);
  float d = 0.0;
  p *= 0.61;
  float z = 1.0;
  float trk = 1.0;
  float dspAmp = 0.1 + _pc_prm1 * 0.2;

  // Gentle bass influence on turbulence — not per-frame, use slow energy
  dspAmp += uSlowEnergy * 0.05;

  for (int i = 0; i < 5; i++) {
    p += sin(p.zxy * 0.75 * trk + uTime * trk * 0.8) * dspAmp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.57;
    trk *= 1.4;
    p = p * _pc_m3;
  }
  d = abs(d + _pc_prm1 * 3.0) + _pc_prm1 * 0.3 - 2.5 + _pc_bsMo.y;
  return vec2(d + cl * 0.2 + 0.25, cl);
}

vec4 _pc_render(vec3 ro, vec3 rd, float time) {
  vec4 rez = vec4(0);
  const float ldst = 8.0;
  vec3 lpos = vec3(_pc_disp(time + ldst) * 0.5, time + ldst);
  float t = 1.5;
  float fogT = 0.0;

  // Step count: 40 base, up to 60 at peak
  float energy = clamp(uEnergy, 0.0, 1.0);
  int maxSteps = 40 + int(energy * 20.0);

  for (int i = 0; i < 60; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.99) break;

    vec3 pos = ro + t * rd;
    vec2 mpv = _pc_map(pos);
    float den = clamp(mpv.x - 0.3, 0.0, 1.0) * 1.12;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    vec4 col = vec4(0);
    if (mpv.x > 0.6) {
      col = vec4(
        sin(vec3(5.0, 0.4, 0.2) + mpv.y * 0.1 + sin(pos.z * 0.4) * 0.5 + 1.8) * 0.5 + 0.5,
        0.08
      );
      col *= den * den * den;
      col.rgb *= _pc_linstep(4.0, -2.5, mpv.x) * 2.3;
      float dif = clamp((den - _pc_map(pos + 0.8).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _pc_map(pos + 0.35).x) / 2.5, 0.001, 1.0);
      col.xyz *= den * (vec3(0.005, 0.045, 0.075) + 1.5 * vec3(0.033, 0.07, 0.03) * dif);
    }

    float fogC = exp(t * 0.2 - 2.2);
    col.rgba += vec4(0.06, 0.11, 0.11, 0.1) * clamp(fogC - fogT, 0.0, 1.0);
    fogT = fogC;

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.09, 0.3);
  }
  return clamp(rez, 0.0, 1.0);
}

float _pc_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

// Saturation-preserving interpolation (nimitz)
vec3 _pc_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_pc_getsat(ic) - mix(_pc_getsat(a), _pc_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);

  // Time: SLOW. Clouds drift like breathing, not racing.
  float timeScale = 0.8 + slowE * 0.3 + energy * 0.4;
  float time = uDynamicTime * timeScale;

  // Palette from song identity
  float hue1 = hsvToCosineHue(uPalettePrimary);
  float hue2 = hsvToCosineHue(uPaletteSecondary);

  // === SECTION-TYPE MODULATION ===
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);

  // Camera setup
  vec3 ro = vec3(0, 0, time);
  ro += vec3(sin(uTime) * 0.5, sin(uTime * 1.0) * 0.0, 0);
  float dspAmp = 0.85;
  ro.xy += _pc_disp(ro.z) * dspAmp;
  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_pc_disp(time + tgtDst) * dspAmp, time + tgtDst));
  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);
  rd.xy *= _pc_rot(-_pc_disp(time + 3.5).x * 0.2);

  // Cloud density: gentle, organic. NO sudden bursts.
  _pc_prm1 = smoothstep(-0.4, 0.4, sin(uTime * 0.1));
  // Bass gently thickens clouds
  _pc_prm1 += bass * 0.1;
  // Slow energy is the mood — no onset/beat reactivity on density
  _pc_prm1 += slowE * 0.15;
  // Climax: clouds open up slowly
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  _pc_prm1 -= isClimax * uClimaxIntensity * 0.3;

  // Space sections: minimal, ethereal
  _pc_prm1 *= mix(1.0, 0.5, sSpace);

  vec4 scn = _pc_render(ro, rd, time);
  vec3 col = scn.rgb;

  // Original nimitz color processing — no palette override, no icons
  col = _pc_iLerp(col.bgr, col.rgb, clamp(1.0 - _pc_prm1, 0.05, 1.0));

  // Original nimitz gamma/tone
  col = pow(col, vec3(0.55, 0.65, 0.6)) * vec3(1.0, 0.97, 0.9);

  // Original nimitz vignette
  vec2 q = vUv;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.12) * 0.7 + 0.3;

  // Grain only — no other post-processing
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
