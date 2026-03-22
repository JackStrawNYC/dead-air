/**
 * Forest — deep woodland environment with volumetric fog and fireflies.
 * Tree trunks recede into mist; camera drifts forward through canopy.
 * Designed for quiet, contemplative passages with massive dynamic range:
 * impenetrable fog in silence, sun-dappled clearing at peak energy.
 *
 * Audio reactivity:
 *   uBass           -> tree trunk sway amplitude
 *   uEnergy         -> fog density (inverse: quiet=thick, loud=clear)
 *   uHighs          -> firefly count / sparkle intensity
 *   uStemOtherRms   -> light shaft intensity (guitar = sunbeams)
 *   uStemVocalPresence -> warm amber/gold shift from cool blue/green base
 *   uOnsetSnap      -> brief firefly burst
 *   uSlowEnergy     -> camera drift speed, ambient color saturation
 *   uChromaHue      -> subtle canopy color drift
 *   uSectionType    -> jam=deeper/more fireflies, space=thick fog, solo=spotlight
 *   uMelodicPitch   -> light shaft angle
 *   uHarmonicTension -> canopy turbulence
 *   uBeatStability   -> trunk sway damping (tight groove = steady trees)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const forestVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const forestFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', dofEnabled: true, bloomEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Bark texture: vertical noise ridges ---
float barkTexture(vec2 p, float time) {
  // Vertical stretch for bark grain
  float n1 = snoise(vec3(p.x * 8.0, p.y * 2.0, time * 0.01));
  float n2 = snoise(vec3(p.x * 16.0, p.y * 1.0, time * 0.005)) * 0.5;
  float n3 = snoise(vec3(p.x * 32.0, p.y * 0.5, 0.0)) * 0.25;
  return n1 + n2 + n3;
}

// --- Single tree trunk SDF: vertical dark column with bark ---
float treeTrunk(vec2 p, vec2 pos, float width, float time) {
  // Horizontal distance to trunk center
  float dx = abs(p.x - pos.x) - width;
  // Bark texture modulates edge
  float bark = barkTexture(p - pos, time) * width * 0.3;
  dx += bark;
  // Vertical extent: trunk goes from bottom to near top
  float dy = max(-p.y + pos.y - 0.1, p.y - pos.y - 1.8);
  return max(dx, dy * 0.1);
}

// --- Leaf/canopy dapple: overhead light filtering ---
float canopyDapple(vec2 uv, float time) {
  float n1 = snoise(vec3(uv * 3.0, time * 0.03));
  float n2 = snoise(vec3(uv * 7.0 + 20.0, time * 0.05));
  float n3 = snoise(vec3(uv * 15.0 + 50.0, time * 0.02));
  float pattern = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  return smoothstep(-0.1, 0.4, pattern);
}

// --- Firefly: small bright dot with soft glow ---
float firefly(vec2 p, vec2 pos, float brightness) {
  float d = length(p - pos);
  float glow = brightness / (1.0 + d * d * 2000.0);
  float core = smoothstep(0.008, 0.002, d) * brightness;
  return glow + core * 2.0;
}

// --- Forest floor leaf texture ---
float leafGround(vec2 uv, float time) {
  float n1 = snoise(vec3(uv * 5.0, time * 0.01));
  float n2 = snoise(vec3(uv * 12.0 + 30.0, time * 0.008));
  return n1 * 0.6 + n2 * 0.4;
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
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float guitarLight = clamp(uOtherEnergy, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // --- Phase 1: New uniform integrations ---
  float pitchAngle = uMelodicPitch * 0.4;
  float tensionTurb = uHarmonicTension * 0.2;
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float melDir = uMelodicDirection * 0.02;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1;
  float localTempoScale = uLocalTempo / 120.0;

  // === SLOW TIME: forest should feel calm and immersive ===
  float slowTime = uDynamicTime * 0.06;
  float driftSpeed = (0.02 + slowE * 0.015) * mix(1.0, 1.3, sJam) * mix(1.0, 0.3, sSpace);

  // === CAMERA DRIFT: slow forward motion ===
  vec2 cameraDrift = vec2(sin(slowTime * 0.3) * 0.02, slowTime * driftSpeed);

  // === FOG: thick when quiet, clears at peaks ===
  // MASSIVE dynamic range: impenetrable fog at 0 energy, clear forest at 1.0
  float fogBase = mix(0.98, 0.15, energy * energy); // quadratic for dramatic reveal
  fogBase *= mix(1.0, 1.3, sSpace); // space sections: extra fog
  fogBase *= mix(1.0, 0.7, sJam);   // jam sections: clearer
  float fogNoise = fbm(vec3(p * 2.0 + cameraDrift, slowTime * 0.5)) * 0.15;
  float fog = clamp(fogBase + fogNoise + tensionTurb * 0.1, 0.0, 1.0);

  // === BASE COLORS ===
  // Cool blue/green at rest, warm amber/gold during vocals
  vec3 coolForest = vec3(0.05, 0.12, 0.15);   // deep blue-green
  vec3 warmForest = vec3(0.18, 0.12, 0.04);    // warm amber
  vec3 fogColor = mix(
    vec3(0.08, 0.12, 0.16),  // cool blue fog
    vec3(0.15, 0.13, 0.08),  // warm amber fog
    vocalPresence * 0.6
  );
  fogColor += chromaH * 0.03;

  // Palette integration
  float hue1 = uPalettePrimary + chromaH * 0.05 + chordHue;
  float hue2 = uPaletteSecondary + chromaH * 0.04;
  float sat = mix(0.5, 0.9, slowE) * uPaletteSaturation;
  vec3 palColor1 = hsv2rgb(vec3(hue1, sat * 0.6, 0.4));
  vec3 palColor2 = hsv2rgb(vec3(hue2, sat * 0.5, 0.3));

  // === SKY / CANOPY: dappled light from above ===
  float canopy = canopyDapple(uv + cameraDrift * 0.5, slowTime);
  // Canopy clears with energy
  canopy *= mix(0.3, 0.8, energy);
  canopy *= mix(0.6, 1.0, 1.0 - sSpace); // space: dense canopy

  vec3 skyLight = mix(
    vec3(0.03, 0.06, 0.08),   // dark canopy
    mix(
      vec3(0.15, 0.25, 0.12),  // green-filtered sunlight
      vec3(0.35, 0.28, 0.10),  // golden sunlight during vocals
      vocalPresence * 0.7
    ),
    canopy
  );

  // Vertical gradient: sky at top, ground at bottom
  float skyGrad = smoothstep(-0.2, 0.4, p.y);
  float groundGrad = smoothstep(0.1, -0.3, p.y);

  // === GROUND: dark forest floor with leaf texture ===
  float leaves = leafGround(uv + cameraDrift, slowTime);
  vec3 groundColor = mix(
    vec3(0.02, 0.03, 0.01),   // dark soil
    vec3(0.06, 0.05, 0.02),   // leaf litter
    leaves * 0.5 + 0.3
  );
  groundColor = mix(groundColor, palColor1 * 0.15, 0.2);

  // === COMPOSE BASE SCENE ===
  vec3 col = mix(groundColor, coolForest, smoothstep(-0.4, 0.0, p.y));
  col = mix(col, skyLight, skyGrad);
  col = mix(col, warmForest, vocalPresence * 0.3);

  // === TREE TRUNKS: vertical dark columns receding into depth ===
  // Multiple layers of trees at different depths
  float trunkMask = 0.0;
  float swayAmt = bass * 0.015 * mix(1.0, 0.3, beatStab); // damped by beat stability

  // Near trees (large, dark, detailed)
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = fract(sin(fi * 127.1 + 31.7) * 43758.5453);
    float xPos = (seed - 0.5) * aspect.x * 1.8;
    float width = 0.015 + seed * 0.012;
    // Bass sway
    float sway = sin(slowTime * 0.5 + fi * 2.0) * swayAmt;
    xPos += sway;
    // Trunk shape
    float trunk = smoothstep(width + 0.002, width - 0.003, abs(p.x - xPos));
    // Vertical extent
    trunk *= smoothstep(-0.5, -0.35, p.y) * smoothstep(0.5, 0.35, p.y);
    // Bark texture variation
    float bark = barkTexture(vec2(p.x - xPos, p.y) * 3.0, slowTime) * 0.15;
    trunk *= (0.85 + bark);
    trunkMask = max(trunkMask, trunk);
  }

  // Mid-distance trees (thinner, more fog-faded)
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = fract(sin((fi + 10.0) * 89.3 + 17.1) * 43758.5453);
    float xPos = (seed - 0.5) * aspect.x * 2.2;
    float width = 0.008 + seed * 0.006;
    float sway = sin(slowTime * 0.3 + fi * 1.7) * swayAmt * 0.5;
    xPos += sway + cameraDrift.x * 0.3;
    float trunk = smoothstep(width + 0.001, width - 0.002, abs(p.x - xPos));
    trunk *= smoothstep(-0.45, -0.3, p.y) * smoothstep(0.45, 0.3, p.y);
    // Fade with distance (fog interaction)
    trunk *= 0.5;
    trunkMask = max(trunkMask, trunk);
  }

  // Far trees (silhouettes, heavily fogged)
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float seed = fract(sin((fi + 25.0) * 53.7 + 71.3) * 43758.5453);
    float xPos = (seed - 0.5) * aspect.x * 2.8;
    float width = 0.004 + seed * 0.004;
    xPos += cameraDrift.x * 0.6;
    float trunk = smoothstep(width + 0.001, width - 0.001, abs(p.x - xPos));
    trunk *= smoothstep(-0.4, -0.25, p.y) * smoothstep(0.4, 0.25, p.y);
    trunk *= 0.25; // very faded
    trunkMask = max(trunkMask, trunk);
  }

  // Apply trunks: dark bark color
  vec3 barkColor = vec3(0.04, 0.03, 0.02);
  barkColor = mix(barkColor, palColor2 * 0.1, 0.15);
  col = mix(col, barkColor, trunkMask * (1.0 - fog * 0.7));

  // === LIGHT SHAFTS: diagonal beams through canopy ===
  // Guitar/other stem drives light shaft intensity
  float shaftIntensity = guitarLight * 0.6 + energy * 0.3;
  shaftIntensity *= mix(0.5, 1.2, 1.0 - sSpace); // dim in space sections
  shaftIntensity *= mix(1.0, 1.5, sSolo); // bright spotlight in solos

  // Diagonal beams using noise-modulated rays
  float shaftAngle = 0.3 + pitchAngle * 0.5 + melDir;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float seed = fract(sin(fi * 43.7) * 43758.5453);
    float beamX = (seed - 0.5) * aspect.x * 1.5;
    // Diagonal ray: rotated line
    float ca = cos(shaftAngle + fi * 0.3);
    float sa = sin(shaftAngle + fi * 0.3);
    vec2 rotP = vec2(
      ca * (p.x - beamX) - sa * (p.y - 0.3),
      sa * (p.x - beamX) + ca * (p.y - 0.3)
    );
    // Beam shape: narrow horizontal, tall vertical
    float beam = exp(-rotP.x * rotP.x * 800.0);
    // Only visible in upper half and modulated by canopy breaks
    beam *= smoothstep(-0.1, 0.2, p.y);
    // Noise modulation for volumetric feel
    float beamNoise = fbm3(vec3(rotP * 3.0, slowTime * 0.2 + fi));
    beam *= (0.6 + 0.4 * beamNoise);
    // Apply
    vec3 shaftColor = mix(
      vec3(0.3, 0.35, 0.2),  // green-filtered light
      vec3(0.5, 0.4, 0.15),  // golden shaft
      vocalPresence * 0.7
    );
    col += shaftColor * beam * shaftIntensity * (0.15 + seed * 0.1);
  }

  // Solo spotlight: concentrated beam from above
  if (sSolo > 0.1) {
    float spotX = sin(slowTime * 0.2) * 0.1;
    float spotD = length(vec2(p.x - spotX, (p.y - 0.1) * 0.5));
    float spot = exp(-spotD * spotD * 20.0) * sSolo;
    vec3 spotColor = vec3(0.5, 0.45, 0.2);
    col += spotColor * spot * 0.5;
  }

  // === FIREFLIES: small bright dots drifting between trees ===
  float fireflyCount = highs * 12.0 + onset * 8.0;
  fireflyCount *= mix(1.0, 2.5, sJam);   // jam: swarms of fireflies
  fireflyCount *= mix(1.0, 0.2, sSpace);  // space: almost none

  float fireflyAccum = 0.0;
  for (int i = 0; i < 20; i++) {
    if (float(i) >= fireflyCount) break;
    float fi = float(i);
    float seed1 = fract(sin(fi * 73.1 + 19.3) * 43758.5453);
    float seed2 = fract(sin(fi * 41.7 + 83.1) * 43758.5453);
    float seed3 = fract(sin(fi * 97.3 + 47.9) * 43758.5453);
    // Drifting position
    vec2 ffPos = vec2(
      (seed1 - 0.5) * aspect.x * 1.4 + sin(slowTime * 0.7 + fi * 2.0) * 0.08,
      (seed2 - 0.5) * 0.8 + cos(slowTime * 0.5 + fi * 1.5) * 0.06
    );
    // Pulsing brightness
    float pulse = 0.5 + 0.5 * sin(slowTime * (1.5 + seed3 * 2.0) + fi * 3.0);
    pulse *= pulse; // sharper pulse
    float ff = firefly(p, ffPos, pulse * (0.4 + highs * 0.6));
    fireflyAccum += ff;
  }

  // Firefly color: warm yellow-green
  vec3 fireflyColor = mix(
    vec3(0.6, 0.8, 0.2),  // green firefly
    vec3(0.9, 0.7, 0.1),  // golden firefly
    vocalPresence * 0.5
  );
  col += fireflyColor * fireflyAccum * (1.0 - fog * 0.5);

  // === APPLY FOG: blend everything toward fog color ===
  // Fog is stronger in distance (upper screen = further away)
  float depthFog = fog * (0.7 + 0.3 * smoothstep(-0.3, 0.3, p.y));
  col = mix(col, fogColor, depthFog);

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm(vec3(p * 2.0, slowTime));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, palColor1, palColor2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight * 0.6;
  }

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;
  // Climax: fog lifts dramatically, golden light floods in
  col = mix(col, col * 1.4 + vec3(0.08, 0.06, 0.02) * climaxBoost, climaxBoost * 0.5);

  // === DARKNESS TEXTURE: prevent dead black ===
  col += darknessTexture(uv, uTime, energy);

  // === VIGNETTE: deeper for forest enclosure ===
  float vigScale = mix(0.32, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.01, 0.005), col, vignette);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
