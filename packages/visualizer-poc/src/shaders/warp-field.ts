/**
 * Warp Field — gravitational lensing of space-time grid and background starfield.
 * Central mass distorts spacetime; grid lines bend, stars streak through the lens.
 *
 * Visual aesthetic:
 *   - Quiet: subtle grid curvature, distant stars slowly drift, faint lensing halo
 *   - Building: warp deepens, grid distortion grows, Einstein ring forms
 *   - Peak: extreme lensing, light wraps fully around mass, photon sphere visible
 *   - Release: gravitational waves ripple outward, field relaxes
 *
 * Audio reactivity:
 *   uEnergy              -> warp field strength
 *   uBass                -> gravitational wave amplitude
 *   uBeatSnap            -> wave pulse origin
 *   uVocalEnergy          -> secondary lens mass
 *   uHarmonicTension     -> space-time curvature
 *   uImprovisationScore  -> field instability
 *   uClimaxPhase         -> singularity collapse + re-expansion
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

${buildPostProcessGLSL({ bloomEnabled: true, caEnabled: true, halationEnabled: true, grainStrength: "none", thermalShimmerEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Hash for star positions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Gravitational lensing deflection
// Deflects a ray passing at impact parameter b from a mass
// Schwarzschild deflection angle = 4GM / (c^2 * b) ~ strength / b
vec2 gravitationalDeflect(vec2 p, vec2 massPos, float strength) {
  vec2 delta = p - massPos;
  float dist = length(delta);
  float minDist = 0.02; // prevent singularity
  dist = max(dist, minDist);
  // Deflection toward mass, inversely proportional to distance
  vec2 dir = normalize(delta);
  float deflection = strength / (dist * dist + 0.01);
  return -dir * deflection;
}

// Grid pattern for space-time visualization
float spaceTimeGrid(vec2 p, float lineWidth) {
  vec2 grid = abs(fract(p) - 0.5);
  float lines = smoothstep(lineWidth + 0.005, lineWidth, min(grid.x, grid.y));
  return lines;
}

// Star field with gravitational distortion
float starField(vec2 uv, float scale) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale) - 0.5;

  float stars = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = id + neighbor;
      float h = hash(cellId);
      if (h > 0.90) {
        vec2 starPos = neighbor + vec2(hash(cellId + 0.1), hash(cellId + 0.2)) - 0.5 - f;
        float d = length(starPos);
        float twinkle = 0.7 + 0.3 * sin(uTime * (2.0 + h * 3.0) + h * 100.0);
        float star = smoothstep(0.04, 0.0, d) * twinkle;
        stars += star * (0.5 + h * 0.5);
      }
    }
  }
  return stars;
}

// Gravitational wave ripple
float gravWave(vec2 p, vec2 origin, float time, float amplitude) {
  float dist = length(p - origin);
  float wavePhase = dist * 12.0 - time * 4.0;
  float envelope = exp(-dist * 2.0) * exp(-max(0.0, time - dist * 3.0) * 0.5);
  return sin(wavePhase) * envelope * amplitude;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Clamp audio inputs
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float vocalMass = clamp(uVocalPresence, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.05;

  // Phase 1 uniform integrations
  float chromaHueMod = uChromaHue * 0.18;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float forecastGlow = clamp(uEnergyForecast, 0.0, 1.0) * 0.08;
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: stronger lensing, more grid distortion, faster streaks. Space: gentle, calm. Chorus: bright, wide.
  float sectionLensing = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.1, sChorus);
  float sectionGridDistort = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace);
  float sectionStreakSpeed = mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.2, sChorus);

  // --- Warp parameters ---
  // Primary mass at center
  float warpStrength = (0.02 + energy * 0.08 + tension * 0.04) * sectionLensing;

  // Climax singularity: extreme compression then re-expansion
  float climaxPhase = uClimaxPhase;
  float singularity = smoothstep(1.5, 2.5, climaxPhase) * uClimaxIntensity;
  warpStrength += singularity * 0.15;

  // Secondary mass from vocals (orbits primary)
  float secondaryOrbit = 0.25 + vocalMass * 0.1;
  vec2 secondaryPos = vec2(
    cos(uDynamicTime * 0.15) * secondaryOrbit,
    sin(uDynamicTime * 0.15) * secondaryOrbit
  );
  float secondaryStrength = vocalMass * 0.03;

  // --- Gravitational deflection of coordinates ---
  vec2 deflection = gravitationalDeflect(p, vec2(0.0), warpStrength);
  deflection += gravitationalDeflect(p, secondaryPos, secondaryStrength);

  // Field instability from improvisation
  if (improv > 0.1) {
    float instabNoise = snoise(vec3(p * 5.0, slowTime * 2.0)) * improv * 0.02;
    deflection += vec2(instabNoise, snoise(vec3(p * 5.0 + 30.0, slowTime * 2.0)) * improv * 0.02);
  }

  // Gravitational wave from beat
  float waveTime = fract(uMusicalTime) * 2.0;
  float waveAmp = bass * 0.02 + beatSnap * 0.03;
  float wave = gravWave(p, vec2(0.0), uDynamicTime * 0.5, waveAmp);
  deflection += normalize(p + 0.001) * wave;

  vec2 lensedP = p + deflection;

  // --- Space-time grid ---
  float gridScale = 6.0;
  float gridLineWidth = 0.02;

  // Grid on lensed coordinates shows curvature (section-modulated distortion)
  float gridIntensity = spaceTimeGrid(lensedP * gridScale * sectionGridDistort, gridLineWidth);

  // Finer sub-grid
  float subGrid = spaceTimeGrid(lensedP * gridScale * 4.0, 0.01) * 0.3;

  // Grid color: palette-derived, brighter near mass
  float distToCenter = length(p);
  float proximity = 1.0 / (1.0 + distToCenter * distToCenter * 8.0);

  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.4, 0.9, energy) * uPaletteSaturation;

  vec3 gridColor = hsv2rgb(vec3(hue1, sat * 0.6, 0.3 + proximity * 0.4));
  vec3 gridSubColor = hsv2rgb(vec3(hue2, sat * 0.4, 0.15 + proximity * 0.2));

  // --- Starfield behind the grid ---
  float stars1 = starField(lensedP + vec2(slowTime * 0.1), 50.0);
  float stars2 = starField(lensedP * 0.8 + vec2(slowTime * 0.05, 10.0), 80.0);
  float stars = stars1 * 0.6 + stars2 * 0.3;

  // Star streaking near the mass (tangential elongation)
  float streakFactor = smoothstep(0.3, 0.05, distToCenter);
  float streakAngle = atan(p.y, p.x);
  float streak = exp(-abs(sin(streakAngle * 3.0 + uDynamicTime * 0.3 * sectionStreakSpeed)) * 20.0) * streakFactor;
  stars += streak * 0.3 * energy;

  // --- Einstein ring: bright ring at the photon sphere ---
  float photonRadius = 0.08 + warpStrength * 0.5;
  float ringDist = abs(distToCenter - photonRadius);
  float einsteinRing = smoothstep(0.02, 0.0, ringDist) * (0.3 + energy * 0.5 + singularity * 0.8);
  vec3 ringColor = hsv2rgb(vec3(hue1 + 0.1, sat, 1.0));

  // --- Accretion disk: thin glowing disk around primary mass ---
  float diskAngle = atan(p.y, p.x) + uDynamicTime * 0.2;
  float diskRadius = distToCenter;
  float diskMask = smoothstep(0.04, 0.06, diskRadius) * smoothstep(0.25, 0.15, diskRadius);
  float diskThickness = smoothstep(0.015, 0.0, abs(p.y * cos(0.3) - p.x * sin(0.3) * 0.1)); // tilted
  float diskNoise = fbm3(vec3(diskAngle * 2.0, diskRadius * 10.0, slowTime * 0.5));
  float disk = diskMask * diskThickness * (0.5 + diskNoise * 0.5);
  vec3 diskColor = hsv2rgb(vec3(hue2 + 0.05, sat * 0.9, 0.8 + energy * 0.2));

  // --- Gravitational wave visualization ---
  float waveVis = abs(wave) * 15.0;
  vec3 waveColor = hsv2rgb(vec3(hue1 + 0.2, sat * 0.5, 0.3)) * waveVis;

  // --- Background: deep space gradient ---
  float bgGrad = smoothstep(1.5, 0.0, distToCenter);
  vec3 bgColor = hsv2rgb(vec3(uPalettePrimary + 0.2, 0.15, 0.01)) * bgGrad;

  // --- Compose ---
  vec3 col = bgColor;

  // Starfield
  col += vec3(0.8, 0.85, 1.0) * stars * 0.5;

  // Space-time grid
  col += gridColor * gridIntensity * (0.4 + energy * 0.3);
  col += gridSubColor * subGrid;

  // Gravitational wave ripples
  col += waveColor;

  // Accretion disk
  col += diskColor * disk * (0.5 + bass * 0.5);

  // Einstein ring
  col += ringColor * einsteinRing;

  // Central glow: event horizon
  float eventHorizon = exp(-distToCenter * distToCenter * 60.0);
  col += vec3(0.02, 0.01, 0.03) * eventHorizon; // near-black hole center

  // Lensing brightness amplification near mass
  float magnification = 1.0 + proximity * energy * 0.4;
  col *= magnification;

  // Peak approach glow
  col *= 1.0 + peakApproach * 0.12 + forecastGlow;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.003, 0.01), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;
