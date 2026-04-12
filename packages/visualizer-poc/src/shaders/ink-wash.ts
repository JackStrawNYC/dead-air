/**
 * Ink Wash — raymarched 3D sumi-e ink painting come to life.
 * Ink drops fall into water and bloom into volumetric clouds. The camera is
 * submerged, watching ink diffuse in real-time. Tendrils of black ink curl
 * and spread through clear water. Minimalist Japanese aesthetic.
 *
 * Feedback: Yes (uPrevFrame for ink persistence / temporal smoothing)
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → ink bloom expansion (tendril radius)
 *   uEnergy           → ink density / tendril count in raymarch
 *   uDrumOnset        → new ink drop event (splash)
 *   uVocalPresence    → water clarity / overhead light intensity
 *   uHarmonicTension  → ink viscosity (thin wisps vs thick clouds)
 *   uSectionType      → jam=rapid drops, space=single tendril dissolving,
 *                        chorus=full ink bloom, solo=swirling vortex
 *   uClimaxPhase      → ink fills everything then clears to crystal water
 *   uClimaxIntensity  → climax strength multiplier
 *   uSlowEnergy       → drift speed of ink tendrils
 *   uMelodicDirection → tendril curl direction bias
 *   uMelodicPitch     → ink drop fall height
 *   uPeakApproaching  → ink gathers density before release
 *   uChromaHue        → subtle ink tint
 *   uPalettePrimary   → primary ink hue
 *   uPaletteSecondary → secondary caustic tint
 *   uPaletteSaturation → overall saturation control
 *   uBeatStability    → curl coherence
 *   uDynamicRange     → density contrast range
 *   uSpaceScore       → ambient dissolution rate
 *   uTimbralBrightness → caustic sharpness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const inkWashVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const inkWashFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: 0.1,
  halationEnabled: false,
  grainStrength: "light",
  temporalBlendEnabled: true,
  caEnabled: false,
  lightLeakEnabled: false,
})}

varying vec2 vUv;

#define PI 3.14159265
#define IW_MAX_STEPS 64
#define IW_MAX_DIST 12.0
#define IW_SURF_DIST 0.002
#define IW_VOL_STEPS 48

// ─── Ink drop positions (up to 6 concurrent drops) ───
// Seeded from musical time so each beat gets a unique drop location.
vec3 iwDropPos(float seed) {
  return vec3(
    fract(sin(seed * 12.9898) * 43758.5453) * 3.0 - 1.5,
    2.0 + fract(sin(seed * 78.233) * 43758.5453) * 1.5,
    fract(sin(seed * 45.164) * 43758.5453) * 3.0 - 1.5
  );
}

// ─── Ink density field: the core volumetric SDF ───
// Models ink as a density field diffusing through water.
// Returns density 0-1 at world position wp.
float iwInkDensity(vec3 wp, float flowTime, float bass, float energy,
                   float tension, float onset, float sectionIdx,
                   float sJam, float sSpace, float sChorus, float sSolo,
                   float climaxFill, float melodicDir, float beatStab,
                   float dynRange) {
  float density = 0.0;

  // ── Primary ink cloud: FBM turbulence field ──
  // Tension controls viscosity: low tension = thin wisps, high = thick clouds
  float viscosity = mix(0.3, 1.0, tension);
  float turbScale = mix(1.8, 0.9, viscosity);

  // Curl advection: ink tendrils follow fluid dynamics
  vec3 curlOffset = vec3(0.0);
  if (energy > 0.1) {
    vec3 curl = curlNoise(wp * 0.6 + vec3(0.0, flowTime * 0.08, 0.0));
    // Melodic direction biases curl (left-right swirl)
    curl.x += melodicDir * 0.3;
    // Beat stability affects curl coherence
    float curlStr = mix(0.4, 0.15, beatStab);
    curlOffset = curl * curlStr * (0.5 + energy * 0.5);
  }

  vec3 advected = wp + curlOffset;

  // Main ink volume: layered FBM
  float mainInk = fbm6(advected * turbScale + vec3(0.0, -flowTime * 0.12, 0.0));
  mainInk = mainInk * 0.5 + 0.5; // remap to 0-1

  // Dynamic range controls density contrast
  float contrastPow = mix(1.5, 3.0, dynRange);
  mainInk = pow(mainInk, contrastPow);

  // Energy drives overall ink presence
  mainInk *= mix(0.15, 0.7, energy);

  // Bass expands ink bloom radius (lower frequencies = larger clouds)
  float bloomRadius = mix(1.0, 2.5, bass);
  float distFromCenter = length(wp.xz);
  float bloomMask = smoothstep(bloomRadius, bloomRadius * 0.3, distFromCenter);
  mainInk *= bloomMask;

  density += mainInk;

  // ── Ink drops: discrete spherical sources ──
  float dropSeed = floor(uMusicalTime * 2.0) + sectionIdx * 100.0;
  int dropCount = int(mix(2.0, 5.0, energy));
  // Jam = rapid drops, space = fewer
  dropCount += int(sJam * 3.0) - int(sSpace * 2.0);

  for (int i = 0; i < 6; i++) {
    if (i >= dropCount) break;
    float fi = float(i);
    float seed = dropSeed + fi * 31.7;
    vec3 dPos = iwDropPos(seed);

    // Drops fall over time (gravity in water, slow)
    float dropAge = fract(uMusicalTime * 2.0 + fi * 0.17);
    dPos.y -= dropAge * 2.5;

    // Drop radius expands as it diffuses
    float dropRadius = (0.15 + bass * 0.25) * (0.5 + dropAge * 1.5);
    dropRadius *= viscosity;

    float dist = length(wp - dPos);
    float dropDensity = smoothstep(dropRadius, dropRadius * 0.1, dist);

    // Turbulent edge: organic rather than spherical
    float turbEdge = snoise(vec3((wp - dPos) * 6.0 / dropRadius, seed * 0.1));
    dropDensity *= smoothstep(-0.3, 0.3, turbEdge);

    density += dropDensity * 0.4 * (1.0 - dropAge * 0.5);
  }

  // ── Drum onset: fresh splash event ──
  if (onset > 0.3) {
    vec3 splashPos = iwDropPos(floor(uMusicalTime * 8.0) + 777.0);
    splashPos.y = 1.5;
    float splashDist = length(wp - splashPos);
    float splashRadius = 0.3 + onset * 0.5;
    float splash = smoothstep(splashRadius, 0.0, splashDist) * onset;
    // Splash has radial tendrils
    float tendrilNoise = snoise(vec3(normalize(wp - splashPos) * 4.0, uDynamicTime));
    splash *= 0.5 + 0.5 * smoothstep(-0.2, 0.4, tendrilNoise);
    density += splash * 0.6;
  }

  // ── Section-type behaviors ──
  // Jam: rapid swirling density
  density *= mix(1.0, 1.4, sJam);
  // Space: single tendril dissolving (reduce density, increase turbulence)
  density *= mix(1.0, 0.3, sSpace);
  // Chorus: full ink bloom
  density *= mix(1.0, 1.6, sChorus);
  // Solo: concentrated vortex
  if (sSolo > 0.1) {
    float vortexDist = length(wp.xz);
    float vortex = smoothstep(1.5, 0.0, vortexDist) * sSolo * 0.3;
    density += vortex;
  }

  // ── Climax: ink fills then clears ──
  // Phase 1 (build): gathering
  // Phase 2 (peak): total ink saturation
  // Phase 3 (release): crystal clear
  density += climaxFill;

  return clamp(density, 0.0, 1.0);
}

// ─── Water absorption color: Beer-Lambert light transmission ───
// Ink absorbs light; thicker ink = darker, with subtle warm tones at edges.
vec3 iwWaterColor(float density, float depth, float vocalClarity,
                  float hue1, float hue2, float palSat, float timbralBright) {
  // Clear water base: pale blue-green, brighter with vocal presence
  vec3 clearWater = mix(
    vec3(0.06, 0.10, 0.14),
    vec3(0.15, 0.22, 0.28),
    vocalClarity
  );

  // Ink color: near-black sumi-e with very subtle hue from palette
  float sat = palSat * 0.12;
  vec3 inkBlack = hsv2rgb(vec3(hue1, sat, 0.04));
  // Diluted ink edge: warm sepia (watered-down sumi-e look)
  vec3 inkEdge = hsv2rgb(vec3(hue2, sat * 2.0, 0.12));

  // Beer-Lambert absorption
  float absorption = 1.0 - exp(-density * 4.0);

  // Thin ink shows warm edge color; thick ink goes to near-black
  vec3 inkColor = mix(inkEdge, inkBlack, smoothstep(0.2, 0.7, density));

  // Blend water and ink
  vec3 col = mix(clearWater, inkColor, absorption);

  // Depth fog: deeper = more muted
  float depthFog = exp(-depth * 0.15);
  col *= depthFog;

  return col;
}

// ─── Caustics: light patterns from water surface above ───
// Simulates sunlight refracting through a wavy water surface.
float iwCaustics(vec3 wp, float flowTime, float timbralBright) {
  // Project world position onto XZ plane for caustic pattern
  vec2 cPos = wp.xz * 2.0 + vec2(flowTime * 0.15, flowTime * 0.08);

  // Two layers of displaced sine waves (interference pattern)
  float c1 = sin(cPos.x * 3.0 + sin(cPos.y * 2.5 + flowTime * 0.3) * 1.5);
  float c2 = sin(cPos.y * 3.5 + sin(cPos.x * 2.0 + flowTime * 0.2) * 1.2);
  float caustic = c1 * c2;

  // Sharpen the caustic lines (power curve)
  float sharpness = mix(2.0, 5.0, timbralBright);
  caustic = pow(max(0.0, caustic), sharpness);

  // Depth attenuation: caustics are brightest near the surface
  float surfaceDist = max(0.0, 3.0 - wp.y);
  caustic *= exp(-surfaceDist * 0.4);

  return caustic;
}

// ─── Water surface SDF (for overhead light refraction boundary) ───
float iwWaterSurface(vec3 wp, float flowTime) {
  float waveHeight = 3.0;
  waveHeight += sin(wp.x * 1.5 + flowTime * 0.4) * 0.15;
  waveHeight += sin(wp.z * 2.0 + flowTime * 0.3) * 0.10;
  waveHeight += snoise(vec3(wp.xz * 0.8, flowTime * 0.15)) * 0.2;
  return wp.y - waveHeight;
}

// ─── Map function: signed distance to nearest geometry ───
// The scene is mostly volumetric (empty water), but we define the water
// surface as a boundary for overhead light rays.
float iwMap(vec3 wp, float flowTime) {
  // Water surface above
  float waterSurf = iwWaterSurface(wp, flowTime);
  // Floor below (sandy bottom, subtle)
  float floor = -(wp.y + 2.0);
  return min(-waterSurf, floor);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ─── Audio parameter extraction ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalClarity = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.06;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.04;

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Space score can override section behavior
  float spaceOverride = smoothstep(0.5, 0.8, spaceScore);
  sSpace = max(sSpace, spaceOverride);

  // ─── Climax behavior ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  // Build phase: ink gathers
  float isBuild = step(0.5, uClimaxPhase) * (1.0 - step(1.5, uClimaxPhase));
  // Peak phase: total saturation
  float isPeak = step(1.5, uClimaxPhase) * (1.0 - step(2.5, uClimaxPhase));
  // Release phase: clearing
  float isRelease = step(2.5, uClimaxPhase) * (1.0 - step(3.5, uClimaxPhase));

  float climaxFill = isBuild * climaxIntensity * 0.2
                   + isPeak * climaxIntensity * 0.5
                   - isRelease * climaxIntensity * 0.3;

  float flowTime = uDynamicTime * (0.05 + slowE * 0.03)
                 * mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace);

  // ─── Palette ───
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float palSat = uPaletteSaturation;

  // ─── Ray setup (submerged camera) ───
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Submerge camera: override position to be underwater
  // Camera drifts gently with slow energy
  ro.y = mix(0.5, 1.5, melodicPitch);
  ro.x += sin(flowTime * 0.3) * 0.3;
  ro.z += cos(flowTime * 0.25) * 0.2;

  // ─── Volumetric ink raymarch ───
  // We march through the water volume, accumulating ink density.
  vec3 inkAccum = vec3(0.0);
  float inkAlpha = 0.0;
  float causticAccum = 0.0;
  float totalDepth = 0.0;

  // Step count adapts to energy (quality vs performance)
  int volSteps = int(mix(28.0, 48.0, energy))
               + int(sJam * 8.0) - int(sSpace * 8.0);
  float stepSize = IW_MAX_DIST / float(IW_VOL_STEPS);

  // Peak approaching: pre-gather density
  float preGather = peakApproach * 0.15;

  for (int i = 0; i < IW_VOL_STEPS; i++) {
    if (i >= volSteps) break;
    if (inkAlpha > 0.95) break;

    float fi = float(i);
    float marchDist = fi * stepSize + stepSize * 0.5;
    vec3 wp = ro + rd * marchDist;

    // Check if we've hit water surface (above) or floor (below)
    float surfCheck = iwWaterSurface(wp, flowTime);
    if (surfCheck > 0.0) continue; // above water surface, skip
    if (wp.y < -2.0) break; // below floor

    // Sample ink density at this point
    float density = iwInkDensity(
      wp, flowTime, bass, energy, tension, onset,
      uSectionIndex, sJam, sSpace, sChorus, sSolo,
      climaxFill + preGather, melodicDir, beatStab, dynRange
    );

    if (density > 0.005) {
      // Color this density sample
      vec3 sampleColor = iwWaterColor(
        density, marchDist, vocalClarity,
        hue1, hue2, palSat, timbralBright
      );

      // Overhead light: vocal presence opens a window of light from above
      float overheadLight = vocalClarity * 0.6;
      // Light ray angle: slightly off-center for drama
      vec3 lightDir = normalize(vec3(0.2, 1.0, 0.1));
      float lightDot = max(0.0, dot(normalize(vec3(0.0, 1.0, 0.0)), lightDir));

      // Light transmission through ink (thicker ink blocks more light)
      float transmission = exp(-density * 2.5);
      overheadLight *= transmission * lightDot;

      // Surface proximity brightens (closer to light source)
      float surfProx = smoothstep(-2.0, 3.0, wp.y);
      overheadLight *= surfProx;

      sampleColor += vec3(0.2, 0.25, 0.3) * overheadLight;

      // Caustics from above (only visible in clear water areas)
      float causticVal = iwCaustics(wp, flowTime, timbralBright);
      causticVal *= (1.0 - density) * vocalClarity;
      sampleColor += vec3(0.3, 0.35, 0.4) * causticVal * 0.3;

      causticAccum += causticVal * (1.0 - inkAlpha) * 0.05;

      // Accumulate with front-to-back compositing
      float sampleAlpha = density * stepSize * 3.0;
      sampleAlpha = min(sampleAlpha, 1.0 - inkAlpha);

      inkAccum += sampleColor * sampleAlpha;
      inkAlpha += sampleAlpha;
      totalDepth += marchDist * sampleAlpha;
    }
  }

  // Normalize depth
  if (inkAlpha > 0.01) {
    totalDepth /= inkAlpha;
  }

  // ─── Background: deep water with subtle caustics ───
  // Where ink is absent, we see clear water
  vec3 deepWater = mix(
    vec3(0.03, 0.06, 0.10),
    vec3(0.08, 0.14, 0.20),
    vocalClarity
  );

  // Distant caustic shimmer in background
  float bgCaustic = iwCaustics(ro + rd * 8.0, flowTime, timbralBright);
  deepWater += vec3(0.08, 0.10, 0.12) * bgCaustic * vocalClarity * 0.5;

  // Depth gradient: looking up = lighter, looking down = darker
  float viewAngle = dot(rd, vec3(0.0, 1.0, 0.0));
  deepWater *= 0.7 + 0.6 * max(0.0, viewAngle);

  // ─── Composite ink over water ───
  vec3 col = mix(deepWater, inkAccum, inkAlpha);

  // Add accumulated caustics as additive light
  col += vec3(0.15, 0.18, 0.22) * causticAccum;

  // ─── Water surface light from above ───
  // Bright rippled light at the water surface (looking up)
  if (viewAngle > 0.0) {
    float surfaceBright = pow(max(0.0, viewAngle), 2.0);
    float surfRipple = snoise(vec3(screenP * 3.0, flowTime * 0.2));
    surfRipple = surfRipple * 0.5 + 0.5;
    surfaceBright *= surfRipple;
    surfaceBright *= vocalClarity * 0.4;
    col += vec3(0.2, 0.25, 0.3) * surfaceBright * (1.0 - inkAlpha * 0.7);
  }

  // ─── Ink edge glow: where dense ink meets clear water ───
  // Subtle warm glow at density boundaries (light scattering through ink)
  float edgeGlow = inkAlpha * (1.0 - inkAlpha) * 4.0; // peaks at 50% alpha
  vec3 edgeColor = hsv2rgb(vec3(hue1 + 0.05, palSat * 0.3, 0.15));
  col += edgeColor * edgeGlow * 0.3;

  // ─── Climax: crystal water clearing ───
  if (isRelease > 0.1) {
    float clearAmount = isRelease * climaxIntensity;
    vec3 crystalWater = vec3(0.12, 0.20, 0.28);
    // Caustics become brilliant during clearing
    float clearCaustic = iwCaustics(ro + rd * 4.0, flowTime, 1.0);
    crystalWater += vec3(0.2, 0.25, 0.3) * clearCaustic * 0.6;
    col = mix(col, crystalWater, clearAmount * 0.5);
  }

  // ─── Space: ambient dissolution shimmer ───
  if (sSpace > 0.1) {
    float shimmer = snoise(vec3(screenP * 5.0, uDynamicTime * 0.3));
    shimmer = shimmer * 0.5 + 0.5;
    col += vec3(0.02, 0.03, 0.04) * shimmer * sSpace * (1.0 - inkAlpha);
  }

  // ─── Beat + climax brightness ───
  col *= 1.0 + isClimax * climaxIntensity * 0.2;
  col *= 1.0 + uBeatSnap * 0.08;

  // ─── SDF icon emergence ───
  {
    float nf = fbm3(vec3(screenP * 2.0, flowTime * 0.3));
    vec3 c1 = hsv2rgb(vec3(hue1, palSat * 0.5, 0.8));
    vec3 c2 = hsv2rgb(vec3(hue2, palSat * 0.5, 0.7));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.4;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ─── Vignette: underwater lens darkening ───
  float vigScale = mix(0.32, 0.24, energy);
  float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.02, 0.04), col, vignette);

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
