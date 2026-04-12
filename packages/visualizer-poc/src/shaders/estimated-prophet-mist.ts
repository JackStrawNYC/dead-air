/**
 * Estimated Prophet Ocean Mist — horizontal sea spray and ocean fog.
 * Protean Clouds engine (nimitz, CC BY-NC-SA 3.0) with horizontal wind
 * displacement, wave motion, and oceanic color palette. Camera at sea level
 * looking across churning ocean surface.
 *
 * Audio reactivity:
 *   uBass              -> horizontal wind speed (drives mist left to right)
 *   uStemVocalRms      -> thickens the mist (vocals = fog rolls in)
 *   uVocalPresence     -> secondary mist thickening
 *   uHighs             -> fine spray/sparkle particles in the mist
 *   uEnergy            -> wave motion intensity, spray brightness
 *   uClimaxIntensity   -> mist parts revealing vast ocean vista
 *   uSlowEnergy        -> swell period (long wave undulation)
 *   uBeatSnap          -> wave crash timing
 *   uMelodicPitch      -> teal vs. silver color temperature
 *   uHarmonicTension   -> storm darkening (tension = darker sky)
 *   uSemanticAmbient   -> amplifies mysterious, prophetic atmosphere
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const estimatedProphetMistVert = /* glsl */ `
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
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
});

export const estimatedProphetMistFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _epm_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _epm_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _epm_mag2(vec2 p) { return dot(p, p); }

float _epm_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

float _epm_prm1 = 0.0;
vec2  _epm_bsMo = vec2(0);

// Displacement — strong horizontal (wind-driven), gentle vertical (swells)
vec2 _epm_disp(float t, float windSpeed) {
  return vec2(
    sin(t * 0.15) * 1.2 + t * windSpeed * 0.3,
    cos(t * 0.1) * 0.4
  ) * 1.5;
}

// Ocean wave surface — Gerstner-style undulation beneath the fog
float _epm_waveHeight(vec2 xz, float time, float slowE) {
  float h = 0.0;
  // Primary swell
  float swellPeriod = 3.0 + slowE * 2.0;
  h += sin(xz.x * 0.8 + time * swellPeriod * 0.15) * 0.3;
  h += sin(xz.x * 1.2 + xz.y * 0.6 + time * swellPeriod * 0.2) * 0.15;
  // Secondary chop
  h += sin(xz.x * 3.0 + xz.y * 1.5 + time * 0.5) * 0.06;
  h += sin(xz.x * 5.0 - xz.y * 2.0 + time * 0.8) * 0.03;
  return h;
}

// Spray particles — fine water droplets catching light
vec3 _epm_spray(vec3 pos, float highs, float energy) {
  vec3 spray = vec3(0.0);
  vec3 cell = floor(pos * 6.0);
  vec3 frac = fract(pos * 6.0);

  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  if (h > 0.82) {
    vec3 sprayPos = vec3(
      fract(sin(dot(cell + 1.0, vec3(269.5, 183.3, 246.1))) * 43758.5453),
      fract(sin(dot(cell + 2.0, vec3(113.5, 271.9, 124.6))) * 43758.5453),
      fract(sin(dot(cell + 3.0, vec3(419.2, 371.9, 281.6))) * 43758.5453)
    ) * 0.6 + 0.2;

    float dist = length(frac - sprayPos);
    float spraySize = 0.08 + highs * 0.06;
    float sprayAmt = exp(-dist * dist / (spraySize * spraySize));

    // Spray color: white/silver with slight teal tint
    vec3 sprayColor = vec3(0.8, 0.9, 0.95);
    float shimmer = sin(uTime * (6.0 + h * 10.0) + h * 80.0) * 0.4 + 0.6;

    spray += sprayColor * sprayAmt * highs * shimmer * (0.3 + energy * 0.5);
  }
  return spray;
}

// Density function — horizontal wind bias and wave-coupled fog
vec2 _epm_map(vec3 p, float windSpeed, float vocalThicken) {
  vec3 p2 = p;
  p2.xy -= _epm_disp(p.z, windSpeed).xy;

  // Horizontal shear rotation — wind-driven
  float shear = windSpeed * 0.08 + 0.03;
  p.xy *= _epm_rot(sin(p.z * 0.4 + p.x * 0.2) * shear + uTime * 0.04);
  float cl = _epm_mag2(p2.xy);
  float d = 0.0;
  p *= 0.61;
  float z = 1.0;
  float trk = 1.0;
  float dspAmp = 0.1 + _epm_prm1 * 0.2;

  // Wind drives horizontal displacement
  dspAmp += windSpeed * 0.15;
  // Vocal thickening adds density
  dspAmp += vocalThicken * 0.1;

  for (int i = 0; i < 5; i++) {
    // Horizontal bias in displacement — x/z components dominate
    vec3 disp = sin(p.zxy * 0.75 * trk + uTime * trk * 0.4) * dspAmp;
    disp.y *= 0.4; // suppress vertical displacement
    disp.x *= 1.5; // enhance horizontal wind
    p += disp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.57;
    trk *= 1.4;
    p = p * _epm_m3;
  }
  d = abs(d + _epm_prm1 * 3.0) + _epm_prm1 * 0.3 - 2.5 + _epm_bsMo.y;
  return vec2(d + cl * 0.2 + 0.25, cl);
}

vec4 _epm_render(vec3 ro, vec3 rd, float time, float energy, float windSpeed,
                 float vocalThicken, float climaxPart, float highs,
                 float slowE, vec3 mistColor, vec3 oceanColor) {
  vec4 rez = vec4(0);
  const float ldst = 8.0;
  vec3 lpos = vec3(_epm_disp(time + ldst, windSpeed) * 0.5, time + ldst);
  float t = 1.5;
  float fogT = 0.0;

  int maxSteps = 65 + int(energy * 45.0);

  // Light: diffuse overcast sky with occasional bright patches
  vec3 skyLightDir = normalize(vec3(0.3, 0.8, -0.2));

  for (int i = 0; i < 110; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.99) break;

    vec3 pos = ro + t * rd;

    // Sea-level mask: fog hugs the ocean surface
    // Wave height modulates the fog floor
    float waveH = _epm_waveHeight(pos.xz, time, slowE);
    float seaMask = smoothstep(waveH - 0.3, waveH + 1.5, pos.y);
    seaMask *= smoothstep(3.0, 1.0, pos.y); // fade above 3 units
    // Vocal thickens: raise the fog ceiling
    seaMask *= 1.0 + vocalThicken * 0.3;

    // Climax: mist parts
    if (climaxPart > 0.1) {
      float partNoise = snoise(pos * 0.8 + vec3(time * 0.3, 0.0, time * 0.2));
      seaMask *= mix(1.0, smoothstep(-0.3, 0.5, partNoise), climaxPart);
    }

    vec2 mpv = _epm_map(pos, windSpeed, vocalThicken);
    float den = clamp(mpv.x - 0.3, 0.0, 1.0) * 1.12;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    // Apply sea mask
    den *= seaMask;

    vec4 col = vec4(0);
    if (mpv.x > 0.6) {
      col = vec4(
        sin(vec3(4.0, 3.5, 5.0) + mpv.y * 0.1 + sin(pos.z * 0.3) * 0.4 + 1.5) * 0.5 + 0.5,
        0.08
      );
      col *= den * den * den;
      col.rgb *= _epm_linstep(4.0, -2.5, mpv.x) * 2.3;

      // Diffuse sky lighting
      float dif = clamp((den - _epm_map(pos + vec3(0.0, 0.8, 0.0), windSpeed, vocalThicken).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _epm_map(pos + vec3(0.35, 0.0, 0.0), windSpeed, vocalThicken).x) / 2.5, 0.001, 1.0);

      // Ocean mist colors: teal, silver, white foam
      vec3 ambientColor = vec3(0.015, 0.025, 0.03);
      vec3 difColor = vec3(0.03, 0.05, 0.055);
      col.xyz *= den * (ambientColor + 1.5 * difColor * dif);

      // Tint with mist color
      col.rgb = mix(col.rgb, col.rgb * mistColor, 0.35);

      // Forward scatter from sky
      float skyDot = max(0.0, dot(rd, skyLightDir));
      float scatter = pow(skyDot, 3.0) * 0.2;
      col.rgb += vec3(0.7, 0.75, 0.8) * scatter * den * 0.04;
    }

    // Oceanic atmospheric fog
    float fogC = exp(t * 0.18 - 2.2);
    vec4 fogLayer = vec4(mistColor * 0.05, 0.08) * clamp(fogC - fogT, 0.0, 1.0);
    col.rgba += fogLayer;
    fogT = fogC;

    // Spray particles
    if (highs > 0.2) {
      vec3 sprayGlow = _epm_spray(pos, highs, energy);
      col.rgb += sprayGlow * (1.0 - rez.a) * 0.06;
    }

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.09, 0.3);
  }
  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _epm_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _epm_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_epm_getsat(ic) - mix(_epm_getsat(a), _epm_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

// Ocean surface visible through mist breaks
vec3 oceanSurface(vec2 p, float time, float energy, float slowE, vec3 oceanColor) {
  // Deep ocean blue with wave pattern
  float wave1 = sin(p.x * 4.0 + time * 0.3) * 0.5 + 0.5;
  float wave2 = sin(p.x * 7.0 + p.y * 3.0 + time * 0.5) * 0.5 + 0.5;
  float wavePattern = wave1 * 0.6 + wave2 * 0.4;

  // Foam at wave crests
  float foam = smoothstep(0.7, 0.95, wavePattern) * (0.3 + energy * 0.3);
  vec3 foamColor = vec3(0.8, 0.85, 0.9);

  // Deep teal ocean with surface reflection
  vec3 deepOcean = oceanColor * (0.15 + wavePattern * 0.1);
  float fresnel = pow(1.0 - abs(p.y + 0.1), 3.0) * 0.3;
  deepOcean += vec3(0.1, 0.15, 0.2) * fresnel;

  return mix(deepOcean, foamColor, foam);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float vocalRms = clamp(uStemVocalRms, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float ambient = clamp(uSemanticAmbient, 0.0, 1.0);
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxPart = isClimax * climaxIntensity;

  // Section type
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);

  // Wind speed driven by bass
  float windSpeed = 0.3 + bass * 1.5 + energy * 0.5;
  windSpeed *= mix(1.0, 1.4, sJam);
  windSpeed *= mix(1.0, 0.4, sSpace);

  // Vocal thickening: vocals = fog rolls in
  float vocalThicken = max(vocalRms, vocalPres) * 0.8;
  vocalThicken += ambient * 0.2;

  // Time: rhythmic with wave motion
  float timeScale = 1.5 + energy * 1.0 + windSpeed * 0.3;
  float time = uDynamicTime * timeScale;

  // Colors: teal, silver, white — melodic pitch shifts temperature
  // Low pitch = deeper teal, high pitch = silver/white
  vec3 mistColor = mix(
    vec3(0.3, 0.55, 0.55),  // deep teal
    vec3(0.65, 0.7, 0.75),   // silver
    melodicPitch * 0.6
  );
  // Tension darkens (storm approaching)
  mistColor *= mix(1.0, 0.6, tension);
  // Ambient enhances mystery
  mistColor *= mix(1.0, 0.85, ambient);

  vec3 oceanColor = mix(
    vec3(0.02, 0.08, 0.15),  // deep ocean blue
    vec3(0.05, 0.15, 0.2),    // lighter teal
    energy * 0.4
  );

  // Palette integration
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(hue1, 0.7, 0.85);
  vec3 palCol2 = paletteHueColor(hue2, 0.7, 0.85);

  // Camera: sea level, looking across the ocean surface
  vec3 ro = vec3(0.0, 0.3, time);
  // Wave-coupled sway
  float sway = sin(uTime * 0.12 + slowE) * 0.15;
  ro.x += sway + sin(uTime * 0.07) * 0.2;
  ro.y += sin(uTime * 0.09) * 0.08 + _epm_waveHeight(ro.xz, time, slowE) * 0.15;
  ro.xy += _epm_disp(ro.z, windSpeed) * 0.5;

  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_epm_disp(time + tgtDst, windSpeed) * 0.5, time + tgtDst));
  // Look slightly down toward ocean surface
  target.y -= 0.08;
  target = normalize(target);

  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);

  // Gentle roll from wave motion
  float rollAngle = sin(uTime * 0.08 + slowE * 2.0) * 0.04;
  rd.xy *= _epm_rot(rollAngle);

  // Audio-reactive density parameters
  _epm_prm1 = smoothstep(-0.4, 0.4, sin(uTime * 0.15));
  _epm_prm1 += vocalThicken * 0.3;
  _epm_prm1 += bass * 0.30;
  // Beat crashes thicken momentarily
  _epm_prm1 += uBeatSnap * 0.2;
  // Climax parts the mist
  _epm_prm1 -= climaxPart * 0.6;
  // Space: thin, mysterious
  _epm_prm1 *= mix(1.0, 0.4, sSpace);
  // Jam: thicker, more chaotic
  _epm_prm1 += sJam * 0.15;

  vec4 scn = _epm_render(ro, rd, time, energy, windSpeed, vocalThicken,
                          climaxPart, highs, slowE, mistColor, oceanColor);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend
  col = _epm_iLerp(col.bgr, col.rgb, clamp(1.0 - _epm_prm1, 0.05, 1.0));

  // === OCEAN BACKGROUND visible through mist gaps ===
  vec3 oceanBg = oceanSurface(p, time, energy, slowE, oceanColor);

  // Sky gradient: stormy gray-blue, darker with tension
  float skyGrad = smoothstep(-0.1, 0.5, rd.y);
  vec3 skyColor = mix(
    vec3(0.12, 0.14, 0.18),
    vec3(0.25, 0.28, 0.35),
    skyGrad
  );
  skyColor *= mix(1.0, 0.5, tension); // storm darkening

  // Mix ocean below horizon, sky above
  float horizonLine = smoothstep(-0.05, 0.05, rd.y);
  vec3 bgColor = mix(oceanBg, skyColor, horizonLine);
  col = mix(bgColor, col, scn.a);

  // === OCEAN VISTA AT CLIMAX ===
  if (climaxPart > 0.2) {
    // Vast ocean reveal — bright patches of sunlight on water
    float sunPatch = fbm3(vec3(p * 3.0 + vec2(time * 0.2, 0.0), time * 0.1));
    float sunMask = smoothstep(0.4, 0.8, sunPatch) * climaxPart;
    vec3 sunlitOcean = vec3(0.15, 0.3, 0.35) * (1.0 + sunMask * 0.5);
    col += sunlitOcean * (1.0 - scn.a) * climaxPart * 0.4;

    // Distant horizon glow
    float horizGlow = exp(-abs(p.y + 0.02) * 15.0) * climaxPart;
    col += vec3(0.4, 0.5, 0.55) * horizGlow * 0.15;
  }

  // === WAVE CRASH BRIGHTNESS on beat ===
  float crashBrightness = uBeatSnap * energy * 0.20;
  float crashMask = smoothstep(0.1, -0.2, p.y);
  col += vec3(0.5, 0.55, 0.6) * crashBrightness * crashMask;

  // === PROPHETIC ATMOSPHERE (ambient semantic) ===
  if (ambient > 0.2) {
    float mysteryGlow = fbm3(vec3(p * 2.0, time * 0.08));
    vec3 mysteryColor = mix(
      vec3(0.1, 0.2, 0.25),
      vec3(0.2, 0.25, 0.3),
      mysteryGlow
    );
    col += mysteryColor * ambient * 0.06 * (1.0 - scn.a * 0.5);
  }

  // Palette tinting
  float palMix = 0.12 + energy * 0.20;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.1) * 0.5 + 0.5), palMix);

  // Gamma — cool, oceanic
  col = pow(col, vec3(0.58, 0.55, 0.52)) * vec3(0.95, 0.97, 1.0);

  // Vignette — moderate, atmospheric
  vec2 q = vUv;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.1) * 0.8 + 0.2;

  // Beat pulse — rhythmic wave energy
  col *= 1.0 + uBeatSnap * 0.06;

  // Onset shimmer
  col += vec3(0.5, 0.6, 0.65) * uOnsetSnap * 0.04 * energy;

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
