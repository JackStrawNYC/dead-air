/**
 * Stark Minimal — clean geometric abstraction.
 * High contrast, slow-moving shapes, mostly monochrome with accent color.
 * Best for contemplative/acoustic sections and low-energy passages.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const starkMinimalVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const starkMinimalFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

varying vec2 vUv;

#define PI 3.14159265

// Signed distance to a circle
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// Signed distance to a line segment
float sdLine(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float tempoScale = uTempo / 120.0;
  float sectionSeed = uSectionIndex * 3.14;

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: faster motion, more complexity. Space: near-still, stark. Chorus: brighter accents.
  float sectionSpeed = mix(1.0, 1.4, sJam) * mix(1.0, 0.3, sSpace) * mix(1.0, 1.1, sChorus);
  float sectionAccent = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);
  float sectionComplexity = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace);

  float t = uDynamicTime * 0.08 * tempoScale * sectionSpeed;
  float energyDetail = 1.0 + energy * 0.5;

  // === DOMAIN WARPING: gentle organic UV distortion ===
  p += vec2(fbm3(vec3(p * 0.5 * energyDetail, uDynamicTime * 0.05)), fbm3(vec3(p * 0.5 * energyDetail + 100.0, uDynamicTime * 0.05))) * 0.3;

  // Deep black background with subtle warm gradient
  float bgGrad = 1.0 - length(p) * 0.3;
  vec3 col = vec3(0.015, 0.012, 0.018) * bgGrad;

  // === GEOMETRIC ELEMENTS ===
  // Sub-pixel anti-aliasing width (resolution-aware)
  float px = 1.5 / min(uResolution.x, uResolution.y);

  // Breathing circle — radius tied to RMS (smoothstep eased)
  float breathPhase = sin(t * 2.0);
  float easedBreath = breathPhase * breathPhase * (3.0 - 2.0 * abs(breathPhase)) * sign(breathPhase);
  // --- Phase 1: New uniform integrations ---
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float stabilityGeo = uBeatStability;  // high=geometric, low=organic
  float pitchRadius = uMelodicPitch * 0.05;  // melodic pitch affects circle radius

  float circleR = 0.15 + (uRms + uFastEnergy * 0.5) * 0.12 + easedBreath * 0.04 + pitchRadius;
  float circleDist = sdCircle(p, circleR);
  float circleEdge = smoothstep(px, 0.0, abs(circleDist));
  float circleFill = smoothstep(0.02, 0.0, circleDist) * 0.03;

  // Accent color from palette (used sparingly)
  float acHue = hsvToCosineHue(uPalettePrimary) + chromaHueMod + chordHue;
  vec3 accentCol = 0.5 + 0.5 * cos(6.28318 * vec3(acHue, acHue + 0.33, acHue + 0.67));
  vec3 accentGray = vec3(dot(accentCol, vec3(0.299, 0.587, 0.114)));
  accentCol = mix(accentGray, accentCol, uPaletteSaturation * 0.7); // Reduced saturation

  col += circleEdge * vec3(0.5, 0.48, 0.45) * 0.4; // Thin white circle outline
  col += circleFill * accentCol * energy * sectionAccent; // Subtle accent fill, section-modulated

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Concentric rings — expand on beats (amplified, sub-pixel AA)
  float bp = beatPulse(uMusicalTime);
  float ringExpand = uBeatSnap * 0.25 + bp * 0.15 + climaxBoost * 0.08 + uDrumOnset * 0.15;
  // Store ring positions for connecting lines
  vec2 ringPoints[3];
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    float ringR = circleR + fi * 0.08 + ringExpand * fi;
    float ringDist = sdCircle(p, ringR);
    float ringEdge = smoothstep(px, 0.0, abs(ringDist));
    float ringAlpha = 0.15 / fi;
    col += ringEdge * vec3(0.35, 0.33, 0.30) * ringAlpha;
    // Point on ring for constellation lines
    float ptAngle = t * (0.3 + fi * 0.15) + fi * 2.094;
    ringPoints[i-1] = vec2(cos(ptAngle), sin(ptAngle)) * ringR;
  }

  // === GOLDEN RATIO SPIRAL (Fibonacci) ===
  float spiralAngle = atan(p.y, p.x);
  float spiralR = length(p);
  // Logarithmic spiral: r = a * e^(b*theta), b = 1/golden_ratio
  float goldenB = 0.3063; // ln(golden_ratio) / (PI/2)
  float spiralPhase = t * 0.5;
  float spiralDist = abs(spiralR - 0.05 * exp(goldenB * (spiralAngle + spiralPhase + 6.28318)));
  // Wrap for multiple arms
  float spiralDist2 = abs(spiralR - 0.05 * exp(goldenB * (spiralAngle + spiralPhase + 6.28318 * 2.0)));
  float spiralDist3 = abs(spiralR - 0.05 * exp(goldenB * (spiralAngle + spiralPhase)));
  float minSpiral = min(spiralDist, min(spiralDist2, spiralDist3));
  float spiralEdge = smoothstep(px * 1.5, 0.0, minSpiral) * smoothstep(0.5, 0.15, spiralR);
  col += spiralEdge * accentCol * 0.12;

  // === CONSTELLATION LINES: thin connecting lines between ring points ===
  for (int i = 0; i < 2; i++) {
    float connDist = sdLine(p, ringPoints[i], ringPoints[i+1]);
    float connEdge = smoothstep(px, 0.0, connDist);
    col += connEdge * vec3(0.2, 0.19, 0.18) * 0.08;
  }
  // Close the triangle
  float closeDist = sdLine(p, ringPoints[2], ringPoints[0]);
  col += smoothstep(px, 0.0, closeDist) * vec3(0.2, 0.19, 0.18) * 0.06;

  // Rotating line — sweeps slowly with eased acceleration
  float linePhase = t * 1.2 + sectionSeed;
  float easedAngle = linePhase + 0.15 * sin(linePhase * 0.7); // smooth acceleration/deceleration
  float lineLen = 0.35 + uMids * 0.15;
  vec2 lineDir = vec2(cos(easedAngle), sin(easedAngle));
  float lineDist = sdLine(p, -lineDir * lineLen, lineDir * lineLen);
  float lineEdge = smoothstep(px, 0.0, abs(lineDist - 0.001));
  col += lineEdge * vec3(0.3, 0.28, 0.25) * 0.3;

  // Cross-hair at center — subtle (sub-pixel AA)
  float crossH = smoothstep(px, 0.0, abs(p.y)) * smoothstep(0.06, 0.04, abs(p.x));
  float crossV = smoothstep(px, 0.0, abs(p.x)) * smoothstep(0.06, 0.04, abs(p.y));
  col += (crossH + crossV) * vec3(0.2, 0.19, 0.17) * 0.15;

  // === SLOW NOISE FIELD: rich background texture (fbm6 + dual palette + energy-responsive) ===
  float noiseField = fbm6(vec3(p * 2.0 * energyDetail, t * 0.2 + sectionSeed));
  col += noiseField * 0.015 * vec3(0.8, 0.75, 0.7) * sectionComplexity;
  // Secondary palette wash in the noise field
  float secAccentHue = hsvToCosineHue(uPaletteSecondary) + noiseField * 0.1;
  vec3 secAccent = 0.5 + 0.5 * cos(6.28318 * vec3(secAccentHue, secAccentHue + 0.33, secAccentHue + 0.67));
  col += secAccent * 0.008 * (0.5 + noiseField * 0.5) * sectionComplexity;

  // === SECONDARY LAYER: flowing organic field beneath geometry ===
  float orgNoise = fbm6(vec3(p * 1.5 * energyDetail + 50.0, t * 0.15));
  vec3 orgCol1 = 0.5 + 0.5 * cos(6.28318 * vec3(acHue + 0.15, acHue + 0.48, acHue + 0.82));
  vec3 orgCol2 = secAccent;
  vec3 orgLayer = mix(orgCol1, orgCol2, orgNoise * 0.5 + 0.5) * 0.02 * (0.5 + orgNoise * 0.5);
  col = mix(col, col + orgLayer, 0.3);

  // === CENTROID-DRIVEN GLOW: brighter when treble-heavy + climax ===
  float centroidGlow = uCentroid * 0.04 + climaxBoost * 0.03;
  float glowDist = length(p);
  float glow = exp(-glowDist * 4.0) * centroidGlow;
  col += glow * accentCol * sectionAccent;

  // === SECTION TRANSITION: horizontal wipe line ===
  float edgeDist = min(uSectionProgress, 1.0 - uSectionProgress);
  float wipeLine = smoothstep(0.04, 0.0, edgeDist);
  float wipeY = mix(-0.5, 0.5, uSectionProgress) * aspect.y;
  float wipeEdge = smoothstep(0.003, 0.0, abs(p.y - wipeY)) * wipeLine;
  col += wipeEdge * vec3(0.4, 0.38, 0.35) * 0.5;

  // Subtle vignette
  float vig = 1.0 - dot(p * 0.39, p * 0.39);
  vig = smoothstep(0.0, 1.0, vig);
  col *= mix(0.85, 1.0, vig);

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  col = stageFloodFill(col, p, uDynamicTime, uEnergy, uPalettePrimary, uPaletteSecondary);

  // === ANAMORPHIC FLARE: horizontal light streak ===
  col = anamorphicFlare(vUv, col, uEnergy, uOnsetSnap);

  // === HALATION: warm film bloom ===
  col = halation(vUv, col, uEnergy);

  // === CINEMATIC GRADE (ACES filmic tone mapping) ===
  col = cinematicGrade(col, uEnergy);

  // Very light grain
  float grainTime = floor(uTime * 15.0) / 15.0;
  col += filmGrain(uv, grainTime) * 0.03;

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(onsetLuma), col, 1.0 + onsetPulse * 1.0);
  col *= 1.0 + onsetPulse * 0.12;

  // ONSET CHROMATIC ABERRATION (directional fringing)
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    col = applyCA(col, vUv, caAmt);
  }

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  vec3 _bg = vec3(0.12, 0.10, 0.08);
  col += iconEmergence(p, uTime, energy, uBass, accentCol, _bg, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, accentCol, _bg, _nf, uSectionIndex);

  // Lifted blacks (build-phase-aware: near true black during build for anticipation)
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  col = max(col, vec3(0.06, 0.05, 0.08) * liftMult);

  gl_FragColor = vec4(col, 1.0);
}
`;
