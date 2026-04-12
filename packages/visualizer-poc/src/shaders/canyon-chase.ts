/**
 * Canyon Chase — raymarched sandstone canyon with layered sediment, dust
 * volumetrics, and gunshot flash. Inspired by "El Paso" (Marty Robbins):
 * a desperate outlaw chase through a narrow desert canyon at dusk.
 *
 * Camera moves forward through a narrow slot canyon corridor. Two wall
 * planes with noise-displaced rock texture. Horizontal sediment color bands
 * in warm earth tones. Canyon floor with scattered rocks. Dust clouds
 * in the air (volumetric FBM). Narrow sky strip above with god rays.
 * Walls close in with harmonic tension. Drum onset triggers gunshot flash.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             -> ground shake (camera + floor displacement)
 *   uEnergy           -> dust density, wall detail complexity
 *   uDrumOnset        -> gunshot muzzle flash (white spike + orange afterglow)
 *   uVocalPresence    -> sun intensity through sky gap
 *   uHarmonicTension  -> canyon width (narrows with tension — claustrophobic)
 *   uSectionType      -> jam=walls undulate, space=wide valley, chorus=sun flood
 *   uClimaxPhase      -> canyon walls explode outward, sky opens
 *   uSlowEnergy       -> forward camera speed
 *   uOnsetSnap        -> dust kick-up bursts
 *   uSpectralFlux     -> sediment layer shimmer
 *   uMelodicPitch     -> sun color temperature
 *   uBeatStability    -> wall steadiness (unstable = jitter)
 *   uDynamicRange     -> shadow depth in crevices
 *   uTimbralBrightness -> dust color warmth
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const canyonChaseVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "normal",
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.15,
  caEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  thermalShimmerEnabled: true,
  eraGradingEnabled: true,
});

export const canyonChaseFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI  3.14159265
#define TAU 6.28318530

// ═══════════════════════════════════════════════════════════
// SDF helpers — all cc-prefixed
// ═══════════════════════════════════════════════════════════

// Smooth minimum for organic SDF blends
float ccSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// 2D rotation matrix
mat2 ccRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

// Hash for scattered rocks
float ccHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ═══════════════════════════════════════════════════════════
// Sediment color: horizontal bands in warm earth tones
// ═══════════════════════════════════════════════════════════
vec3 ccSediment(float worldY, float flux, float palHue1, float palHue2) {
  // 6 sediment layers with noise-warped boundaries
  float strataY = worldY * 2.5;
  float warp = snoise(vec3(strataY * 0.3, 0.0, 7.0)) * 0.4;
  float band = fract(strataY + warp);

  // Earth tone palette: deep red → burnt sienna → ochre → sandstone → cream → rust
  vec3 layerA = vec3(0.30, 0.10, 0.06); // deep red clay
  vec3 layerB = vec3(0.50, 0.25, 0.10); // burnt sienna
  vec3 layerC = vec3(0.65, 0.45, 0.20); // ochre
  vec3 layerD = vec3(0.75, 0.55, 0.35); // sandstone
  vec3 layerE = vec3(0.82, 0.72, 0.55); // cream limestone
  vec3 layerF = vec3(0.40, 0.15, 0.08); // dark rust

  vec3 col;
  if (band < 0.17) col = mix(layerA, layerB, band / 0.17);
  else if (band < 0.33) col = mix(layerB, layerC, (band - 0.17) / 0.16);
  else if (band < 0.50) col = mix(layerC, layerD, (band - 0.33) / 0.17);
  else if (band < 0.67) col = mix(layerD, layerE, (band - 0.50) / 0.17);
  else if (band < 0.83) col = mix(layerE, layerF, (band - 0.67) / 0.16);
  else col = mix(layerF, layerA, (band - 0.83) / 0.17);

  // Spectral flux shimmer: bands shift slightly
  float shimmer = snoise(vec3(strataY * 4.0, flux * 3.0, 13.0));
  col += vec3(0.03, 0.02, 0.01) * shimmer * flux;

  // Palette tint (subtle)
  vec3 pal1 = hsv2rgb(vec3(palHue1, 0.5, 0.6));
  vec3 pal2 = hsv2rgb(vec3(palHue2, 0.4, 0.5));
  col = mix(col, mix(pal1, pal2, band), 0.12);

  return col;
}

// ═══════════════════════════════════════════════════════════
// Canyon wall SDF — two noise-displaced vertical planes
// ═══════════════════════════════════════════════════════════
float ccCanyonWalls(vec3 rp, float tension, float climaxOpen, float sJam,
                    float sSpace, float stability, float bassShake) {
  // Base canyon half-width: tension narrows, climax explodes outward
  float halfW = mix(1.8, 0.6, tension);
  halfW += climaxOpen * 2.0;
  halfW *= mix(1.0, 1.8, sSpace);  // space = wide valley

  // Wall noise displacement for organic rock texture
  float noiseScale = 3.0 + sJam * 2.0; // jam = walls undulate more
  float wallNoiseL = fbm3(vec3(0.0, rp.y * 1.5, rp.z * 0.8)) * 0.5;
  wallNoiseL += snoise(vec3(rp.z * noiseScale, rp.y * 2.0, 1.0)) * 0.2;

  float wallNoiseR = fbm3(vec3(5.0, rp.y * 1.5, rp.z * 0.8 + 3.0)) * 0.5;
  wallNoiseR += snoise(vec3(rp.z * noiseScale + 10.0, rp.y * 2.0, 2.0)) * 0.2;

  // Jam: walls breathe with beat
  float jamPulse = sJam * sin(rp.z * 2.0 + uMusicalTime * TAU) * 0.15;
  wallNoiseL += jamPulse;
  wallNoiseR -= jamPulse;

  // Beat stability: unstable = wall jitter
  float jitter = (1.0 - stability) * snoise(vec3(rp.z * 8.0, uTime * 4.0, 0.0)) * 0.08;
  wallNoiseL += jitter;
  wallNoiseR -= jitter;

  // Bass ground shake
  wallNoiseL += bassShake * sin(rp.y * 3.0 + uTime * 6.0) * 0.06;
  wallNoiseR += bassShake * cos(rp.y * 3.0 + uTime * 6.0) * 0.06;

  // Two wall planes with noise displacement.
  // SDF convention: positive in canyon air, negative in surrounding rock.
  // Previously these were sign-inverted (leftWall negated, rightWall =
  // rp.x - halfW), which made every ray miss the walls and produced a flat
  // background frame across the whole shader.
  float leftWall  = rp.x + halfW + wallNoiseL;        // positive when right of left wall
  float rightWall = halfW + wallNoiseR - rp.x;        // positive when left of right wall

  return min(leftWall, rightWall);
}

// ═══════════════════════════════════════════════════════════
// Canyon floor SDF — flat ground with scattered rocks
// ═══════════════════════════════════════════════════════════
float ccFloor(vec3 rp, float bassShake) {
  // Flat ground plane with subtle noise
  float ground = rp.y + 1.5;
  ground -= snoise(vec3(rp.xz * 0.5, 0.0)) * 0.15;
  ground -= bassShake * 0.08;

  // Scattered rocks on floor
  vec2 rockCell = floor(rp.xz * 2.0);
  float rockHash = ccHash(rockCell);
  if (rockHash > 0.7) {
    vec2 rockCenter = (rockCell + 0.5) / 2.0;
    vec3 rockPos = rp - vec3(rockCenter.x, -1.3, rockCenter.y);
    float rockSize = 0.08 + rockHash * 0.12;
    float rock = length(rockPos) - rockSize;
    ground = ccSmin(ground, rock, 0.1);
  }

  return ground;
}

// ═══════════════════════════════════════════════════════════
// Ceiling (sky gap) — open strip above canyon
// ═══════════════════════════════════════════════════════════
float ccCeiling(vec3 rp) {
  return -(rp.y - 4.0);
}

// ═══════════════════════════════════════════════════════════
// Combined scene SDF
// ═══════════════════════════════════════════════════════════
vec2 ccMap(vec3 rp, float tension, float climaxOpen, float sJam,
           float sSpace, float stability, float bassShake) {
  // Returns vec2(distance, materialID)
  // Material IDs: 0=wall, 1=floor, 2=ceiling(sky)
  float walls = ccCanyonWalls(rp, tension, climaxOpen, sJam, sSpace, stability, bassShake);
  float flr = ccFloor(rp, bassShake);
  float ceil = ccCeiling(rp);

  float dist = walls;
  float matID = 0.0;

  if (flr < dist) { dist = flr; matID = 1.0; }
  if (ceil < dist) { dist = ceil; matID = 2.0; }

  return vec2(dist, matID);
}

// ═══════════════════════════════════════════════════════════
// Normal estimation via central differences
// ═══════════════════════════════════════════════════════════
vec3 ccNormal(vec3 rp, float tension, float climaxOpen, float sJam,
              float sSpace, float stability, float bassShake) {
  vec2 eps = vec2(0.005, 0.0);
  float d = ccMap(rp, tension, climaxOpen, sJam, sSpace, stability, bassShake).x;
  return normalize(vec3(
    ccMap(rp + eps.xyy, tension, climaxOpen, sJam, sSpace, stability, bassShake).x - d,
    ccMap(rp + eps.yxy, tension, climaxOpen, sJam, sSpace, stability, bassShake).x - d,
    ccMap(rp + eps.yyx, tension, climaxOpen, sJam, sSpace, stability, bassShake).x - d
  ));
}

// ═══════════════════════════════════════════════════════════
// Ambient occlusion
// ═══════════════════════════════════════════════════════════
float ccOcclusion(vec3 rp, vec3 norm, float tension, float climaxOpen,
                  float sJam, float sSpace, float stability, float bassShake) {
  float occ = 0.0;
  float scale = 1.0;
  for (int i = 0; i < 5; i++) {
    float dist = 0.05 + 0.1 * float(i);
    float d = ccMap(rp + norm * dist, tension, climaxOpen, sJam, sSpace, stability, bassShake).x;
    occ += (dist - d) * scale;
    scale *= 0.7;
  }
  return clamp(1.0 - occ * 2.5, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Dust volumetrics — FBM-based atmospheric scattering
// ═══════════════════════════════════════════════════════════
vec3 ccDustVolume(vec3 ro, vec3 rd, float tMax, float energy, float onset,
                  float timbralBright, float sChorus, float sunIntensity) {
  vec3 dustAccum = vec3(0.0);
  float dustAlpha = 0.0;

  // 16 volumetric samples along ray
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float t = 0.5 + fi * (tMax / 16.0);
    if (t > tMax || dustAlpha > 0.95) break;
    vec3 sp = ro + rd * t;

    // 3-layer dust density
    float density = fbm3(vec3(sp.x * 0.8, sp.y * 0.5, sp.z * 0.4 + uDynamicTime * 0.15)) * 0.5;
    density += snoise(vec3(sp.xz * 1.5, uDynamicTime * 0.2)) * 0.3;
    density += onset * exp(-fi * 0.15) * 0.4; // onset kick-up burst

    // Energy drives density
    density *= 0.3 + energy * 0.7;

    // Height falloff: dust settles near floor, thins above
    density *= smoothstep(4.0, 2.0, sp.y) * smoothstep(-2.0, 0.0, sp.y);

    if (density > 0.001) {
      float alpha = density * 0.04 * (1.0 - dustAlpha);

      // Dust color: warm amber-brown, brightened by timbral brightness
      vec3 dustColor = mix(
        vec3(0.35, 0.22, 0.10),
        vec3(0.65, 0.45, 0.25),
        timbralBright
      );

      // Forward scatter toward sun (god ray effect)
      float sunDot = max(0.0, rd.y) * sunIntensity;
      float scatter = pow(max(0.0, sunDot), 3.0) * 0.6;
      dustColor += vec3(1.0, 0.9, 0.7) * scatter;

      // Chorus: sun flood warms dust
      dustColor += vec3(0.1, 0.06, 0.02) * sChorus;

      dustAccum += dustColor * alpha;
      dustAlpha += alpha;
    }
  }

  return dustAccum;
}

// ═══════════════════════════════════════════════════════════
// Gunshot flash: drum-onset triggered muzzle flash
// ═══════════════════════════════════════════════════════════
vec3 ccGunshotFlash(vec2 screenP, float drumOnset, float energy) {
  // Flash originates from random screen position (hash of time)
  float flashSeed = floor(uTime * 30.0);
  float hx = fract(sin(flashSeed * 12.9898) * 43758.5453);
  float hy = fract(sin(flashSeed * 78.233) * 43758.5453);
  vec2 flashPos = vec2(hx - 0.5, hy - 0.5) * vec2(0.8, 0.4);

  float dist = length(screenP - flashPos);

  // White-hot core
  float core = smoothstep(0.15, 0.0, dist) * drumOnset;
  // Orange afterglow (wider, softer)
  float glow = smoothstep(0.5, 0.05, dist) * drumOnset * 0.5;
  // Radial spikes
  float angle = atan(screenP.y - flashPos.y, screenP.x - flashPos.x);
  float spikes = pow(abs(sin(angle * 4.0)), 8.0) * drumOnset * 0.3;
  spikes *= smoothstep(0.4, 0.05, dist);

  vec3 flashColor = vec3(1.0, 1.0, 0.95) * core;
  flashColor += vec3(1.0, 0.6, 0.15) * glow;
  flashColor += vec3(1.0, 0.8, 0.4) * spikes;

  // Energy amplifies flash visibility
  flashColor *= 0.5 + energy * 0.5;

  return flashColor;
}

// ═══════════════════════════════════════════════════════════
// Sky rendering: harsh desert sun through canyon gap
// ═══════════════════════════════════════════════════════════
vec3 ccSky(vec3 rd, float sunIntensity, float sChorus, float melodicPitch) {
  // Gradient: deep blue overhead → warm horizon
  float skyGrad = smoothstep(-0.1, 0.8, rd.y);
  vec3 skyCol = mix(
    vec3(0.55, 0.35, 0.20), // warm horizon (desert dusk)
    vec3(0.20, 0.35, 0.65), // deep blue overhead
    skyGrad
  );

  // Melodic pitch shifts sun temperature (low=warm amber, high=white-hot)
  vec3 sunColor = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.95, 0.85), melodicPitch);

  // Sun disc
  vec3 sunDir = normalize(vec3(0.2, 0.9, 0.3));
  float sunDot = max(0.0, dot(rd, sunDir));
  float sunDisc = pow(sunDot, 128.0) * sunIntensity * 3.0;
  float sunGlow = pow(sunDot, 8.0) * sunIntensity * 0.5;

  skyCol += sunColor * (sunDisc + sunGlow);

  // Chorus: sun flood — entire sky warms
  skyCol += vec3(0.15, 0.10, 0.04) * sChorus * sunIntensity;

  return skyCol;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ─── Clamp audio uniforms ───
  float energy     = clamp(uEnergy, 0.0, 1.0);
  float bass       = clamp(uBass, 0.0, 1.0);
  float drumOnset  = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPres  = clamp(uVocalPresence, 0.0, 1.0);
  float tension    = clamp(uHarmonicTension, 0.0, 1.0);
  float slowE      = clamp(uSlowEnergy, 0.0, 1.0);
  float onset      = clamp(uOnsetSnap, 0.0, 1.0);
  float flux       = clamp(uSpectralFlux, 0.0, 1.0);
  float melodicP   = clamp(uMelodicPitch, 0.0, 1.0);
  float stability  = clamp(uBeatStability, 0.0, 1.0);
  float dynRange   = clamp(uDynamicRange, 0.0, 1.0);
  float timbralBr  = clamp(uTimbralBrightness, 0.0, 1.0);
  float climaxInt  = clamp(uClimaxIntensity, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam   = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo  = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax: canyon walls explode outward ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxOpen = isClimax * climaxInt;

  // ─── Sun intensity: vocal presence + chorus boost ───
  float sunIntensity = 0.3 + vocalPres * 0.7;
  sunIntensity *= mix(1.0, 1.8, sChorus);

  // ─── Forward speed from slow energy ───
  float forwardSpeed = 0.3 + slowE * 0.7;
  float travelDist = uDynamicTime * forwardSpeed;

  // ─── Camera: moves forward through canyon ───
  float camShakeX = bass * sin(uTime * 7.0) * 0.04;
  float camShakeY = bass * cos(uTime * 5.0) * 0.03;
  vec3 ro = vec3(
    sin(travelDist * 0.15) * 0.3 + camShakeX,
    0.0 + camShakeY,
    travelDist
  );

  // Look direction: slightly forward and up
  vec3 lookDir = normalize(vec3(
    sin(travelDist * 0.08) * 0.1,
    0.15,
    1.0
  ));

  // Build camera basis
  vec3 camFwd = lookDir;
  vec3 camSide = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camUp2 = cross(camSide, camFwd);
  float fovScale = tan(radians(65.0) * 0.5);
  vec2 sp = (uv - 0.5) * aspect;
  vec3 rd = normalize(camFwd + camSide * sp.x * fovScale + camUp2 * sp.y * fovScale);

  // ─── Raymarching ───
  float totalDist = 0.0;
  float marchDist = 0.0;
  float matID = -1.0;
  vec3 marchPos = ro;
  bool marchHit = false;
  int maxSteps = 80;

  for (int i = 0; i < 80; i++) {
    if (i >= maxSteps) break;
    marchPos = ro + rd * totalDist;
    vec2 sceneResult = ccMap(marchPos, tension, climaxOpen, sJam, sSpace, stability, bass);
    marchDist = sceneResult.x;
    matID = sceneResult.y;

    if (abs(marchDist) < 0.002) {
      marchHit = true;
      break;
    }
    if (totalDist > 40.0) break;

    totalDist += marchDist * 0.7; // slow march for better accuracy
  }

  vec3 col = vec3(0.0);

  if (marchHit) {
    vec3 rp = marchPos;
    vec3 norm = ccNormal(rp, tension, climaxOpen, sJam, sSpace, stability, bass);
    float occVal = ccOcclusion(rp, norm, tension, climaxOpen, sJam, sSpace, stability, bass);

    // ─── Lighting ───
    vec3 sunDir = normalize(vec3(0.2, 0.9, 0.3));
    float diffuse = max(0.0, dot(norm, sunDir));
    float ambient = 0.12 + 0.08 * (0.5 + 0.5 * norm.y);

    // Dynamic range controls shadow depth
    float shadowDepth = mix(0.6, 0.2, dynRange);
    diffuse = mix(shadowDepth, 1.0, diffuse);

    // Sun intensity from vocal presence
    diffuse *= sunIntensity;

    if (matID < 0.5) {
      // ─── WALL MATERIAL ───
      vec3 wallColor = ccSediment(rp.y, flux, uPalettePrimary, uPaletteSecondary);

      // Rock surface detail: micro-noise
      float microDetail = snoise(vec3(rp * 8.0)) * 0.1 * (0.5 + energy * 0.5);
      wallColor *= 1.0 + microDetail;

      // Erosion pockets: darken in concavities
      float erosion = snoise(vec3(rp.x * 3.0, rp.y * 2.0, rp.z * 1.5));
      erosion = smoothstep(0.4, 0.7, erosion);
      wallColor *= 1.0 - erosion * 0.25;

      // AO darkening
      wallColor *= mix(0.3, 1.0, occVal);

      col = wallColor * diffuse;

      // Rim light from sun: warm edge highlighting on walls
      float rim = pow(1.0 - max(0.0, dot(norm, -rd)), 3.0);
      col += vec3(0.8, 0.5, 0.2) * rim * 0.15 * sunIntensity;

    } else if (matID < 1.5) {
      // ─── FLOOR MATERIAL ───
      vec3 floorColor = vec3(0.25, 0.15, 0.08);

      // Sandy texture
      float sandNoise = fbm3(vec3(rp.xz * 4.0, 0.0));
      floorColor = mix(floorColor, vec3(0.40, 0.28, 0.15), sandNoise * 0.5 + 0.5);

      // Footprints / tracks (periodic disturbance along z)
      float tracks = smoothstep(0.3, 0.28, abs(rp.x)) * 0.1;
      floorColor -= vec3(tracks);

      floorColor *= mix(0.4, 1.0, occVal);
      col = floorColor * diffuse;

    } else {
      // ─── SKY (ceiling hit — render sky) ───
      col = ccSky(rd, sunIntensity, sChorus, melodicP);
    }

    // ─── Distance fog ───
    float fogDist = totalDist;
    float fogDensity = 0.02 + energy * 0.01;
    float fogFactor = 1.0 - exp(-fogDist * fogDensity);
    vec3 fogColor = mix(vec3(0.35, 0.22, 0.12), vec3(0.5, 0.35, 0.2), sunIntensity);
    col = mix(col, fogColor, fogFactor);

  } else {
    // ─── No hit: render sky ───
    col = ccSky(rd, sunIntensity, sChorus, melodicP);
  }

  // ─── Dust volumetrics (additive) ───
  float dustEnd = marchHit ? min(totalDist, 20.0) : 20.0;
  vec3 dustLayer = ccDustVolume(ro, rd, dustEnd, energy, onset, timbralBr, sChorus, sunIntensity);
  col += dustLayer;

  // ─── God rays through sky gap ───
  {
    vec3 sunDir = normalize(vec3(0.2, 0.9, 0.3));
    float sunDot = max(0.0, dot(rd, sunDir));
    float godRayStrength = pow(sunDot, 6.0) * sunIntensity * 0.4;
    godRayStrength *= (1.0 - smoothstep(0.0, 0.3, abs(rd.x))); // only through narrow gap
    vec3 godRayColor = vec3(1.0, 0.85, 0.55);
    // Volumetric god ray: attenuated by dust
    float rayNoise = fbm3(vec3(rd.xz * 3.0, uDynamicTime * 0.1));
    godRayStrength *= 0.7 + 0.3 * rayNoise;
    col += godRayColor * godRayStrength;
  }

  // ─── Gunshot muzzle flash on drum onset ───
  col += ccGunshotFlash(screenP, drumOnset, energy);

  // ─── Beat pulse: subtle brightness swell ───
  float bp = beatPulse(uMusicalTime);
  col *= 1.0 + bp * 0.08 * energy;

  // ─── Solo spotlight: focus lighting narrows ───
  {
    float soloVig = 1.0 - length(screenP) * 1.2;
    soloVig = smoothstep(0.0, 1.0, soloVig);
    col *= mix(1.0, soloVig, sSolo * 0.3);
  }

  // ─── Icon emergence ───
  {
    float nf = fbm6(vec3(screenP * 2.0, uDynamicTime * 0.08));
    vec3 iconCol1 = vec3(0.65, 0.35, 0.15);
    vec3 iconCol2 = vec3(1.0, 0.75, 0.40);
    col += iconEmergence(screenP, uTime, energy, bass,
      iconCol1, iconCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass,
      iconCol1, iconCol2, nf, uSectionIndex);
  }

  // ─── Darkness texture ───
  col += darknessTexture(uv, uTime, energy);

  // ─── Post-processing (shared chain) ───
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
