/**
 * Warp Field — raymarched hyperspace tunnel.
 * The fabric of spacetime is visible as a grid/lattice structure that stretches
 * and warps as you accelerate to warp speed. Star streaks elongate into lines.
 * A warp bubble distortion surrounds the camera. The space grid shows curvature.
 *
 * Visual aesthetic:
 *   - Quiet (sublight): gentle lattice glow, scattered stars, flat grid
 *   - Building: grid begins curving, stars start to streak, bubble forms
 *   - Peak (warp): tunnel of stretched lattice, long star streaks, full bubble
 *   - Climax: breakthrough — lattice shatters, white flash, emerge in new space
 *
 * Audio reactivity:
 *   uBass              -> grid deformation amplitude
 *   uEnergy            -> warp speed / star streak length
 *   uDrumOnset         -> warp pulse (grid ripple)
 *   uVocalPresence     -> warp bubble glow intensity
 *   uHarmonicTension   -> spacetime curvature
 *   uSectionType       -> jam=maximum warp, space=sublight/still grid,
 *                          chorus=warp engage
 *   uClimaxPhase       -> warp breakthrough into new space
 *   uBeatSnap          -> lattice pulse
 *   uHighs             -> high-frequency lattice detail
 *   uMids              -> bubble refraction intensity
 *   uSpectralFlux      -> grid turbulence
 *   uImprovisationScore -> field instability / chaos
 *   uTimbralBrightness -> star color temperature
 *   uDynamicRange      -> depth of tunnel visibility
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const warpFieldVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const warpFieldFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ bloomEnabled: true, caEnabled: true, halationEnabled: true, grainStrength: "light", thermalShimmerEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 60.0
#define SURF_DIST 0.002

// ─── Section-type extraction ───
// 0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space
float wfSectionJam(float st) {
  return smoothstep(4.5, 5.5, st) * (1.0 - step(5.5, st));
}
float wfSectionSpace(float st) {
  return smoothstep(6.5, 7.5, st);
}
float wfSectionChorus(float st) {
  return smoothstep(1.5, 2.5, st) * (1.0 - step(2.5, st));
}
float wfSectionSolo(float st) {
  return smoothstep(3.5, 4.5, st) * (1.0 - step(4.5, st));
}

// ─── Hash ───
float wfHash(vec2 coord) {
  return fract(sin(dot(coord, vec2(127.1, 311.7))) * 43758.5453);
}
float wfHash3(vec3 coord) {
  return fract(sin(dot(coord, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// ─── Warp speed factor (0 = sublight, 1 = full warp) ───
float wfWarpSpeed(float energy, float jam, float space, float chorus, float climax) {
  float base = energy * 0.6;
  // Jam: maximum warp
  base = mix(base, 0.95, jam);
  // Space: sublight, nearly still
  base *= mix(1.0, 0.08, space);
  // Chorus: warp engage — strong forward push
  base = mix(base, max(base, 0.7), chorus);
  // Climax breakthrough: push past 1.0 for overdrive
  base += smoothstep(1.5, 2.5, climax) * 0.5;
  return clamp(base, 0.0, 1.5);
}

// ─── Spacetime grid lattice SDF ───
// Returns distance to an infinite 3D lattice (grid of lines in all 3 axes).
// The lattice spacing warps based on curvature.
float wfGrid(vec3 pos, float spacing, float curvature, float deformAmp) {
  // Apply curvature: bend grid lines based on distance from tunnel center
  float radialDist = length(pos.xy);
  vec3 warpedPos = pos;
  // Curvature bends the grid more at the edges
  warpedPos.xy += normalize(pos.xy + 0.001) * curvature * radialDist * 0.15 * sin(pos.z * 0.3);
  // Bass deformation: low-frequency wobble
  warpedPos += vec3(
    sin(pos.z * 0.5 + pos.y * 0.3) * deformAmp,
    cos(pos.z * 0.4 + pos.x * 0.3) * deformAmp,
    sin(pos.x * 0.5 + pos.y * 0.4) * deformAmp * 0.5
  );

  // Grid: thin cylinders along each axis
  vec3 gridPos = mod(warpedPos + spacing * 0.5, spacing) - spacing * 0.5;
  float lineXY = length(gridPos.xy);  // lines along Z
  float lineXZ = length(gridPos.xz);  // lines along Y
  float lineYZ = length(gridPos.yz);  // lines along X
  float gridThickness = 0.025;
  float gridDist = min(min(lineXY, lineXZ), lineYZ) - gridThickness;
  return gridDist;
}

// ─── Warp bubble SDF ───
// Hollow sphere around the camera, visible as a refractive shell
float wfBubble(vec3 pos, vec3 camPos, float bubbleRadius, float bubbleThickness) {
  float dist = length(pos - camPos);
  return abs(dist - bubbleRadius) - bubbleThickness;
}

// ─── Combined scene SDF ───
float wfMap(vec3 pos, float gridSpacing, float curvature, float deformAmp,
            vec3 camPos, float bubbleRadius, float bubbleThick, float warpSpd) {
  // Grid lattice — the fabric of spacetime
  float grid = wfGrid(pos, gridSpacing, curvature, deformAmp);

  // Warp bubble — hollow sphere shell
  float bubble = wfBubble(pos, camPos, bubbleRadius, bubbleThick);

  // At high warp, the grid thins and stretches — increase effective distance
  float gridStretch = mix(1.0, 0.6, clamp(warpSpd, 0.0, 1.0));
  grid *= gridStretch;

  return min(grid, bubble);
}

// ─── Star streaks ───
// Procedural star streaks along the Z axis (direction of warp travel).
// Returns brightness. Stars become long lines at high warp.
vec3 wfStarStreak(vec3 rayOrigin, vec3 rayDir, float warpSpd, float timeSlow,
                  float timbralBright) {
  vec3 streakCol = vec3(0.0);
  float streakLen = mix(0.02, 2.5, clamp(warpSpd, 0.0, 1.0));

  // Layer 3 depths of star fields
  for (int layer = 0; layer < 3; layer++) {
    float layerScale = 8.0 + float(layer) * 6.0;
    float layerSpeed = 1.0 + float(layer) * 0.5;
    float layerBright = 1.0 - float(layer) * 0.25;

    // Project ray into star planes along Z
    for (int idx = 0; idx < 12; idx++) {
      float zPlane = float(idx) * 4.0 + float(layer) * 1.3;
      float zDist = zPlane - rayOrigin.z;
      if (zDist < 0.5 || abs(rayDir.z) < 0.001) continue;
      float param = zDist / rayDir.z;
      if (param < 0.0 || param > MAX_DIST) continue;
      vec3 planePos = rayOrigin + rayDir * param;
      vec2 starCell = floor(planePos.xy * layerScale);
      float starHash = wfHash(starCell + float(layer) * 100.0);
      if (starHash < 0.85) continue;

      vec2 starCenter = (starCell + 0.5 + vec2(wfHash(starCell + 0.1), wfHash(starCell + 0.2)) * 0.6 - 0.3) / layerScale;
      float starDist = length(planePos.xy - starCenter);

      // Streak elongation: stretch the star along Z in screen space
      float streakMask = exp(-starDist * starDist * mix(4000.0, 200.0, clamp(warpSpd, 0.0, 1.0)));

      // Twinkle
      float twinkle = 0.7 + 0.3 * sin(timeSlow * (3.0 + starHash * 5.0) + starHash * 100.0);

      // Color temperature from timbral brightness
      float starTemp = mix(0.3, 1.0, timbralBright);
      vec3 starColor = mix(
        vec3(1.0, 0.7, 0.4),   // warm (low brightness)
        vec3(0.7, 0.85, 1.0),  // cool (high brightness)
        starTemp * starHash
      );

      // Depth fade
      float depthFade = exp(-param * 0.04);

      streakCol += starColor * streakMask * twinkle * layerBright * depthFade * streakLen * 0.15;
    }
  }

  return streakCol;
}

// ─── Grid emission color ───
vec3 wfGridEmission(vec3 pos, float gridDist, float warpSpd, float hue1, float hue2,
                    float sat, float drumPulse, float beatPulseVal) {
  // Grid glows brighter when close to the line
  float glow = exp(-max(0.0, gridDist) * 60.0);

  // Warp makes grid shift from cool static to hot streaking
  float warmth = clamp(warpSpd, 0.0, 1.0);
  vec3 coolGrid = hsv2rgb(vec3(hue1, sat * 0.5, 0.4));       // sublight: blue-ish static
  vec3 hotGrid = hsv2rgb(vec3(hue2 + 0.05, sat * 0.9, 0.9)); // warp: saturated warm
  vec3 gridCol = mix(coolGrid, hotGrid, warmth);

  // Drum onset sends a pulse ripple through the grid
  gridCol *= 1.0 + drumPulse * 0.8;

  // Beat pulse brightens grid
  gridCol *= 1.0 + beatPulseVal * 0.15;

  // Z-depth color variation: further grid lines shift hue
  float zHueShift = sin(pos.z * 0.1) * 0.05;
  gridCol = hsv2rgb(vec3(
    rgb2hsv(gridCol).x + zHueShift,
    rgb2hsv(gridCol).y,
    rgb2hsv(gridCol).z
  ));

  return gridCol * glow;
}

// ─── Warp bubble glow ───
vec3 wfBubbleGlow(vec3 pos, vec3 camPos, float bubbleRadius, float bubbleDist,
                  float vocalGlow, float midRefract, float hue1, float sat) {
  float shell = exp(-abs(bubbleDist) * 40.0);

  // Fresnel-like effect: brighter at grazing angles
  vec3 bubbleNormal = normalize(pos - camPos);
  float fresnelAngle = 1.0 - abs(dot(bubbleNormal, normalize(pos - camPos - vec3(0.0, 0.0, 1.0))));
  float fresnel = pow(clamp(fresnelAngle, 0.0, 1.0), 2.0);

  // Bubble color: ethereal blue-white with vocal glow
  vec3 bubbleCol = hsv2rgb(vec3(hue1 + 0.55, sat * 0.3, 0.6 + vocalGlow * 0.4));
  bubbleCol += vec3(0.3, 0.5, 0.8) * fresnel * 0.5;

  // Refraction distortion intensity tied to mids
  float refractionVis = midRefract * 0.3;
  bubbleCol += vec3(0.1, 0.2, 0.4) * refractionVis;

  return bubbleCol * shell * (0.3 + vocalGlow * 0.7);
}

// ─── Tunnel fog / depth atmosphere ───
vec3 wfTunnelFog(float depth, float warpSpd, float hue1, float sat, float dynRange) {
  float fogDensity = mix(0.01, 0.04, clamp(warpSpd, 0.0, 1.0));
  // Dynamic range affects visibility depth
  fogDensity *= mix(1.2, 0.6, clamp(dynRange, 0.0, 1.0));
  float fogAmount = 1.0 - exp(-depth * fogDensity);
  vec3 fogColor = hsv2rgb(vec3(hue1 + 0.6, sat * 0.2, 0.05 + warpSpd * 0.1));
  return fogColor * fogAmount;
}

// ─── Warp pulse ring (drum onset ripple) ───
float wfDrumPulse(vec3 pos, vec3 camPos, float drumOnset, float timeSlow) {
  float distFromCam = length(pos - camPos);
  float pulseRadius = fract(timeSlow * 0.8) * 20.0;
  float pulseDist = abs(distFromCam - pulseRadius);
  float pulse = exp(-pulseDist * 2.0) * drumOnset;
  return pulse;
}

// ─── Climax breakthrough flash ───
vec3 wfBreakthrough(float climax, float climaxIntensity, float warpSpd, vec2 screenUV,
                    float hue2, float sat) {
  float breakthroughPhase = smoothstep(2.0, 3.0, climax);
  if (breakthroughPhase < 0.01) return vec3(0.0);

  // White flash from center
  float flashDist = length(screenUV);
  float flash = exp(-flashDist * flashDist * 3.0) * breakthroughPhase * climaxIntensity;

  // Emergence: new space colors bleed in
  vec3 newSpaceCol = hsv2rgb(vec3(hue2 + 0.3, sat * 0.7, 0.8));
  vec3 flashCol = mix(vec3(1.0, 0.98, 0.95), newSpaceCol, breakthroughPhase * 0.4);

  return flashCol * flash * 2.0;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  // ─── Clamp audio inputs ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float vocalGlow = clamp(uVocalPresence, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float spectralFlux = clamp(uSpectralFlux, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float climax = uClimaxPhase;
  float climaxInt = uClimaxIntensity;

  float timeSlow = uDynamicTime * 0.08;

  // ─── Section types ───
  float sJam = wfSectionJam(uSectionType);
  float sSpace = wfSectionSpace(uSectionType);
  float sChorus = wfSectionChorus(uSectionType);
  float sSolo = wfSectionSolo(uSectionType);

  // ─── Warp speed ───
  float warpSpd = wfWarpSpeed(energy, sJam, sSpace, sChorus, climax);

  // ─── Palette ───
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1;
  float forecastGlow = clamp(uEnergyForecast, 0.0, 1.0) * 0.08;
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.35, 0.95, energy) * uPaletteSaturation;

  // ─── Camera setup ───
  // Camera moves forward through the tunnel; warp speed controls Z velocity
  float camZ = uDynamicTime * (0.5 + warpSpd * 4.0);
  vec3 camOrigin = vec3(
    sin(timeSlow * 0.7) * 0.3 * (1.0 - warpSpd * 0.5), // gentle lateral drift at sublight
    cos(timeSlow * 0.5) * 0.2 * (1.0 - warpSpd * 0.5),
    camZ
  );

  // Improvisation adds camera jitter
  camOrigin.xy += vec2(
    snoise(vec3(timeSlow * 3.0, 0.0, 0.0)),
    snoise(vec3(0.0, timeSlow * 3.0, 0.0))
  ) * improv * 0.15;

  // Look direction: forward along Z with slight convergence at high warp
  vec3 lookDir = normalize(vec3(
    screenPos.x * mix(1.0, 0.7, clamp(warpSpd, 0.0, 1.0)),
    screenPos.y * mix(1.0, 0.7, clamp(warpSpd, 0.0, 1.0)),
    mix(1.5, 2.5, clamp(warpSpd, 0.0, 1.0))
  ));

  // ─── Scene parameters ───
  float gridSpacing = mix(2.5, 1.8, clamp(warpSpd, 0.0, 1.0));
  // Highs add finer lattice detail by tightening spacing
  gridSpacing *= mix(1.0, 0.8, highs * 0.5);

  float curvature = tension * 1.2 + bass * 0.3;
  // Solo: dramatic curvature increase
  curvature *= 1.0 + sSolo * 0.6;

  float deformAmp = bass * 0.4 + spectralFlux * 0.15;

  float bubbleRadius = 3.0 + vocalGlow * 1.5;
  float bubbleThickness = 0.08 + mids * 0.04;

  // ─── Raymarching ───
  float totalDist = 0.0;
  vec3 marchPos = camOrigin;
  float minGridDist = 999.0;
  float minBubbleDist = 999.0;
  int stepCount = 0;

  for (int idx = 0; idx < MAX_STEPS; idx++) {
    marchPos = camOrigin + lookDir * totalDist;

    float gridDist = wfGrid(marchPos, gridSpacing, curvature, deformAmp);
    float bubbleDist = wfBubble(marchPos, camOrigin, bubbleRadius, bubbleThickness);
    float sceneDist = min(gridDist, bubbleDist);

    // Track closest approach for glow
    minGridDist = min(minGridDist, max(0.0, gridDist));
    minBubbleDist = min(minBubbleDist, max(0.0, abs(bubbleDist)));

    if (sceneDist < SURF_DIST || totalDist > MAX_DIST) break;

    // Adaptive step: larger steps far from surfaces, smaller near
    totalDist += sceneDist * 0.7;
    stepCount = idx;
  }

  // ─── Ambient occlusion from step count ───
  float occl = 1.0 - float(stepCount) / float(MAX_STEPS) * 0.5;
  occl = clamp(occl, 0.3, 1.0);

  // ─── Compose color ───
  vec3 col = vec3(0.0);

  // Background: deep space
  vec3 bgCol = hsv2rgb(vec3(hue1 + 0.6, sat * 0.15, 0.008));
  // Subtle nebula wash in the background
  float nebulaNoise = fbm3(vec3(screenPos * 1.5, timeSlow * 0.1));
  bgCol += hsv2rgb(vec3(hue2 + nebulaNoise * 0.1, sat * 0.2, 0.015 + nebulaNoise * 0.02));
  col = bgCol;

  // ─── Star streaks (always behind everything) ───
  vec3 stars = wfStarStreak(camOrigin, lookDir, warpSpd, timeSlow, timbralBright);
  col += stars;

  // ─── Grid emission ───
  float drumPulseVal = wfDrumPulse(marchPos, camOrigin, drumOnset, timeSlow);
  float bpVal = pow(1.0 - fract(uMusicalTime), 4.0) * beatSnap;
  vec3 gridEmission = wfGridEmission(marchPos, minGridDist, warpSpd, hue1, hue2,
                                      sat, drumPulseVal, bpVal);
  // AO affects grid brightness
  gridEmission *= occl;
  // Grid fades at distance
  float gridDepthFade = exp(-totalDist * 0.03);
  col += gridEmission * gridDepthFade * mix(0.5, 1.5, clamp(warpSpd, 0.0, 1.0));

  // ─── Warp bubble glow ───
  vec3 bubbleGlowCol = wfBubbleGlow(marchPos, camOrigin, bubbleRadius, minBubbleDist,
                                     vocalGlow, mids, hue1, sat);
  col += bubbleGlowCol;

  // ─── Tunnel fog ───
  vec3 fog = wfTunnelFog(totalDist, warpSpd, hue1, sat, dynRange);
  col += fog;

  // ─── Warp speed lines (radial from center at high warp) ───
  {
    float radialAngle = atan(screenPos.y, screenPos.x);
    float radialDist = length(screenPos);
    // Radial speed lines that streak from center
    float speedLine = 0.0;
    for (int idx = 0; idx < 6; idx++) {
      float lineAngle = float(idx) * TAU / 6.0 + timeSlow * 0.5;
      float angleDiff = abs(mod(radialAngle - lineAngle + PI, TAU) - PI);
      speedLine += exp(-angleDiff * 40.0) * smoothstep(0.1, 0.5, radialDist);
    }
    speedLine *= clamp(warpSpd - 0.3, 0.0, 1.0) * 0.15;
    vec3 speedLineCol = hsv2rgb(vec3(hue2 + 0.1, sat * 0.4, 0.8));
    col += speedLineCol * speedLine;
  }

  // ─── Drum onset pulse ring (visible in the tunnel) ───
  {
    float ringRadius = fract(timeSlow * 0.8 + drumOnset * 0.5) * 1.5;
    float ringDist = abs(length(screenPos) - ringRadius);
    float ringGlow = exp(-ringDist * 30.0) * drumOnset * 0.5;
    vec3 ringCol = hsv2rgb(vec3(hue1 + 0.15, sat * 0.7, 0.9));
    col += ringCol * ringGlow;
  }

  // ─── Central convergence glow (vanishing point) ───
  {
    float centerDist = length(screenPos);
    float convergence = exp(-centerDist * centerDist * mix(8.0, 3.0, clamp(warpSpd, 0.0, 1.0)));
    vec3 convColor = hsv2rgb(vec3(hue2 + 0.05, sat * 0.3, 0.3 + warpSpd * 0.5));
    col += convColor * convergence * mix(0.1, 0.6, clamp(warpSpd, 0.0, 1.0));
  }

  // ─── Peak approach glow ───
  col *= 1.0 + peakApproach * 0.15 + forecastGlow;

  // ─── Climax boost ───
  float isClimax = step(1.5, climax) * step(climax, 3.5);
  float climaxBoost = isClimax * climaxInt;
  col *= 1.0 + climaxBoost * 0.4;

  // ─── Climax breakthrough flash ───
  col += wfBreakthrough(climax, climaxInt, warpSpd, screenPos, hue2, sat);

  // ─── SDF icon emergence ───
  {
    float nf = fbm3(vec3(screenPos * 2.0, timeSlow));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(screenPos, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // ─── Hero icon emergence ───
  {
    float nf = fbm3(vec3(screenPos * 1.5, timeSlow + 50.0));
    vec3 c1 = hsv2rgb(vec3(hue1 + 0.1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2 + 0.1, sat, 1.0));
    col += heroIconEmergence(screenPos, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ─── Vignette ───
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.003, 0.002, 0.008), col, vignette);

  // ─── Post-processing ───
  col = applyPostProcess(col, uv, screenPos);
  gl_FragColor = vec4(col, 1.0);
}
`;
