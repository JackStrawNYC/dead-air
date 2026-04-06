/**
 * Solar Flare -- raymarched sun surface with granulation, sunspots,
 * coronal mass ejections, and magnetic prominences.
 *
 * Camera orbits close to a star's photosphere. Convection cells tile
 * the surface (Voronoi SDF), dark sunspot regions driven by harmonic
 * tension, massive volumetric plasma arcs launched on drum onsets,
 * and limb-darkened corona glow driven by vocal presence. The sun is ALIVE.
 *
 * Feedback: Yes (decay 0.94, R = plasma temperature, G = magnetic field)
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             -> granulation cell size + convection depth
 *   uEnergy           -> surface brightness + flare intensity
 *   uDrumOnset        -> coronal mass ejection launch trigger
 *   uVocalPresence    -> corona glow intensity
 *   uHarmonicTension  -> magnetic field stress (sunspot activity)
 *   uSectionType      -> jam=multiple flares, space=quiet sun, chorus=full eruption
 *   uClimaxPhase      -> massive CME engulfs the camera
 *   uClimaxIntensity  -> CME magnitude
 *   uOnsetSnap        -> secondary flare trigger
 *   uFastEnergy       -> prominence velocity / ejection speed
 *   uSlowEnergy       -> convection drift speed
 *   uMids             -> chromosphere emission brightness
 *   uChromaHue        -> emission hue shift
 *   uPalettePrimary   -> surface color
 *   uPaletteSecondary -> corona / flare color
 *   uPaletteSaturation-> color richness
 *   uTimbralBrightness-> corona color temperature
 *   uSpaceScore       -> overall calm modifier
 *   uEnergyForecast   -> magnetic tension buildup
 *   uBeatStability    -> convection regularity
 *   uStemDrums        -> solar wind pulse radials
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const solarFlareVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const solarFlareFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.15,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  temporalBlendEnabled: true,
  dofEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define SF_SUN_RADIUS 2.5
#define SF_CORONA_START 2.6
#define SF_CORONA_END 6.0
#define SF_MAX_DIST 12.0
#define SF_SURFACE_STEPS 80
#define SF_CORONA_STEPS 40

// ================================================================
// VORONOI GRANULATION (convection cells on the photosphere)
// ================================================================

// Hash for Voronoi cell jitter
vec3 sfHash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453123);
}

// Spherical Voronoi: granulation cells on a sphere surface
// Returns vec2(minDist, edgeDist) for cell interior and intergranular lanes
vec2 sfGranulation(vec3 pos, float cellScale, float jitter) {
  vec3 scaledP = pos * cellScale;
  vec3 cellId = floor(scaledP);
  vec3 cellFrac = fract(scaledP);

  float minDist = 1e10;
  float secondDist = 1e10;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 neighbor = vec3(float(x), float(y), float(z));
        vec3 cellCenter = sfHash3(cellId + neighbor) * jitter;
        vec3 diff = neighbor + cellCenter - cellFrac;
        float d = dot(diff, diff);
        if (d < minDist) {
          secondDist = minDist;
          minDist = d;
        } else if (d < secondDist) {
          secondDist = d;
        }
      }
    }
  }

  minDist = sqrt(minDist);
  secondDist = sqrt(secondDist);

  // Edge factor: intergranular lane darkness
  float edgeDist = secondDist - minDist;
  return vec2(minDist, edgeDist);
}

// ================================================================
// SDF: SOLAR SURFACE
// ================================================================

// Sunspot SDF: dark magnetic depression on the surface
float sfSunspot(vec3 pos, vec3 center, float radius) {
  float d = length(pos - center) - radius;
  return d;
}

// Solar surface SDF: sphere + granulation displacement + sunspot depressions
float sfSurface(vec3 pos, float granDisplace, float tension) {
  float sphere = length(pos) - SF_SUN_RADIUS;

  // Granulation raises cell centers, depresses lanes
  sphere -= granDisplace * 0.06;

  // Large-scale convection: supergranulation
  float superGran = fbm3(pos * 0.8 + vec3(0.0, 0.0, uDynamicTime * 0.008)) * 0.04;
  sphere -= superGran;

  // Sunspot depressions driven by harmonic tension
  // More tension = more/deeper sunspots
  float spotDepth = tension * 0.08;
  float spot1 = sfSunspot(pos, normalize(vec3(
    sin(uDynamicTime * 0.02 + 1.0),
    cos(uDynamicTime * 0.015 + 2.0),
    sin(uDynamicTime * 0.018 + 3.0)
  )) * SF_SUN_RADIUS, 0.15 + tension * 0.12);
  float spot2 = sfSunspot(pos, normalize(vec3(
    cos(uDynamicTime * 0.017 + 4.0),
    sin(uDynamicTime * 0.022 + 5.0),
    cos(uDynamicTime * 0.013 + 0.5)
  )) * SF_SUN_RADIUS, 0.10 + tension * 0.08);

  sphere += smoothstep(0.1, -0.05, spot1) * spotDepth;
  sphere += smoothstep(0.1, -0.05, spot2) * spotDepth;

  return sphere;
}

// ================================================================
// PROMINENCE / FLARE ARC SDF (magnetic plasma loops)
// ================================================================

// Parametric arch between two footpoints on the solar surface
float sfFlareArc(vec3 pos, vec3 foot1, vec3 foot2, float arcHeight, float thickness) {
  vec3 mid = (foot1 + foot2) * 0.5;
  vec3 span = foot2 - foot1;
  float spanLen = length(span);
  vec3 spanDir = span / max(spanLen, 0.001);

  // Normal to the surface at midpoint (radial)
  vec3 radialDir = normalize(mid);

  // Project pos onto the arc plane
  vec3 toPos = pos - mid;
  float along = dot(toPos, spanDir);
  float param = clamp(along / (spanLen * 0.5), -1.0, 1.0);

  // Parabolic arch shape
  float archLift = arcHeight * (1.0 - param * param);

  // Point on the arch
  vec3 archPoint = mid + spanDir * along + radialDir * archLift;

  // Magnetic twist along the loop
  float twist = sin(param * PI * 2.0 + uDynamicTime * 0.5) * thickness * 0.5;
  vec3 perpDir = normalize(cross(spanDir, radialDir));
  archPoint += perpDir * twist;

  return length(pos - archPoint) - thickness;
}

// ================================================================
// CORONAL MASS EJECTION (volumetric expanding plasma)
// ================================================================

// CME density at a point: expanding asymmetric plasma shell
float sfCMEDensity(vec3 pos, float launchTime, float intensity, vec3 launchDir) {
  // Expand outward from surface
  float age = max(0.0, uDynamicTime - launchTime);
  float speed = 1.5 + intensity * 2.0;
  float radius = SF_SUN_RADIUS + age * speed;
  float shellWidth = 0.3 + age * 0.2;

  // Distance from expanding shell
  float distFromCenter = length(pos);
  float shellDist = abs(distFromCenter - radius);

  // Directional focus: CME is not spherical, it's a cone
  float dirAlignment = dot(normalize(pos), launchDir);
  float coneMask = smoothstep(0.2, 0.8, dirAlignment);

  // Turbulent structure
  float turb = fbm3(pos * 2.0 + vec3(age * 0.5)) * 0.5 + 0.5;

  float density = smoothstep(shellWidth, 0.0, shellDist) * coneMask * turb;
  density *= smoothstep(0.0, 0.3, age) * smoothstep(4.0, 2.0, age); // fade in/out

  return density * intensity;
}

// ================================================================
// CORONA DENSITY (volumetric atmosphere)
// ================================================================

float sfCorona(vec3 pos, float vocalGlow, float energy) {
  float dist = length(pos);
  if (dist < SF_SUN_RADIUS * 0.95 || dist > SF_CORONA_END) return 0.0;

  // Base corona: inverse-square falloff from surface
  float surfaceDist = dist - SF_SUN_RADIUS;
  float corona = 1.0 / (1.0 + surfaceDist * surfaceDist * 3.0);

  // Streamer structures (radial plasma streams)
  vec3 dir = normalize(pos);
  float streamerNoise = fbm3(dir * 4.0 + vec3(uDynamicTime * 0.02));
  float streamers = smoothstep(0.1, 0.5, streamerNoise) * 0.6;
  corona += streamers / (1.0 + surfaceDist * 2.0);

  // Vocal presence intensifies the glow
  corona *= 0.3 + vocalGlow * 0.7 + energy * 0.3;

  // Limb brightening (corona is brightest at the edge)
  float limbFactor = smoothstep(SF_SUN_RADIUS * 0.9, SF_SUN_RADIUS * 1.1, dist);
  corona *= 1.0 + limbFactor * 0.5;

  return corona * 0.08;
}

// ================================================================
// SCENE MAP (unified SDF)
// ================================================================

float sfMap(vec3 pos, float granDisplace, float tension) {
  float d = sfSurface(pos, granDisplace, tension);
  return d;
}

// SDF normal via central differences
vec3 sfNormal(vec3 pos, float granDisplace, float tension) {
  vec2 eps = vec2(0.005, 0.0);
  return normalize(vec3(
    sfMap(pos + eps.xyy, granDisplace, tension) - sfMap(pos - eps.xyy, granDisplace, tension),
    sfMap(pos + eps.yxy, granDisplace, tension) - sfMap(pos - eps.yxy, granDisplace, tension),
    sfMap(pos + eps.yyx, granDisplace, tension) - sfMap(pos - eps.yyx, granDisplace, tension)
  ));
}

// ================================================================
// BLACKBODY COLOR RAMP
// ================================================================

// Attempt a physically-motivated blackbody color from temperature (0-1)
// 0 = dark red (3000K), 0.5 = orange/yellow (5800K), 1.0 = blue-white (15000K+)
vec3 sfBlackbody(float temp, float hue1, float hue2, float sat) {
  // Dark photosphere
  vec3 coolColor = hsv2rgb(vec3(hue1, sat, 0.12));
  // Orange-yellow granule center
  vec3 warmColor = hsv2rgb(vec3(hue1 + 0.07, sat * 0.9, 0.65));
  // White-hot flare
  vec3 hotColor = hsv2rgb(vec3(hue2 + 0.10, sat * 0.4, 1.0));
  // Blue-white superheated CME
  vec3 superHot = vec3(0.85, 0.92, 1.0);

  vec3 col = coolColor;
  col = mix(col, warmColor, smoothstep(0.08, 0.35, temp));
  col = mix(col, hotColor, smoothstep(0.35, 0.65, temp));
  col = mix(col, superHot, smoothstep(0.65, 1.0, temp));
  return col;
}

// ================================================================
// MAIN
// ================================================================

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // --- Clamp audio inputs ---
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float fastEnergy = clamp(uFastEnergy, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float forecast = clamp(uEnergyForecast, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);

  float chromaHueMod = uChromaHue * 0.08;
  float slowTime = uDynamicTime * 0.03;

  // --- Section-type modulation ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam: multiple eruptions, denser. Space: quiet sun. Chorus: full brightness.
  float sectionFlareCount = mix(1.0, 2.5, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.8, sChorus);
  float sectionCellDensity = mix(1.0, 1.4, sJam) * mix(1.0, 0.7, sSpace);
  float sectionBrightness = mix(1.0, 1.3, sChorus) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.15, sSolo);

  // --- Climax state ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float climaxBoost = isClimax * climaxI;

  // --- Palette ---
  float hue1 = uPalettePrimary + chromaHueMod;
  float hue2 = uPaletteSecondary + chromaHueMod * 0.5;
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  // --- Previous frame plasma state ---
  vec4 prevFrame = texture2D(uPrevFrame, uv);
  float prevTemp = prevFrame.r;
  float prevMagnetic = prevFrame.g;

  // Decay plasma state
  float plasmaTemp = prevTemp * 0.94;
  float magneticField = prevMagnetic * 0.96;

  // Initialize on first frame
  if (prevFrame.a < 0.01) {
    plasmaTemp = 0.2;
    magneticField = 0.1;
  }

  // --- Camera: orbit close to photosphere ---
  vec3 camOrigin, camDir;
  setupCameraRay(uv, aspect, camOrigin, camDir);

  // Override camera to orbit the sun if default is too far
  // Blend with 3D camera system for continuity
  float orbitAngle = uDynamicTime * 0.015 * (1.0 + slowEnergy * 0.01);
  float orbitTilt = sin(uDynamicTime * 0.007) * 0.3;
  float orbitDist = 4.5 - energy * 0.5 - climaxBoost * 1.5;
  orbitDist = max(orbitDist, SF_SUN_RADIUS + 0.6);

  vec3 sfCamPos = vec3(
    cos(orbitAngle) * orbitDist,
    sin(orbitTilt) * orbitDist * 0.3,
    sin(orbitAngle) * orbitDist
  );

  // Blend custom orbit with the system camera
  vec3 blendedOrigin = mix(sfCamPos, camOrigin, 0.3);

  // Look at the sun center with slight offset for parallax
  vec3 sfLookAt = vec3(
    sin(uDynamicTime * 0.01) * 0.2,
    cos(uDynamicTime * 0.008) * 0.15,
    0.0
  );

  vec3 sfForward = normalize(sfLookAt - blendedOrigin);
  vec3 sfWorldUp = vec3(0.0, 1.0, 0.0);
  vec3 sfRightDir = normalize(cross(sfForward, sfWorldUp));
  vec3 sfUpDir = cross(sfRightDir, sfForward);

  float fovScale = tan(radians(mix(45.0, 60.0, climaxBoost)) * 0.5);
  vec3 rd = normalize(sfForward + sfRightDir * screenP.x * fovScale + sfUpDir * screenP.y * fovScale);
  vec3 ro = blendedOrigin;

  // --- Granulation parameters ---
  float cellScale = (8.0 + bass * 4.0) * sectionCellDensity;
  float convectionDepth = 0.3 + bass * 0.4;
  float cellJitter = 0.7 + beatStab * 0.2;

  // ================================================================
  // PASS 1: RAYMARCH THE SOLAR SURFACE
  // ================================================================

  vec3 col = vec3(0.0);
  float totalDist = 0.0;
  float surfaceTemp = 0.0;
  bool surfaceFound = false;
  vec3 surfacePos = vec3(0.0);
  vec3 surfaceNorm = vec3(0.0);
  float granValue = 0.0;
  float edgeValue = 0.0;

  // Pre-compute a granulation sample for the SDF displacement
  for (int i = 0; i < SF_SURFACE_STEPS; i++) {
    vec3 pos = ro + rd * totalDist;
    float distFromCenter = length(pos);

    // Skip if we've passed through
    if (totalDist > SF_MAX_DIST) break;

    // Sample granulation at current position for SDF displacement
    vec2 gran = sfGranulation(pos + vec3(slowTime * 0.2, slowTime * 0.15, 0.0), cellScale, cellJitter);
    float granDisp = smoothstep(0.0, 0.12, gran.y) * convectionDepth;

    float d = sfMap(pos, granDisp, tension);

    if (d < 0.002) {
      surfaceFound = true;
      surfacePos = pos;
      surfaceNorm = sfNormal(pos, granDisp, tension);
      granValue = gran.x;
      edgeValue = gran.y;

      // Surface temperature from granulation
      // Cell centers are hotter (rising plasma), edges cooler (sinking)
      float cellHeat = smoothstep(0.0, 0.15, gran.y); // bright cell interior
      surfaceTemp = 0.15 + cellHeat * 0.35 + energy * 0.15;

      // Sunspot cooling
      vec3 surfDir = normalize(surfacePos);
      vec3 spot1Dir = normalize(vec3(
        sin(uDynamicTime * 0.02 + 1.0),
        cos(uDynamicTime * 0.015 + 2.0),
        sin(uDynamicTime * 0.018 + 3.0)
      ));
      vec3 spot2Dir = normalize(vec3(
        cos(uDynamicTime * 0.017 + 4.0),
        sin(uDynamicTime * 0.022 + 5.0),
        cos(uDynamicTime * 0.013 + 0.5)
      ));
      float spotProx1 = 1.0 - smoothstep(0.0, 0.2 + tension * 0.15, acos(clamp(dot(surfDir, spot1Dir), -1.0, 1.0)));
      float spotProx2 = 1.0 - smoothstep(0.0, 0.15 + tension * 0.10, acos(clamp(dot(surfDir, spot2Dir), -1.0, 1.0)));
      float spotDarkening = max(spotProx1, spotProx2) * (0.4 + tension * 0.4);
      surfaceTemp *= 1.0 - spotDarkening;

      break;
    }

    // Adaptive step: slow down near surface
    totalDist += d * 0.8;
  }

  // ================================================================
  // SURFACE SHADING
  // ================================================================

  if (surfaceFound) {
    // Blackbody color from temperature
    vec3 surfColor = sfBlackbody(surfaceTemp, hue1, hue2, sat);

    // Granulation brightness: cell centers bright, lanes dark
    float lanesDarkness = smoothstep(0.0, 0.04, edgeValue);
    surfColor *= 0.5 + lanesDarkness * 0.6;

    // Intergranular lanes: very dark narrow borders
    float narrowLanes = 1.0 - smoothstep(0.0, 0.02, edgeValue);
    surfColor *= 1.0 - narrowLanes * 0.5;

    // Convection glow: brighter in rising centers
    float convGlow = smoothstep(0.1, 0.0, granValue) * convectionDepth;
    surfColor += hsv2rgb(vec3(hue1 + 0.06, sat * 0.7, 0.3)) * convGlow;

    // Limb darkening: surface is dimmer at grazing angles
    float limbAngle = dot(surfaceNorm, -rd);
    float limbDark = pow(max(limbAngle, 0.0), 0.6);
    surfColor *= 0.3 + limbDark * 0.7;

    // Mids boost chromosphere emission layer
    float chromoEmission = mids * 0.15;
    surfColor += hsv2rgb(vec3(hue1 + 0.12, sat * 0.5, chromoEmission));

    // Section brightness
    surfColor *= sectionBrightness;

    col = surfColor;
    plasmaTemp = mix(plasmaTemp, surfaceTemp, 0.15);
  }

  // ================================================================
  // PASS 2: VOLUMETRIC CORONA + CME + PROMINENCES
  // ================================================================

  vec3 coronaAccum = vec3(0.0);
  float coronaAlpha = 0.0;

  // Prominence footpoints (on surface, oriented radially)
  vec3 promFoot1A = normalize(vec3(sin(slowTime * 0.4 + 1.0), cos(slowTime * 0.3), sin(slowTime * 0.35 + 2.0))) * SF_SUN_RADIUS;
  vec3 promFoot1B = normalize(promFoot1A + vec3(0.3, 0.15, 0.1)) * SF_SUN_RADIUS;
  vec3 promFoot2A = normalize(vec3(cos(slowTime * 0.25 + 3.0), sin(slowTime * 0.3 + 1.0), cos(slowTime * 0.28))) * SF_SUN_RADIUS;
  vec3 promFoot2B = normalize(promFoot2A + vec3(-0.2, 0.25, -0.1)) * SF_SUN_RADIUS;
  vec3 promFoot3A = normalize(vec3(sin(slowTime * 0.2 + 5.0), cos(slowTime * 0.18 + 2.0), sin(slowTime * 0.22 + 4.0))) * SF_SUN_RADIUS;
  vec3 promFoot3B = normalize(promFoot3A + vec3(0.1, -0.3, 0.2)) * SF_SUN_RADIUS;

  float promHeight = 0.4 + fastEnergy * 0.6 + magneticField * 0.3;
  float promThickness = 0.04 + energy * 0.03;

  // CME launch direction (triggered by drum onset)
  float cmeSeed = floor(uMusicalTime * 0.5 + uSectionIndex * 7.0);
  vec3 cmeLaunchDir = normalize(vec3(
    sin(cmeSeed * 3.14),
    cos(cmeSeed * 2.17) * 0.5 + 0.3,
    sin(cmeSeed * 1.62)
  ));
  float cmeLaunchTime = uDynamicTime - fract(sin(cmeSeed) * 100.0) * 3.0;

  // Climax: massive CME aimed at camera
  vec3 climaxCMEDir = normalize(ro);
  float climaxCMEStart = uDynamicTime - climaxBoost * 2.0;

  float coronaStepSize = (SF_CORONA_END - SF_SUN_RADIUS) / float(SF_CORONA_STEPS);

  for (int i = 0; i < SF_CORONA_STEPS; i++) {
    if (coronaAlpha > 0.95) break;
    float fi = float(i);

    // Start ray from just outside the surface (or from camera if not hitting surface)
    float startT = surfaceFound ? totalDist + 0.05 : max(0.0, length(ro) - SF_CORONA_END);
    float stepT = startT + fi * coronaStepSize;
    vec3 pos = ro + rd * stepT;

    float distFromCenter = length(pos);
    if (distFromCenter < SF_SUN_RADIUS * 0.9) continue;
    if (distFromCenter > SF_CORONA_END) break;

    // Corona density
    float coronaDens = sfCorona(pos, vocalPresence, energy);

    // Prominence loops
    float prom1 = sfFlareArc(pos, promFoot1A, promFoot1B, promHeight, promThickness);
    float prom2 = sfFlareArc(pos, promFoot2A, promFoot2B, promHeight * 0.7, promThickness * 0.8);
    float prom3 = sfFlareArc(pos, promFoot3A, promFoot3B, promHeight * 1.2, promThickness * 0.6);
    float promDensity = smoothstep(promThickness * 4.0, 0.0, prom1) * 0.3
                      + smoothstep(promThickness * 3.0, 0.0, prom2) * 0.2
                      + smoothstep(promThickness * 3.5, 0.0, prom3) * 0.25;
    promDensity *= (0.5 + magneticField * 0.5) * sectionFlareCount;

    // CME density
    float cmeDens = 0.0;
    if (drumOnset > 0.3 || onsetSnap > 0.4) {
      cmeDens += sfCMEDensity(pos, cmeLaunchTime, drumOnset * sectionFlareCount, cmeLaunchDir);
    }

    // Climax CME: massive, engulfs camera
    if (climaxBoost > 0.1) {
      cmeDens += sfCMEDensity(pos, climaxCMEStart, climaxBoost * 1.5, climaxCMEDir) * 2.0;
    }

    // Jam: extra eruption sites
    if (sJam > 0.1) {
      vec3 jamDir1 = normalize(vec3(sin(uDynamicTime * 0.3), 0.5, cos(uDynamicTime * 0.25)));
      vec3 jamDir2 = normalize(vec3(-cos(uDynamicTime * 0.2), 0.3, sin(uDynamicTime * 0.35)));
      cmeDens += sfCMEDensity(pos, uDynamicTime - 1.5, sJam * 0.6, jamDir1);
      cmeDens += sfCMEDensity(pos, uDynamicTime - 0.8, sJam * 0.4, jamDir2);
    }

    float totalDensity = coronaDens + promDensity + cmeDens;
    if (totalDensity < 0.001) continue;

    float alpha = totalDensity * (1.0 - coronaAlpha);

    // Corona color: warm near surface, bluer further out
    float surfDist = distFromCenter - SF_SUN_RADIUS;
    vec3 coronaColor = mix(
      hsv2rgb(vec3(hue1 + 0.05, sat * 0.6, 0.9)),
      hsv2rgb(vec3(hue2 + 0.15, sat * 0.3, 0.7)),
      smoothstep(0.0, 3.0, surfDist)
    );

    // Timbral brightness shifts corona color temperature
    coronaColor = mix(coronaColor, coronaColor * vec3(0.8, 0.9, 1.0), timbralBright * 0.4);

    // Prominence color: hot flowing plasma
    vec3 promColor = hsv2rgb(vec3(hue1 + 0.08, sat * 0.8, 1.0));
    vec3 cmeColor = mix(
      hsv2rgb(vec3(hue2 + 0.05, sat * 0.5, 1.0)),
      vec3(0.9, 0.95, 1.0),
      climaxBoost * 0.5
    );

    // Blend colors by contribution
    float totalWeight = max(coronaDens + promDensity + cmeDens, 0.001);
    vec3 stepColor = (coronaColor * coronaDens + promColor * promDensity + cmeColor * cmeDens) / totalWeight;

    // Self-emission: denser = brighter
    stepColor *= 1.0 + totalDensity * 5.0 * energy;

    coronaAccum += stepColor * alpha;
    coronaAlpha += alpha;
  }

  // Composite corona over surface
  col = col * (1.0 - coronaAlpha * 0.3) + coronaAccum;

  // ================================================================
  // SOLAR WIND RADIALS (drum-driven pulsing rays)
  // ================================================================

  if (stemDrums > 0.05) {
    float windDist = length(screenP);
    float windAngle = atan(screenP.y, screenP.x);
    float windRays = sin(windAngle * 12.0 + uDynamicTime * 2.0) * 0.5 + 0.5;
    float windPulse = smoothstep(0.5, 0.1, abs(windDist - 0.3 - stemDrums * 0.2));
    float windGlow = windRays * windPulse * stemDrums * 0.08;
    col += hsv2rgb(vec3(hue1 + 0.03, sat * 0.4, windGlow));
  }

  // ================================================================
  // MAGNETIC FIELD ENERGY FORECAST BUILDUP
  // ================================================================

  magneticField += forecast * 0.025;
  magneticField += tension * 0.015;
  magneticField += fbm3(vec3(screenP * 3.0, slowTime)) * 0.005 * energy;
  magneticField = clamp(magneticField, 0.0, 1.0);

  // Drum onset heats the plasma
  plasmaTemp += drumOnset * 0.15 * sectionFlareCount;
  plasmaTemp += onsetSnap * 0.08;
  plasmaTemp += climaxBoost * 0.3;
  plasmaTemp = clamp(plasmaTemp, 0.0, 1.0);

  // ================================================================
  // BACKGROUND: deep space behind the sun
  // ================================================================

  if (!surfaceFound && coronaAlpha < 0.1) {
    // Distant stars
    float starHash = fract(sin(dot(floor(rd * 200.0), vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float starMask = step(0.992, starHash);
    float starBright = starHash * starMask * 0.4;
    col += vec3(starBright);

    // Faint background glow
    col += vec3(0.01, 0.005, 0.015);
  }

  // ================================================================
  // SPICULES: tiny jets at the limb
  // ================================================================

  if (surfaceFound) {
    float limbGraze = 1.0 - abs(dot(surfaceNorm, -rd));
    if (limbGraze > 0.7) {
      float spicNoise = snoise(vec3(surfacePos * 20.0 + vec3(uDynamicTime * 2.0, 0.0, 0.0)));
      float spicules = smoothstep(0.3, 0.8, spicNoise) * smoothstep(0.7, 0.95, limbGraze);
      vec3 spicColor = hsv2rgb(vec3(hue1 + 0.10, sat * 0.5, 0.8));
      col += spicColor * spicules * 0.15 * (0.5 + mids * 0.5);
    }
  }

  // ================================================================
  // CLIMAX CAMERA ENGULF
  // ================================================================

  if (climaxBoost > 0.5) {
    // Screen-space plasma wash approaching the camera
    float washDist = length(screenP);
    float washNoise = fbm3(vec3(screenP * 3.0 + vec3(uDynamicTime * 0.5), uDynamicTime * 0.3));
    float washMask = smoothstep(1.5, 0.0, washDist) * climaxBoost;
    washMask *= 0.5 + washNoise * 0.5;
    vec3 washColor = mix(
      hsv2rgb(vec3(hue1 + 0.05, sat * 0.6, 0.9)),
      vec3(1.0, 0.95, 0.85),
      climaxBoost * 0.4
    );
    col = mix(col, washColor, washMask * 0.6);

    // Extra brightness surge
    col *= 1.0 + climaxBoost * 0.4;
  }

  // ================================================================
  // SPACE SCORE DIMMING (quiet sun)
  // ================================================================

  col *= 1.0 - spaceScore * 0.25;

  // ================================================================
  // DEAD ICONOGRAPHY
  // ================================================================

  {
    float nf = fbm3(vec3(screenP * 2.0, slowTime));
    vec3 iconCol1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 iconCol2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, iconCol1, iconCol2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, iconCol1, iconCol2, nf, uSectionIndex);
  }

  // ================================================================
  // SEMANTIC MODULATION
  // ================================================================

  col *= 1.0 + uSemanticCosmic * 0.15;
  col *= 1.0 + uSemanticAggressive * 0.08;

  // ================================================================
  // POST-PROCESSING
  // ================================================================

  col = applyPostProcess(col, uv, screenP);

  // Store plasma state in RG, visual in RGB
  gl_FragColor = vec4(col, 1.0);
  gl_FragColor.r = mix(col.r, plasmaTemp, 0.5);
  gl_FragColor.g = mix(col.g, magneticField, 0.5);
}
`;
