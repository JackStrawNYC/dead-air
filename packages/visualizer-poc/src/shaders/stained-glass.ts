/**
 * Stained Glass — gothic tessellation with light transmission.
 * Warped hex/triangle tessellation with dark "leading" borders.
 * Light sources drift across the surface like sunlight through cathedral windows.
 * Chromatic dispersion at tile edges splits white light into spectral colors on onset.
 *
 * Audio reactivity:
 *   uBass            → light source intensity
 *   uEnergy          → tile subdivision level
 *   uOnsetSnap       → chromatic dispersion flash
 *   uMelodicDirection → light movement direction
 *   uHarmonicTension → tile warp (regular→irregular)
 *   uVocalPresence   → "rose window" spotlight
 *   uChordIndex      → palette variation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const stainedGlassVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const stainedGlassFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  stageFloodEnabled: false,
  temporalBlendEnabled: false,
})}

varying vec2 vUv;

#define PI 3.14159265
#define SQRT3 1.7320508

// Hex grid coordinates
vec4 hexCoord(vec2 p) {
  vec2 a = mod(p, vec2(1.0, SQRT3)) - vec2(0.5, SQRT3 * 0.5);
  vec2 b = mod(p - vec2(0.5, SQRT3 * 0.5), vec2(1.0, SQRT3)) - vec2(0.5, SQRT3 * 0.5);
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = p - gv;
  return vec4(gv.x, gv.y, id.x, id.y);
}

// Hash for tile coloring
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.04;
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: denser tessellation, faster light, thinner leading. Space: sparse, slow, wide leading. Chorus: brighter light, wider tiles.
  float sectionTileScale = mix(1.0, 1.3, sJam) * mix(1.0, 0.6, sSpace);
  float sectionLightSpeed = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.15, sChorus);
  float sectionLeadWidth = mix(1.0, 0.7, sJam) * mix(1.0, 1.5, sSpace);
  float sectionLightBright = mix(1.0, 1.1, sJam) * mix(1.0, 0.6, sSpace) * mix(1.0, 1.2, sChorus);

  // --- Domain warping for organic flow ---
  vec2 domainP = p;
  domainP += vec2(fbm3(vec3(p * 0.5 * (1.0 + energy * 0.5), uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 * (1.0 + energy * 0.5) + 100.0, uDynamicTime * 0.05))) * 0.3;

  // --- Tile scale from energy ---
  float tileScale = mix(4.0, 10.0, energy) * sectionTileScale;

  // --- Warp from harmonic tension ---
  vec2 warped = domainP;
  if (tension > 0.05) {
    vec3 curl = curlNoise(vec3(domainP * 3.0, slowTime * 0.5));
    warped += curl.xy * tension * 0.06;
  }

  // --- Hex grid ---
  vec4 hex = hexCoord(warped * tileScale);
  vec2 cellGv = hex.xy; // cell-local coords
  vec2 cellId = hex.zw; // cell ID

  // --- Leading (dark borders) ---
  float dist = length(cellGv);
  float hexDist = max(abs(cellGv.x), abs(cellGv.y * 0.577 + cellGv.x * 0.5));
  float borderDist = 0.5 - max(abs(cellGv.x), (abs(cellGv.y) + abs(cellGv.x)) * 0.577);
  float leadWidth = (0.04 + tension * 0.02) * sectionLeadWidth;
  float leadMask = 1.0 - smoothstep(0.0, leadWidth, borderDist);

  // --- Tile color ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  float tileHue = hue1 + hash21(cellId) * 0.4 + hash21(cellId + 7.0) * 0.1;
  float tileBright = 0.3 + energy * 0.3;
  vec3 tileColor = hsv2rgb(vec3(tileHue, sat, tileBright));

  // --- Light source ---
  // Drifting light position (like sunlight moving across stained glass)
  float lightAngle = slowTime * 0.3 * sectionLightSpeed + melodicDir * 0.5;
  vec2 lightPos = vec2(sin(lightAngle) * 0.5, cos(lightAngle * 0.7) * 0.4);
  float lightDist = length(p - lightPos);
  float lightIntensity = (0.5 + bass * 1.0) / (1.0 + lightDist * 2.5) * sectionLightBright;

  // Apply light transmission through tiles
  tileColor *= 0.4 + lightIntensity * 1.5;

  // --- Chromatic dispersion at edges on onset ---
  vec3 dispersion = vec3(0.0);
  if (onset > 0.2) {
    float edgeProximity = 1.0 - smoothstep(0.0, leadWidth * 3.0, borderDist);
    float rShift = onset * 0.02;
    // Simulate spectral split: shift border color through RGB
    dispersion.r = edgeProximity * onset * 0.5;
    dispersion.g = edgeProximity * onset * 0.3;
    dispersion.b = edgeProximity * onset * 0.6;
  }

  // --- Rose window spotlight (vocal presence + stem vocals) ---
  float stemVocals = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalTotal = max(vocalPres, stemVocals); // strongest vocal signal wins
  float roseSpot = 0.0;
  if (vocalTotal > 0.3) {
    float r = length(p);
    float angle = atan(p.y, p.x);
    float rosePattern = 0.5 + 0.5 * sin(angle * 6.0 + slowTime);
    roseSpot = (1.0 - smoothstep(0.0, 0.4, r)) * rosePattern * vocalTotal;
  }

  // --- Secondary depth layer: flowing light caustic underneath tiles ---
  float depthLayer = fbm6(vec3(domainP * 3.0 * (1.0 + energy * 0.5), slowTime * 0.4));
  vec3 depthColor = mix(
    hsv2rgb(vec3(hue1 + 0.15, sat * 0.5, 0.4)),
    hsv2rgb(vec3(hue2 + 0.1, sat * 0.6, 0.5)),
    depthLayer
  );

  // --- Combine ---
  vec3 leadColor = vec3(0.02, 0.015, 0.01); // dark oxidized lead
  vec3 col = mix(tileColor + dispersion, leadColor, leadMask);

  // Blend secondary depth layer at 30%
  col = mix(col, col + depthColor * lightIntensity, 0.3);

  // Rose window additive glow — uses both palette colors
  col += hsv2rgb(vec3(hue2, sat * 0.7, 1.0)) * roseSpot * 0.3;
  col += hsv2rgb(vec3(hue1 + 0.3, sat * 0.5, 0.8)) * roseSpot * 0.15;

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
  float vigScale = mix(0.28, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.008, 0.015), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
