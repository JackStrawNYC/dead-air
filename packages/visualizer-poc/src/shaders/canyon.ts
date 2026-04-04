/**
 * Canyon — slot canyon walls with sky strip above and volumetric god rays.
 * Narrow passage looking up at a sliver of sky. Sandstone striations on walls.
 * Light beams cutting through the gap. Ancient, timeless, sacred.
 *
 * Audio reactivity:
 *   uEnergy       -> beam intensity, gap width (narrow at rest, wide at peaks)
 *   uHighs        -> dust motes floating in beams
 *   uBass         -> wall vibration, deep resonance glow
 *   uOnsetSnap    -> beam flicker
 *   uSlowEnergy   -> ambient wall warmth
 *   uSpectralFlux -> wall texture complexity
 *   uSectionType  -> jam=walls pulse with rhythm, space=narrow dark, solo=spotlight beam
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const canyonVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const canyonFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', dofEnabled: true, bloomEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Sandstone wall texture: layered horizontal striations ---
float sandstoneTexture(vec2 p, float detail) {
  // Horizontal stratification layers
  float strata = 0.0;
  strata += snoise(vec3(p.x * 0.5, p.y * 8.0, 0.0)) * 0.4;
  strata += snoise(vec3(p.x * 1.0, p.y * 16.0, 5.0)) * 0.25;
  strata += snoise(vec3(p.x * 2.0, p.y * 32.0, 10.0)) * 0.15 * detail;
  // Erosion pockets
  float erosion = snoise(vec3(p.x * 3.0, p.y * 4.0, 15.0));
  erosion = smoothstep(0.3, 0.6, erosion) * 0.2;
  // Vertical cracks
  float cracks = snoise(vec3(p.x * 12.0, p.y * 2.0, 20.0));
  cracks = smoothstep(0.7, 0.75, abs(cracks)) * 0.15 * detail;
  return strata + erosion + cracks;
}

// --- God ray: volumetric light beam through gap with atmospheric density ---
float godRay(vec2 p, float beamX, float beamWidth, float time, float energy) {
  float energyFreq = 1.0 + energy * 0.5;
  // Beam from sky strip down through canyon
  float beamDist = abs(p.x - beamX);
  float beam = smoothstep(beamWidth, beamWidth * 0.1, beamDist);
  // Beam narrows toward bottom (perspective)
  float perspective = smoothstep(-0.5, 0.5, p.y);
  beam *= mix(0.3, 1.0, perspective);
  // Multi-layer atmospheric scattering (domain-warped for richness)
  float scatterWarp = snoise(vec3(p * 1.5, time * 0.02)) * 0.15;
  float scatter = snoise(vec3(p.x * 3.0 * energyFreq + scatterWarp, p.y * 2.0 - time * 0.05, time * 0.03));
  float scatter2 = snoise(vec3(p.x * 7.0 * energyFreq, p.y * 4.0 - time * 0.03 + 5.0, time * 0.05));
  scatter = 0.5 + 0.3 * scatter + 0.2 * scatter2;
  beam *= scatter;
  // Volumetric density variation: thicker pockets of air
  float density = snoise(vec3(p.x * 2.0, p.y * 1.5 + time * 0.02, time * 0.04 + 10.0));
  beam *= 0.85 + 0.15 * density;
  // Vertical falloff: stronger at top
  beam *= smoothstep(-0.5, 0.4, p.y);
  return beam;
}

// --- Dust motes: tiny bright particles in light beams ---
float dustMotes(vec2 uv, float time, float density) {
  float acc = 0.0;
  for (int i = 0; i < 3; i++) {
    float seed = float(i) * 23.7;
    float speed = 0.03 + float(i) * 0.01;
    vec2 dUv = uv;
    dUv.y -= time * speed;
    dUv.x += sin(time * 0.2 + float(i)) * 0.02;
    vec2 cell = floor(dUv * density);
    vec2 f = fract(dUv * density);
    float h = fract(sin(dot(cell + seed, vec2(127.1, 311.7))) * 43758.5453);
    float h2 = fract(sin(dot(cell + seed, vec2(269.5, 183.3))) * 43758.5453);
    vec2 motePos = vec2(h, h2);
    float dist = length(f - motePos);
    float hasMote = step(0.85, h);
    float twinkle = 0.6 + 0.4 * sin(time * 3.0 + h * 20.0);
    acc += hasMote * twinkle * smoothstep(0.02, 0.005, dist);
  }
  return acc;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float slowTime = uDynamicTime * 0.08;

  // --- Domain warping + palette ---
  vec2 warpedP = p + vec2(fbm3(vec3(p * 0.5, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 + 100.0, uDynamicTime * 0.05))) * 0.3;
  float detailMod = 1.0 + energy * 0.5;
  vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary, 0.7 * uPaletteSaturation, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary, 0.6 * uPaletteSaturation, 0.85));

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // === GAP WIDTH: energy controls how narrow/wide the canyon is ===
  // MASSIVE dynamic range: claustrophobic at rest, cathedral at peaks
  float baseGap = mix(0.06, 0.28, energy);
  baseGap *= mix(1.0, 0.5, sSpace); // narrow in space
  baseGap *= mix(1.0, 1.4, sChorus); // wider in chorus
  baseGap += climaxBoost * 0.1; // climax opens wide

  // Wall edges: noise-modulated for organic canyon shape
  float wallNoise = snoise(vec3(0.0, p.y * 3.0, slowTime * 0.1)) * 0.04;
  float wallNoiseR = snoise(vec3(5.0, p.y * 3.5, slowTime * 0.12)) * 0.04;

  float leftWallEdge = -baseGap + wallNoise;
  float rightWallEdge = baseGap + wallNoiseR;

  // Jam: walls pulse with rhythm
  float jamPulse = sJam * beatPulse(uMusicalTime) * 0.03;
  leftWallEdge -= jamPulse;
  rightWallEdge += jamPulse;

  // === DETERMINE ZONES ===
  float inLeftWall = smoothstep(leftWallEdge + 0.005, leftWallEdge - 0.005, p.x);
  float inRightWall = smoothstep(rightWallEdge - 0.005, rightWallEdge + 0.005, p.x);
  float inGap = 1.0 - inLeftWall - inRightWall;
  inGap = clamp(inGap, 0.0, 1.0);

  // === SKY STRIP: visible through gap at top ===
  vec3 skyColor = mix(
    vec3(0.15, 0.25, 0.45), // deep blue
    vec3(0.40, 0.55, 0.80), // lighter blue
    smoothstep(0.2, 0.5, p.y)
  );
  // Warm sky near horizon (bottom of sky strip)
  skyColor = mix(skyColor, vec3(0.5, 0.35, 0.2), smoothstep(0.4, 0.1, p.y) * 0.3);
  // Sky only visible in gap and upper portion
  float skyVis = inGap * smoothstep(0.1, 0.35, p.y);

  vec3 col = vec3(0.0);

  // === WALL RENDERING ===
  float energyFreq = 1.0 + energy * 0.5;
  // Sandstone base colors: warm reds and oranges with palette influence
  vec3 sandstoneBase = mix(vec3(0.35, 0.18, 0.08), palCol1 * 0.3, 0.1);
  vec3 sandstoneLight = mix(vec3(0.55, 0.30, 0.15), palCol2 * 0.4, 0.08);
  vec3 sandstoneDark = vec3(0.15, 0.07, 0.03);

  float wallDetail = 0.5 + flux * 0.5;

  // Left wall — rich textured with secondary mineral layer
  if (inLeftWall > 0.01) {
    float wallDepth = smoothstep(leftWallEdge, leftWallEdge - 0.4, p.x);
    float tex = sandstoneTexture(vec2(-p.x * 2.0 * energyFreq, p.y), wallDetail);
    vec3 wallColor = mix(sandstoneLight, sandstoneBase, 0.5 + tex * 0.5);
    wallColor = mix(wallColor, sandstoneDark, wallDepth * 0.7);
    // Secondary mineral vein layer (30% blend)
    float mineralNoise = snoise(vec3(-p.x * 6.0, p.y * 12.0, 25.0));
    vec3 mineralColor = mix(vec3(0.5, 0.25, 0.12), palCol1 * 0.5, 0.2);
    float mineralMask = smoothstep(0.6, 0.75, mineralNoise) * wallDetail;
    wallColor = mix(wallColor, mineralColor, mineralMask * 0.3);
    // Warm ambient from slow energy
    wallColor += vec3(0.04, 0.02, 0.01) * slowE;
    // Bass resonance glow: deep warm pulse
    wallColor += vec3(0.06, 0.02, 0.01) * bass * 0.3 * (1.0 - wallDepth);
    col += wallColor * inLeftWall;
  }

  // Right wall — asymmetric detail for natural feel
  if (inRightWall > 0.01) {
    float wallDepth = smoothstep(rightWallEdge, rightWallEdge + 0.4, p.x);
    float tex = sandstoneTexture(vec2(p.x * 2.0 * energyFreq + 3.0, p.y + 1.0), wallDetail);
    vec3 wallColor = mix(sandstoneLight, sandstoneBase, 0.5 + tex * 0.5);
    wallColor = mix(wallColor, sandstoneDark, wallDepth * 0.7);
    // Secondary mineral vein layer (30% blend)
    float mineralNoise = snoise(vec3(p.x * 5.0 + 10.0, p.y * 14.0, 30.0));
    vec3 mineralColor = mix(vec3(0.45, 0.22, 0.10), palCol2 * 0.4, 0.15);
    float mineralMask = smoothstep(0.6, 0.75, mineralNoise) * wallDetail;
    wallColor = mix(wallColor, mineralColor, mineralMask * 0.3);
    wallColor += vec3(0.04, 0.02, 0.01) * slowE;
    wallColor += vec3(0.06, 0.02, 0.01) * bass * 0.3 * (1.0 - wallDepth);
    col += wallColor * inRightWall;
  }

  // === GOD RAYS: light beams through the gap ===
  float beamIntensity = mix(0.1, 0.8, energy);
  beamIntensity += onset * 0.3;
  beamIntensity += climaxBoost * 0.4;
  beamIntensity *= mix(1.0, 0.2, sSpace); // faint in space
  beamIntensity *= mix(1.0, 2.0, sSolo); // intense in solo

  // Multiple beams at different angles
  float beam1 = godRay(p, 0.0, baseGap * 0.6, slowTime, energy);
  float beam2 = godRay(p, sin(slowTime * 0.3) * baseGap * 0.3, baseGap * 0.35, slowTime + 5.0, energy);
  // Solo: single concentrated beam
  float beam3 = godRay(p, 0.0, baseGap * 0.25, slowTime, energy) * sSolo * 1.5;

  float totalBeam = (beam1 * 0.6 + beam2 * 0.3 + beam3) * beamIntensity;
  totalBeam *= inGap; // beams only in gap

  // Beam color: warm golden light
  vec3 beamColor = vec3(0.9, 0.75, 0.5);
  // Palette influence
  beamColor = mix(beamColor, hsv2rgb(vec3(uPalettePrimary, 0.4, 1.0)), 0.15);

  col += beamColor * totalBeam;

  // === BEAM ILLUMINATION ON WALLS ===
  // Light from beams bounces onto nearby wall surfaces
  float wallIllum = totalBeam * 0.4;
  float leftIllum = wallIllum * smoothstep(leftWallEdge - 0.15, leftWallEdge, p.x);
  float rightIllum = wallIllum * smoothstep(rightWallEdge + 0.15, rightWallEdge, p.x);
  col += beamColor * 0.3 * (leftIllum * inLeftWall + rightIllum * inRightWall);

  // === DUST MOTES in beams ===
  float dustIntensity = highs * 0.4 + energy * 0.2;
  float motes = dustMotes(uv, uTime, 60.0);
  // Dust only visible in lit areas (beams)
  float dustMask = totalBeam * inGap;
  col += vec3(0.9, 0.8, 0.6) * motes * dustMask * dustIntensity;

  // === SKY through gap ===
  col += skyColor * skyVis * 0.8;

  // === FLOOR: dark sandy ground ===
  float floorMask = smoothstep(-0.35, -0.45, p.y);
  vec3 floorColor = vec3(0.08, 0.05, 0.03);
  // Beam light on floor
  floorColor += beamColor * totalBeam * 0.15;
  col = mix(col, floorColor, floorMask);

  // --- Secondary visual layer: warm sandstone glow (30% blend) ---
  float stoneGlow = fbm3(vec3(warpedP * 3.0 * detailMod, slowTime * 0.2));
  vec3 glowCol = mix(palCol1, palCol2, stoneGlow * 0.5 + 0.5) * 0.1;
  float glowMask = (inLeftWall + inRightWall) * (1.0 - smoothstep(0.0, 0.15, abs(p.x) - baseGap * 0.5));
  col += glowCol * glowMask * 0.3 * energy;

  // === ICON EMERGENCE ===
  {
    float nf = fbm6(vec3(p * 2.0, slowTime));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass,
      vec3(0.55, 0.30, 0.15), beamColor, nf, uClimaxPhase, uSectionIndex);
    col += iconLight;
  }

  // === VIGNETTE: heavy, focusing attention on the gap ===
  float vigScale = mix(0.35, 0.25, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.01, 0.005), col, vignette);

  // === DARKNESS TEXTURE ===
  col += darknessTexture(uv, uTime, energy);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
