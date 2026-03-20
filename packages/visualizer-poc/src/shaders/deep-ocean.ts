/**
 * Deep Ocean — underwater caustics and god rays shader.
 * Camera drifting through deep blue-green water with caustic light patterns.
 * Designed for quiet passages (Row Jimmy, Morning Dew intros).
 *
 * Audio reactivity:
 *   uEnergy     → surface chop, fog distance, bioluminescence (inverse)
 *   uBass       → god ray pulse intensity
 *   uHighs      → caustic sharpness/detail
 *   uOnsetSnap  → caustic pattern distortion
 *   uSlowEnergy → particle drift speed, ambient sway
 *   uPalettePrimary   → water body color (deep blue-green)
 *   uPaletteSecondary → caustic/god ray highlight color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const deepOceanVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const deepOceanFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', dofEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Tileable Water Caustic (joltz0r / Dave_Hoskins technique) ---
// Iterative trig-based caustic: 5 iterations of sin/cos folding produce
// sharp, physically plausible light networks. Cheaper than 3-layer Voronoi.
float causticPattern(vec2 p, float time, float scale) {
  p *= scale;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;

  for (int n = 0; n < 5; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(
      cos(t - i.x) + sin(t + i.y),
      sin(t - i.y) + cos(t + i.x)
    );
    c += 1.0 / length(vec2(
      p.x / (sin(i.x + t) / inten),
      p.y / (cos(i.y + t) / inten)
    ));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
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

  // --- Phase 1: New uniform integrations ---
  float vocalBio = uVocalPresence * 0.3;  // vocal presence drives bioluminescence
  float guitarTemp = uOtherCentroid;       // guitar brightness shifts temperature
  float trendDrift = uEnergyTrend * 0.03;  // energy trend drifts current
  float pitchRay = uMelodicPitch * 0.2;   // melodic pitch drives god ray angle
  float tensionFog = uHarmonicTension * 0.2;  // tension drives fog turbulence
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;

  // === WATER COLORS from palette ===
  float hue1 = hsvToCosineHue(uPalettePrimary) + chromaHueMod + chordHue;
  vec3 waterColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  // Push towards deep blue-green
  waterColor = mix(waterColor, vec3(0.02, 0.15, 0.25), 0.5);

  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 causticColor = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  causticColor = mix(causticColor, vec3(0.4, 0.8, 0.9), 0.3);

  // === AMBIENT SWAY: gentle UV distortion from slowEnergy ===
  vec2 swayUv = p;
  float swayAmt = 0.02 + slowE * 0.02;
  swayUv += swayAmt * vec2(
    sin(p.y * 3.0 + uDynamicTime * 0.8),
    cos(p.x * 2.5 + uDynamicTime * 0.65)
  );

  // Ocean current: steady horizontal drift
  swayUv.x += uDynamicTime * 0.05;

  // Surface chop from energy: quiet = glassy, loud = churning
  float chop = energy * 0.04 + uFastBass * 0.03;
  swayUv += chop * vec2(
    snoise(vec3(p * 6.0, uDynamicTime * 1.5)),
    snoise(vec3(p * 6.0 + 50.0, uDynamicTime * 1.5))
  );

  // === CAUSTIC LIGHT PATTERNS: multiple overlapping layers ===
  float causticSharpness = 0.5 + highs * 0.5;

  // --- Section type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sVerse = smoothstep(0.5, 1.5, sectionT) * (1.0 - step(1.5, sectionT));
  // Jam: murky depth, more turbulence. Space: pristine stillness. Verse: gentle current.
  causticSharpness *= mix(1.0, 0.6, sJam) * mix(1.0, 1.4, sSpace);
  swayUv.x += sJam * 0.03 * sin(uDynamicTime * 0.3); // extra lateral current in jams
  swayUv *= mix(1.0, 0.97, sSpace); // barely perceptible drift in space

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // Onset distortion on caustic domain (amplified)
  vec2 causticUv = swayUv;
  causticUv += (onset + uDrumOnset * 0.15) * 0.12 * vec2(
    snoise(vec3(p * 3.0, uDynamicTime * 2.0)),
    snoise(vec3(p * 3.0 + 70.0, uDynamicTime * 2.0))
  );

  float c1 = causticPattern(causticUv, uDynamicTime * 1.0, 4.0);
  float c2 = causticPattern(causticUv + 0.3, uDynamicTime * 0.9 + 10.0, 6.0);
  float c3 = causticPattern(causticUv - 0.2, uDynamicTime * 1.1 + 20.0, 8.0);

  // Combine caustic layers: sharper with highs (pow sharpens peaks)
  float sharpPow = mix(1.0, 2.5, causticSharpness);
  float caustic = pow(c1, sharpPow);
  caustic += pow(c2, sharpPow) * 0.6;
  caustic += pow(c3, sharpPow) * 0.3;
  caustic = clamp(caustic, 0.0, 1.0);

  // Base water color (visible even during quiet — ocean is never pitch black)
  vec3 col = waterColor * mix(0.35, 0.45, energy);

  // Add caustics (bright and vivid)
  col += causticColor * caustic * 0.55;

  // === GOD RAYS: vertical light shafts from above (beat-reactive) ===
  float bpH = beatPulseHalf(uMusicalTime);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float rayIntensity = (0.3 + bass * 0.5 + stemBass * 0.3 + uFastEnergy * 0.2) * (1.0 + bpH * 0.25 + uBeatSnap * 0.30 + climaxBoost * 0.20); // Phil's bass rumbles the deep
  float rayX = swayUv.x * 3.0 + bass * sin(uDynamicTime * 0.3) * 0.5;
  float ray1 = smoothstep(0.8, 1.0, sin(rayX * 2.0 + uDynamicTime * 0.5)) * rayIntensity;
  float ray2 = smoothstep(0.85, 1.0, sin(rayX * 3.5 + uDynamicTime * 0.4 + 1.0)) * rayIntensity * 0.7;
  float ray3 = smoothstep(0.9, 1.0, sin(rayX * 1.5 + uDynamicTime * 0.6 + 2.5)) * rayIntensity * 0.5;
  float rays = ray1 + ray2 + ray3;
  // Rays fade toward bottom of screen
  float rayFade = smoothstep(-0.5, 0.5, swayUv.y);
  rays *= rayFade;
  col += causticColor * rays * 0.25;

  // === DEPTH FOG: clears with energy (tension adds turbulence) ===
  float fogDensity = mix(0.50, 0.18, energy) + tensionFog * 0.1 + stemBass * 0.08; // bass thickens depth fog
  float fogNoise = fbm3(vec3(swayUv * 2.0, uDynamicTime * 0.05));
  float fog = fogDensity * (0.5 + fogNoise * 0.5);
  vec3 fogColor = mix(waterColor, causticColor, 0.2) * 0.20;
  col = mix(col, fogColor, fog * 0.6);

  // === BIOLUMINESCENT PARTICLES: active during quiet + vocal presence ===
  float quietness = smoothstep(0.35, 0.05, energy) + vocalBio;
  if (quietness > 0.01) {
    for (int j = 0; j < 6; j++) {
      float fj = float(j);
      float seed = fj * 11.31;
      vec2 particlePos = vec2(
        snoise(vec3(seed, uDynamicTime * 0.04, 0.0)) * 0.7,
        snoise(vec3(0.0, seed, uDynamicTime * 0.03)) * 0.5
      );
      float dist = length(p - particlePos);
      float glow = smoothstep(0.04, 0.005, dist);
      float pulse = 0.5 + 0.5 * sin(uDynamicTime * 1.5 + seed * 3.0);
      vec3 bioColor = mix(causticColor, vec3(0.2, 0.9, 0.7), 0.5);
      col += bioColor * glow * pulse * quietness * 0.2;
    }
  }

  // === FLOATING DEBRIS / PLANKTON ===
  float driftSpeed = 0.02 + slowE * 0.03;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float seed = fk * 5.73 + 100.0;
    vec2 debrisPos = vec2(
      fract(seed * 0.37 + uDynamicTime * driftSpeed * 0.5) * 2.0 - 1.0,
      fract(seed * 0.53 + uDynamicTime * driftSpeed * 0.3) * 2.0 - 1.0
    );
    debrisPos *= 0.6;
    float dist = length(p - debrisPos);
    float debris = smoothstep(0.008, 0.002, dist);
    col += vec3(0.3, 0.5, 0.6) * debris * 0.08;
  }

  // === VIGNETTE ===
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigTint = max(waterColor * 0.04, vec3(0.05, 0.04, 0.06));
  col = mix(vigTint, col, vignette);

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, uBass, waterColor, causticColor, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, waterColor, causticColor, _nf, uSectionIndex);

  // === POST-PROCESSING (shared chain) ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
