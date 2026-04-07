/**
 * Seascape -- realistic ocean surface with sky, sun, and subsurface scattering.
 * Ported from Alexander Alekseev / TDM's "Seascape" (Shadertoy Ms2SD1) -- CC BY-NC-SA 3.0.
 *
 * Raymarching against an iterated octave-layered ocean height field.
 * Choppy wave function via abs(sin) folding with rotation between octaves.
 * Fresnel reflection, subsurface scattering, atmospheric sky, sun disc.
 *
 * Audio reactivity:
 *   uBass          -> wave height + choppiness (Phil's bass = the swell)
 *   uEnergy        -> wind speed / wave frequency
 *   uSlowEnergy    -> swell period (long-wave undulation)
 *   uOnsetSnap     -> splash / foam burst on wave crests
 *   uHighs         -> surface sparkle (sun glints, specular sharpness)
 *   uBeatSnap      -> gentle wave pulse
 *   uVocalPresence -> mist/spray above waterline
 *   uClimaxIntensity -> storm intensity (rougher sea, darker sky)
 *   uMelodicPitch  -> sky color temperature (warm sunset vs cool dawn)
 *   uHarmonicTension -> water darkness/murkiness
 *   uSpectralFlux  -> foam amount on wave crests
 *   uSectionType   -> jam=rough seas, space=glassy calm, chorus=sparkling
 *   uPalettePrimary/Secondary -> palette integration
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const seascapeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const seascapeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', halationEnabled: true, caEnabled: true, bloomEnabled: true, bloomThresholdOffset: -0.08, lightLeakEnabled: true })}

varying vec2 vUv;

#define _SS_PI 3.14159265
#define _SS_TAU 6.28318530
#define _SS_EPSILON 1e-3
#define _SS_ITER_GEOMETRY 4
#define _SS_ITER_FRAGMENT 6
#define _SS_RAYMARCH_STEPS 12

// ---------------------------------------------------------------
// 2D hash for cheap noise in wave displacement
// ---------------------------------------------------------------
float _ss_hash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

// ---------------------------------------------------------------
// Value noise for wave displacement
// ---------------------------------------------------------------
float _ss_noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return -1.0 + 2.0 * mix(
    mix(_ss_hash(i + vec2(0.0, 0.0)), _ss_hash(i + vec2(1.0, 0.0)), u.x),
    mix(_ss_hash(i + vec2(0.0, 1.0)), _ss_hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// ---------------------------------------------------------------
// Choppy wave octave: the heart of the ocean.
// abs(sin()) folding creates sharp crests, mix with cos for chop.
// ---------------------------------------------------------------
float _ss_seaOctave(vec2 uv, float choppy) {
  uv += _ss_noise2d(uv);
  vec2 wv = 1.0 - abs(sin(uv));
  vec2 swv = abs(cos(uv));
  wv = mix(wv, swv, wv);
  return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
}

// ---------------------------------------------------------------
// Inter-octave rotation matrix: decorrelates successive octaves
// for realistic multi-scale wave interference patterns.
// ---------------------------------------------------------------
mat2 _ss_octaveRot = mat2(1.6, 1.2, -1.2, 1.6);

// ---------------------------------------------------------------
// Ocean height map: layered octaves with rotation between each.
// ITER controls detail level (geometry vs fragment shading).
// ---------------------------------------------------------------
float _ss_map(vec3 pos, int iters, float seaTime, float freq, float amp,
              float choppy, float height) {
  float h = 0.0;
  vec2 uv = pos.xz;
  uv.x *= 0.75;

  // Primary swell direction
  float d = 0.0;
  float localFreq = freq;
  float localAmp = amp;
  float localChop = choppy;

  for (int i = 0; i < _SS_ITER_FRAGMENT; i++) {
    if (i >= iters) break;
    d = _ss_seaOctave((uv + seaTime) * localFreq, localChop);
    d += _ss_seaOctave((uv - seaTime) * localFreq, localChop);
    h += d * localAmp;
    uv *= _ss_octaveRot;
    localFreq *= 1.9;
    localAmp *= 0.22;
    localChop = mix(localChop, 1.0, 0.2);
  }

  return pos.y - (h + height);
}

// ---------------------------------------------------------------
// Cheap height-only version for geometry marching (fewer iters).
// ---------------------------------------------------------------
float _ss_mapGeom(vec3 pos, float seaTime, float freq, float amp,
                  float choppy, float height) {
  return _ss_map(pos, _SS_ITER_GEOMETRY, seaTime, freq, amp, choppy, height);
}

// ---------------------------------------------------------------
// Detailed version for fragment shading (more octave iters).
// ---------------------------------------------------------------
float _ss_mapDetailed(vec3 pos, float seaTime, float freq, float amp,
                      float choppy, float height) {
  return _ss_map(pos, _SS_ITER_FRAGMENT, seaTime, freq, amp, choppy, height);
}

// ---------------------------------------------------------------
// Normal estimation from height-field central differences.
// ---------------------------------------------------------------
vec3 _ss_getNormal(vec3 pos, float eps, float seaTime, float freq,
                   float amp, float choppy, float height) {
  vec3 n;
  n.y = _ss_mapDetailed(pos, seaTime, freq, amp, choppy, height);
  n.x = _ss_mapDetailed(vec3(pos.x + eps, pos.y, pos.z), seaTime, freq, amp, choppy, height) - n.y;
  n.z = _ss_mapDetailed(vec3(pos.x, pos.y, pos.z + eps), seaTime, freq, amp, choppy, height) - n.y;
  n.y = eps;
  return normalize(n);
}

// ---------------------------------------------------------------
// Sky: atmospheric gradient with sun disc.
// ---------------------------------------------------------------
vec3 _ss_getSky(vec3 rd, vec3 sunDir, vec3 skyCol, vec3 sunCol, float sunSize) {
  // Sky gradient: horizon warm, zenith cool
  float sunAlignment = max(dot(rd, sunDir), 0.0);
  float zenith = max(rd.y, 0.0);

  vec3 sky = skyCol;
  // Horizon glow
  sky = mix(sky * 1.4, skyCol * 0.5, pow(zenith, 0.4));
  // Sun haze (atmospheric scattering around sun)
  sky += sunCol * pow(sunAlignment, 3.0) * 0.4;
  // Sun disc with soft edge
  sky += sunCol * pow(sunAlignment, max(sunSize, 8.0)) * 2.0;
  // Sun core
  sky += vec3(1.0, 0.95, 0.85) * pow(sunAlignment, max(sunSize * 4.0, 32.0)) * 3.0;

  return sky;
}

// ---------------------------------------------------------------
// Fresnel: Schlick approximation for ocean-air boundary.
// ---------------------------------------------------------------
float _ss_fresnel(vec3 normal, vec3 viewDir, float power) {
  return pow(clamp(1.0 - dot(normal, -viewDir), 0.0, 1.0), power);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === CLAMP AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === OCEAN PARAMETERS (audio-driven) ===
  // Sea time: slow energy controls swell period
  float seaTime = uDynamicTime * (0.6 + slowE * 0.4 + energy * 0.3);
  seaTime *= mix(1.0, 0.4, sSpace);  // space: very slow waves
  seaTime *= mix(1.0, 1.4, sJam);    // jam: rougher, faster

  // Wave height: bass is the swell
  float seaHeight = 0.4 + bass * 0.55 + slowE * 0.15;
  seaHeight += climaxBoost * 0.3;
  seaHeight *= mix(1.0, 0.35, sSpace);  // space: glassy calm
  seaHeight *= mix(1.0, 1.3, sJam);     // jam: heavy seas
  // Beat pulse on wave height
  float bpH = beatPulseHalf(uMusicalTime);
  seaHeight += bpH * 0.06 + beatSnap * 0.08;

  // Choppiness: energy + storm intensity
  float choppy = 2.0 + energy * 2.5 + onset * 1.5 + climaxBoost * 1.5;
  choppy *= mix(1.0, 0.3, sSpace);   // space: smooth
  choppy *= mix(1.0, 1.4, sJam);     // jam: rough chop

  // Wave frequency: energy drives wind speed
  float freq = 0.14 + energy * 0.06 + highs * 0.03;

  // Amplitude per octave
  float amp = 0.6 + bass * 0.2;

  // === SUN AND SKY ===
  // Sun position: slow drift with melodic pitch driving elevation
  float sunAngle = uDynamicTime * 0.02 + 0.5;
  float sunElev = 0.2 + pitch * 0.35;  // high pitch = higher sun
  vec3 sunDir = normalize(vec3(cos(sunAngle), sunElev, sin(sunAngle)));

  // Sky color: pitch drives warm (sunset) vs cool (dawn)
  float warmth = mix(0.3, 0.8, pitch);
  vec3 skyWarm = vec3(0.45, 0.35, 0.65);  // dusk purple
  vec3 skyCool = vec3(0.25, 0.45, 0.75);  // dawn blue
  vec3 skyCol = mix(skyCool, skyWarm, warmth);
  // Storm darkening
  float stormDark = climaxBoost * 0.5 + tension * 0.2;
  skyCol *= 1.0 - stormDark * 0.4;

  // Sun color
  vec3 sunCol = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.55, 0.3), warmth);
  float sunSize = mix(128.0, 48.0, climaxBoost); // larger during storm

  // === PALETTE COLORS ===
  float hue1 = uPalettePrimary;
  vec3 palCol1 = paletteHueColor(hue1, 0.7, 0.9);
  float hue2 = uPaletteSecondary;
  vec3 palCol2 = paletteHueColor(hue2, 0.7, 0.9);

  // Water body color: palette-tinted deep ocean
  vec3 waterBase = vec3(0.02, 0.12, 0.22);
  waterBase = mix(waterBase, palCol1 * 0.3, 0.25);
  // Tension darkens water (murky)
  waterBase *= 1.0 - tension * 0.3;

  // Water diffuse (subsurface scatter tint)
  vec3 waterDiffuse = vec3(0.01, 0.08, 0.12);
  waterDiffuse = mix(waterDiffuse, palCol2 * 0.15, 0.2);

  // === CAMERA ===
  // Eye height bobs with slow energy; onset drops closer to surface
  float eyeHeight = 3.2 + slowE * 0.8 - onset * 0.6;
  eyeHeight = mix(eyeHeight, eyeHeight + 1.5, sSpace); // higher in space = serene overview
  vec3 ro = vec3(0.0, eyeHeight, uDynamicTime * 1.5);

  // Look direction: slight pitch down toward horizon
  float lookDown = -0.12 - bass * 0.04;
  vec3 lookTarget = vec3(sin(uDynamicTime * 0.04) * 0.3, lookDown, 1.0);
  vec3 rd = normalize(vec3(p.x * aspect.x, p.y + lookDown + 0.3, -1.5));

  // Apply gentle camera sway
  float swayX = sin(uDynamicTime * 0.3) * 0.02 * slowE;
  float swayY = cos(uDynamicTime * 0.25) * 0.015 * slowE;
  rd.x += swayX;
  rd.y += swayY;
  rd = normalize(rd);

  // === SKY RENDERING ===
  vec3 col = _ss_getSky(rd, sunDir, skyCol, sunCol, sunSize);

  // === OCEAN RAYMARCHING ===
  // Only march if looking below a certain vertical angle
  if (rd.y < 0.05) {
    // Heightfield raymarching: binary-refine approach
    float tMin = 0.1;
    float tMax = 200.0;

    // Initial coarse march: find the first surface intersection
    float hx = _ss_mapGeom(ro + rd * tMin, seaTime, freq, amp, choppy, seaHeight);
    float t = tMin;
    float tmid = 0.0;
    float hmid = 0.0;

    for (int i = 0; i < _SS_RAYMARCH_STEPS; i++) {
      tmid = mix(t, tMax, hx / (hx - _ss_mapGeom(ro + rd * tMax, seaTime, freq, amp, choppy, seaHeight)));
      tmid = clamp(tmid, t, tMax);
      vec3 hitPos = ro + rd * tmid;
      hmid = _ss_mapGeom(hitPos, seaTime, freq, amp, choppy, seaHeight);
      if (hmid < 0.0) {
        tMax = tmid;
      } else {
        t = tmid;
        hx = hmid;
      }
    }

    // Refine hit distance
    float hitDist = mix(t, tMax, 0.5);
    vec3 hitPos = ro + rd * hitDist;

    // Only shade if we actually hit water (not sky behind horizon)
    if (hitDist < 180.0) {
      // === SURFACE NORMAL ===
      float normalEps = 0.002 + hitDist * 0.001; // adaptive precision
      vec3 normal = _ss_getNormal(hitPos, normalEps, seaTime, freq, amp, choppy, seaHeight);

      // === FRESNEL ===
      float fresnelPower = 3.0 + highs * 2.0; // highs sharpen reflections
      float fres = _ss_fresnel(normal, rd, fresnelPower);
      fres = clamp(fres, 0.0, 1.0);

      // === REFLECTION ===
      vec3 reflDir = reflect(rd, normal);
      vec3 reflected = _ss_getSky(reflDir, sunDir, skyCol, sunCol, sunSize);

      // === SPECULAR: sun glints ===
      float specPower = mix(32.0, 256.0, highs); // highs = sharper sparkle
      float spec = pow(max(dot(reflDir, sunDir), 0.0), specPower);
      spec *= mix(0.5, 1.5, highs); // more sparkle with highs
      spec *= mix(1.0, 1.6, sChorus); // chorus sparkles

      // === SUBSURFACE SCATTERING ===
      // Light penetrating wave crests creates that translucent teal glow
      float sss = max(dot(normal, sunDir), 0.0);
      sss = pow(sss, 2.0);
      vec3 ssColor = mix(waterDiffuse * 3.0, vec3(0.1, 0.4, 0.35), 0.5);
      ssColor = mix(ssColor, palCol2 * 0.4, 0.2); // palette tint

      // === DIFFUSE OCEAN COLOR ===
      // Height-based coloring: deep troughs are dark, crests catch light
      float waveHeight = hitPos.y;
      vec3 diffuse = mix(waterBase, waterBase * 1.8, smoothstep(-0.5, 0.5, waveHeight));

      // Distance fog: far water blends toward sky
      float distFade = smoothstep(5.0, 160.0, hitDist);

      // === COMBINE OCEAN COLOR ===
      vec3 oceanColor = mix(diffuse, reflected, fres);
      oceanColor += ssColor * sss * (1.0 - fres) * 0.3;
      oceanColor += sunCol * spec * 0.6;

      // === FOAM on wave crests ===
      float foamThreshold = 0.55 - energy * 0.15 - onset * 0.2 - flux * 0.1;
      float foam = smoothstep(foamThreshold, foamThreshold + 0.15, waveHeight);
      foam *= 0.5 + _ss_noise2d(hitPos.xz * 8.0 + uDynamicTime * 0.5) * 0.5;
      foam = clamp(foam, 0.0, 1.0);
      vec3 foamColor = mix(vec3(0.8, 0.85, 0.9), vec3(1.0), foam);
      oceanColor = mix(oceanColor, foamColor, foam * (0.3 + onset * 0.3));

      // === DISTANCE BLEND toward horizon ===
      vec3 horizonColor = mix(skyCol * 0.6, waterBase * 0.8, 0.4);
      oceanColor = mix(oceanColor, horizonColor, distFade);

      col = oceanColor;
    }
  }

  // === ATMOSPHERIC HAZE at horizon line ===
  float horizonMask = smoothstep(0.05, -0.02, rd.y);
  vec3 hazeColor = mix(skyCol, sunCol * 0.5, 0.3);
  col = mix(col, hazeColor, horizonMask * 0.4);

  // === VOCAL MIST / SPRAY above waterline ===
  if (vocalPres > 0.05) {
    float mistHeight = smoothstep(0.0, 0.15, rd.y) * smoothstep(0.3, 0.1, rd.y);
    float mistNoise = fbm3(vec3(p * 3.0, uDynamicTime * 0.2)) * 0.5 + 0.5;
    float mist = mistHeight * mistNoise * vocalPres;
    vec3 mistColor = mix(vec3(0.7, 0.75, 0.85), sunCol * 0.5, 0.3);
    col = mix(col, mistColor, mist * 0.25);
  }

  // === ONSET SPLASH PARTICLES: brief spray burst ===
  if (onset > 0.5) {
    float splashStr = (onset - 0.5) * 2.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float seed = fi * 7.31 + uDynamicTime * 0.5;
      vec2 splashPos = vec2(
        snoise(vec3(seed, fi * 3.0, 0.0)) * 0.6,
        snoise(vec3(fi * 5.0, seed, 0.0)) * 0.1 + 0.05
      );
      float dist = length(p - splashPos);
      float glow = smoothstep(0.02, 0.003, dist);
      col += vec3(0.85, 0.9, 1.0) * glow * splashStr * 0.15;
    }
  }

  // === STORM LIGHTNING (climax-gated) ===
  if (climaxBoost > 0.3) {
    float lightningChance = snoise(vec3(floor(uTime * 2.0), 0.0, 0.0));
    if (lightningChance > 0.7) {
      float flashFade = pow(fract(uTime * 2.0), 4.0); // quick decay
      float flashBright = (1.0 - flashFade) * (climaxBoost - 0.3) * 1.4;
      col += vec3(0.6, 0.65, 0.8) * flashBright * 0.2;
    }
  }

  // === CHORUS SPARKLE OVERLAY ===
  if (sChorus > 0.01) {
    float sparkle = snoise(vec3(p * 40.0, uDynamicTime * 0.8));
    sparkle = pow(max(0.0, sparkle), 8.0);
    col += sunCol * sparkle * sChorus * 0.08;
  }

  // === VIGNETTE ===
  float vigScale = mix(0.28, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = max(waterBase * 0.06, vec3(0.04, 0.05, 0.07));
  col = mix(vigTint, col, vignette);

  // === SDF ICON EMERGENCE ===
  {
    float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
