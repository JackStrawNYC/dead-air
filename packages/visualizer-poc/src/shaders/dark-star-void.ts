/**
 * Dark Star Void — inverted dark-matter clouds in deep space.
 * Protean Clouds engine (nimitz, CC BY-NC-SA 3.0) with INVERTED density:
 * clouds are dark matter, gaps reveal a star field. Deep indigo/violet/black
 * with nebula cores that shift color with spectral flux.
 *
 * Audio reactivity:
 *   uImprovisationScore -> turbulence amount (jams get wild)
 *   uSpectralFlux       -> nebula core color morphing
 *   uEnergy             -> movement speed, star brightness
 *   uHarmonicTension    -> nebula core intensity (tension = brighter cores)
 *   uSpaceScore         -> extreme slow drift, vast emptiness
 *   uClimaxIntensity    -> transcendent reveal — stars flood through
 *   uBass               -> dark matter pulsation (deep rumble)
 *   uTimbralBrightness  -> star field sparkle intensity
 *   uMelodicPitch       -> nebula color temperature (low=red, high=blue)
 *   uSemanticCosmic     -> amplifies all cosmic effects
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const darkStarVoidVert = /* glsl */ `
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
  caEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: false,
  eraGradingEnabled: true,
});

export const darkStarVoidFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _dsv_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _dsv_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _dsv_mag2(vec2 p) { return dot(p, p); }

float _dsv_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

float _dsv_prm1 = 0.0;
vec2  _dsv_bsMo = vec2(0);

// Displacement — slow cosmic drift
vec2 _dsv_disp(float t) {
  return vec2(sin(t * 0.12) * 2.0, cos(t * 0.09) * 1.5) * 1.8;
}

// Hash for star field
float _dsv_hash(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p.zxy, p.yxz + 19.19);
  return fract(p.x * p.y * p.z);
}

// Star field: scattered point lights in 3D grid cells
vec3 _dsv_stars(vec3 pos, float brightness, float timbral) {
  vec3 stars = vec3(0.0);
  vec3 cell = floor(pos);
  vec3 frac = fract(pos);

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 offset = vec3(float(x), float(y), float(z));
        vec3 cellId = cell + offset;
        float h = _dsv_hash(cellId);

        // Only ~20% of cells have stars
        if (h > 0.80) {
          vec3 starPos = offset + vec3(
            _dsv_hash(cellId + 1.0),
            _dsv_hash(cellId + 2.0),
            _dsv_hash(cellId + 3.0)
          ) * 0.8 + 0.1;

          float dist = length(frac - starPos);
          float starSize = 0.015 + h * 0.02 + timbral * 0.01;
          float star = smoothstep(starSize, starSize * 0.1, dist);

          // Star color: blue-white to warm gold, hash-seeded
          float starTemp = _dsv_hash(cellId + 7.0);
          vec3 starCol = mix(
            vec3(0.6, 0.7, 1.0),  // blue-white
            vec3(1.0, 0.85, 0.5), // warm gold
            starTemp
          );

          // Twinkle
          float twinkle = sin(uTime * (2.0 + h * 4.0) + h * 100.0) * 0.3 + 0.7;
          twinkle += timbral * 0.3;

          stars += starCol * star * brightness * twinkle;
        }
      }
    }
  }
  return stars;
}

// Density function — INVERTED: high density = dark matter, low density = gaps
vec2 _dsv_map(vec3 p, float improv) {
  vec3 p2 = p;
  p2.xy -= _dsv_disp(p.z).xy;

  // Rotation: slow normally, chaotic with improvisation
  float rotSpeed = 0.03 + improv * 0.12;
  p.xy *= _dsv_rot(sin(p.z * 0.3 + uTime * rotSpeed) * (0.1 + _dsv_prm1 * 0.05) + uTime * rotSpeed);
  float cl = _dsv_mag2(p2.xy);
  float d = 0.0;
  p *= 0.61;
  float z = 1.0;
  float trk = 1.0;
  float dspAmp = 0.1 + _dsv_prm1 * 0.2;

  // Improvisation drives turbulence wildly
  dspAmp += improv * 0.35;
  // Bass pulses dark matter
  dspAmp += uBass * 0.1;

  for (int i = 0; i < 5; i++) {
    p += sin(p.zxy * 0.75 * trk + uTime * trk * 0.3) * dspAmp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.57;
    trk *= 1.4;
    p = p * _dsv_m3;
  }
  d = abs(d + _dsv_prm1 * 3.0) + _dsv_prm1 * 0.3 - 2.5 + _dsv_bsMo.y;
  return vec2(d + cl * 0.2 + 0.25, cl);
}

vec4 _dsv_render(vec3 ro, vec3 rd, float time, float energy, float improv,
                 float tension, float climaxTear, float spectralFlux,
                 float melodicPitch, float timbral, float cosmic) {
  vec4 rez = vec4(0);
  const float ldst = 8.0;
  vec3 lpos = vec3(_dsv_disp(time + ldst) * 0.5, time + ldst);
  float t = 1.5;
  float fogT = 0.0;

  // Step count: more at peak for detail
  int maxSteps = 70 + int(energy * 50.0);

  // Accumulate star light seen through gaps
  vec3 starAccum = vec3(0.0);
  float gapAccum = 0.0;

  for (int i = 0; i < 120; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.99) break;

    vec3 pos = ro + t * rd;
    vec2 mpv = _dsv_map(pos, improv);

    // INVERTED density: where clouds AREN'T = stars visible
    float den = clamp(mpv.x - 0.3, 0.0, 1.0) * 1.12;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);
    float inverseDen = 1.0 - clamp(den * 2.0, 0.0, 1.0);

    // Stars seen through gaps in dark matter
    float gapVisibility = inverseDen * (1.0 - rez.a);
    if (gapVisibility > 0.01) {
      vec3 starField = _dsv_stars(pos * 3.0, 1.5 + energy * 2.0, timbral);
      starAccum += starField * gapVisibility * 0.15;
      gapAccum += gapVisibility * 0.05;
    }

    vec4 col = vec4(0);
    if (mpv.x > 0.6) {
      // Dark matter color: deep indigo, violet, black
      vec3 darkBase = sin(vec3(4.5, 3.2, 5.8) + mpv.y * 0.08 + sin(pos.z * 0.3) * 0.4 + 1.2) * 0.5 + 0.5;

      // Shift toward indigo/violet
      darkBase.r *= 0.3;
      darkBase.g *= 0.15;
      darkBase.b *= 0.7;

      col = vec4(darkBase, 0.08);
      col *= den * den * den;
      col.rgb *= _dsv_linstep(4.0, -2.5, mpv.x) * 2.3;

      // Lighting for dark matter tendrils
      float dif = clamp((den - _dsv_map(pos + vec3(0.8, 0.0, 0.0), improv).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _dsv_map(pos + vec3(0.0, 0.35, 0.0), improv).x) / 2.5, 0.001, 1.0);

      // Deep space ambient: indigo + violet
      vec3 ambientColor = vec3(0.008, 0.005, 0.025);
      vec3 difColor = vec3(0.02, 0.01, 0.05);
      col.xyz *= den * (ambientColor + 1.5 * difColor * dif);

      // === NEBULA CORES: bright emissive areas at density peaks ===
      float coreDensity = smoothstep(1.8, 3.0, mpv.x);
      if (coreDensity > 0.01) {
        // Core color shifts with spectral flux and melodic pitch
        float coreHue = spectralFlux * 2.0 + melodicPitch * 0.5 + pos.z * 0.1;
        vec3 coreColor = hsv2rgb(vec3(
          fract(coreHue * 0.3 + 0.7), // hue: violet-blue range, shifting
          0.6 + tension * 0.3,          // tension increases saturation
          0.5 + tension * 0.4 + cosmic * 0.3  // tension + cosmic = brighter cores
        ));

        // Emissive glow at cores
        float coreGlow = coreDensity * (0.3 + tension * 0.5 + energy * 0.3);
        col.rgb += coreColor * coreGlow * 0.15;
      }
    }

    // Deep space fog — very subtle indigo haze
    float fogC = exp(t * 0.15 - 2.5);
    col.rgba += vec4(0.02, 0.01, 0.04, 0.06) * clamp(fogC - fogT, 0.0, 1.0);
    fogT = fogC;

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.09, 0.3);
  }

  // Mix in stars accumulated through gaps
  rez.rgb += starAccum;

  // At climax: stars flood through everywhere
  if (climaxTear > 0.1) {
    float floodStars = climaxTear * (0.5 + energy * 0.5);
    rez.rgb += vec3(0.15, 0.12, 0.2) * floodStars * gapAccum * 3.0;
  }

  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _dsv_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _dsv_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_dsv_getsat(ic) - mix(_dsv_getsat(a), _dsv_getsat(b), x));
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
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float spectralFlux = clamp(uSpectralFlux, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbral = clamp(uTimbralBrightness, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxTear = isClimax * climaxIntensity;

  // Section type
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));

  // Time: extremely slow at low energy, faster during jams
  // Space sections and high spaceScore = near-frozen drift
  float spaceFreeze = mix(1.0, 0.08, max(sSpace, spaceScore));
  float jamAccel = mix(1.0, 2.5, sJam * improv);
  float timeScale = (0.5 + energy * 1.5) * spaceFreeze * jamAccel;
  float time = uDynamicTime * timeScale;

  // Camera: drifting through infinite void
  vec3 ro = vec3(0.0, 0.0, time);
  // Slow cosmic wander
  ro.x += sin(uTime * 0.04) * 1.5;
  ro.y += cos(uTime * 0.03) * 1.0;
  ro.xy += _dsv_disp(ro.z) * 0.85;

  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_dsv_disp(time + tgtDst) * 0.85, time + tgtDst));
  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);

  // Gentle camera roll for cosmic disorientation
  float rollAngle = sin(uTime * 0.02) * 0.1 + improv * sin(uTime * 0.08) * 0.15;
  rd.xy *= _dsv_rot(rollAngle);

  // Audio-reactive density parameters
  _dsv_prm1 = smoothstep(-0.4, 0.4, sin(uTime * 0.15));
  // Bass pulses dark matter
  _dsv_prm1 += bass * 0.25;
  // Improvisation thickens and distorts
  _dsv_prm1 += improv * 0.3;
  // Climax: dark matter dissipates, revealing the cosmos
  _dsv_prm1 -= climaxTear * 0.7;
  // Space: thin, vast, empty
  _dsv_prm1 *= mix(1.0, 0.4, max(sSpace, spaceScore));
  // Cosmic semantic boost
  _dsv_prm1 += cosmic * 0.1;

  vec4 scn = _dsv_render(ro, rd, time, energy, improv, tension, climaxTear,
                          spectralFlux, melodicPitch, timbral, cosmic);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend
  col = _dsv_iLerp(col.bgr, col.rgb, clamp(1.0 - _dsv_prm1, 0.05, 1.0));

  // === DEEP SPACE BACKGROUND ===
  float bgGrad = length(p) * 0.3;
  vec3 bgColor = mix(
    vec3(0.02, 0.01, 0.06),  // deep indigo center
    vec3(0.0, 0.0, 0.02),     // near-black edges
    bgGrad
  );
  col = mix(bgColor, col, max(scn.a, 0.1));

  // === DISTANT NEBULA GLOW (background atmosphere) ===
  float nebulaGlow = fbm3(vec3(p * 1.5, time * 0.05));
  float nebulaHue = fract(spectralFlux * 0.5 + melodicPitch * 0.3 + 0.7);
  vec3 nebulaColor = hsv2rgb(vec3(nebulaHue, 0.5, 0.15)) * nebulaGlow;
  col += nebulaColor * (0.1 + cosmic * 0.15) * (1.0 - scn.a * 0.8);

  // === TRANSCENDENT CLIMAX: vast star field revelation ===
  if (climaxTear > 0.3) {
    float revealNoise = fbm(vec3(rd * 5.0 + time * 0.1));
    float reveal = smoothstep(0.3, 0.8, climaxTear) * revealNoise;
    vec3 transcendent = hsv2rgb(vec3(
      fract(0.7 + spectralFlux * 0.2),
      0.3,
      0.8
    ));
    col += transcendent * reveal * 0.3;
  }

  // Palette tinting — subtle, respect the void
  vec3 palCol1 = paletteHueColor(uPalettePrimary, 0.85, 0.85);
  vec3 palCol2 = paletteHueColor(uPaletteSecondary, 0.85, 0.85);
  float palMix = 0.08 + energy * 0.30;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.06) * 0.5 + 0.5), palMix);

  // Gamma — deep, rich, dark
  col = pow(col, vec3(0.6, 0.62, 0.55)) * vec3(0.95, 0.93, 1.0);

  // Vignette — strong for infinite void feeling
  vec2 q = vUv;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.15) * 0.75 + 0.25;

  // Beat pulse — deep, subterranean
  col *= 1.0 + uBeatSnap * 0.05;

  // Spectral flux color shimmer
  if (spectralFlux > 0.3) {
    vec3 hsvCol = rgb2hsv(col);
    hsvCol.x = fract(hsvCol.x + spectralFlux * 0.05 * sin(uTime * 0.5));
    col = hsv2rgb(hsvCol);
  }

  // Chroma hue modulation
  if (abs(uChromaHue) > 0.01) {
    vec3 hsvCol = rgb2hsv(col);
    hsvCol.x = fract(hsvCol.x + uChromaHue * 0.1);
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
