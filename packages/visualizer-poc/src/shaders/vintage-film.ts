/**
 * Vintage Film — 16mm film projector simulation with light leaks,
 * sprocket holes, gate weave, and grain. References actual concert
 * film footage aesthetic from the 1970s.
 * Audio-reactive: energy drives light leak intensity, beat triggers gate flicker.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";

export const vintageFilmVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const vintageFilmFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

varying vec2 vUv;

#define PI 3.14159265

float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Gate weave — onset-reactive frame jitter (film physically jolts on transients)
vec2 gateWeave(float t, float onset) {
  float wx = sin(t * 7.3) * 0.002 + sin(t * 13.1) * 0.001;
  float wy = sin(t * 5.7) * 0.003 + sin(t * 11.3) * 0.0015;
  // Onset jolt: sharp kick on percussive hits
  wx += onset * 0.004 * sin(t * 31.7);
  wy += onset * 0.006 * cos(t * 27.3);
  return vec2(wx, wy);
}

// Hexagonal bokeh: bright defocused circles
float hexBokeh(vec2 uv, vec2 center, float radius) {
  vec2 d = abs(uv - center);
  // Hexagonal distance (approximate)
  float hex = max(d.x * 0.866 + d.y * 0.5, d.y);
  return smoothstep(radius, radius * 0.7, hex);
}

// Bayer matrix dithering (4x4) for blue-noise-approximation grain
float bayerGrain(vec2 fragCoord, float time) {
  // 4x4 Bayer pattern
  int x = int(mod(fragCoord.x, 4.0));
  int y = int(mod(fragCoord.y, 4.0));
  int idx = x + y * 4;
  float bayer = 0.0;
  if (idx == 0) bayer = 0.0;    else if (idx == 1) bayer = 8.0;
  else if (idx == 2) bayer = 2.0;  else if (idx == 3) bayer = 10.0;
  else if (idx == 4) bayer = 12.0; else if (idx == 5) bayer = 4.0;
  else if (idx == 6) bayer = 14.0; else if (idx == 7) bayer = 6.0;
  else if (idx == 8) bayer = 3.0;  else if (idx == 9) bayer = 11.0;
  else if (idx == 10) bayer = 1.0; else if (idx == 11) bayer = 9.0;
  else if (idx == 12) bayer = 15.0;else if (idx == 13) bayer = 7.0;
  else if (idx == 14) bayer = 13.0;else bayer = 5.0;
  bayer /= 16.0;
  // Animate with time hash for temporal variation
  float h = fract(sin(dot(fragCoord * 0.01, vec2(12.9898, 78.233)) + time * 43758.5453) * 43758.5453);
  return (bayer + h - 1.0) * 2.0;
}

void main() {
  float t = uTime;
  vec2 weave = gateWeave(t, uOnsetSnap) * (1.0 + uBeatSnap * 2.0);
  vec2 uv = vUv + weave;
  vec2 centered = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: more flicker, heavier grain, frequent leaks. Space: stable, clean, rare leaks. Chorus: bright leaks.
  float sectionFlicker = mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);
  float sectionGrain = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace);
  float sectionLeakFreq = mix(1.0, 1.3, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.2, sChorus);

  // Base scene — warm amber abstract shapes (as if projected concert footage)
  float dt = uDynamicTime;
  float n1 = snoise(vec3(centered * 1.5 + dt * 0.1, dt * 0.05));
  float n2 = snoise(vec3(centered * 3.0 - dt * 0.08, dt * 0.03 + 5.0));
  float n3 = snoise(vec3(centered * 0.8 + dt * 0.15, dt * 0.07 + 10.0));

  float scene = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  scene = scene * 0.5 + 0.5;

  // Warm vintage color grading — amber/sepia tones
  vec3 warm = vec3(0.95, 0.8, 0.5);
  vec3 cool = vec3(0.3, 0.25, 0.4);
  vec3 color = mix(cool, warm, scene);

  // Palette influence
  vec3 palColor = hsv2rgb(vec3(uPalettePrimary, 0.4 * uPaletteSaturation, 0.6));
  color = mix(color, palColor, 0.25);

  // Audio reactivity — energy drives brightness
  color *= 0.30 + uEnergy * 0.50 + uRms * 0.2;

  // Light leaks — overexposed edges with color bleeding
  float leakAngle = t * 0.3 + uSectionIndex * 1.5;
  vec2 leakDir = vec2(cos(leakAngle), sin(leakAngle));
  float leak1 = smoothstep(0.4, 1.0, dot(normalize(centered + 0.01), leakDir));
  leak1 *= smoothstep(1.5, 0.3, length(centered));

  float leakAngle2 = t * 0.2 + 2.0;
  vec2 leakDir2 = vec2(cos(leakAngle2), sin(leakAngle2));
  float leak2 = smoothstep(0.5, 1.0, dot(normalize(centered + 0.01), leakDir2));
  leak2 *= smoothstep(1.2, 0.5, length(centered));

  vec3 leakColor1 = hsv2rgb(vec3(0.08, 0.8, 1.0)); // Orange
  vec3 leakColor2 = hsv2rgb(vec3(0.95, 0.6, 0.9)); // Red-magenta

  float stemVocals = clamp(uStemVocals, 0.0, 1.0);
  float leakIntensity = (0.15 + uEnergy * 0.25 + stemVocals * 0.15) * sectionLeakFreq; // vocals widen light leaks
  color += leakColor1 * leak1 * leakIntensity;
  color += leakColor2 * leak2 * leakIntensity * 0.6;

  // Sprocket hole simulation — dark vertical bands at edges
  float sprocketEdge = smoothstep(0.0, 0.04, abs(uv.x - 0.03)) *
                        smoothstep(0.0, 0.04, abs(uv.x - 0.97));
  // Sprocket holes — periodic dark rectangles
  float sprocketY = fract(uv.y * 8.0 + t * 0.5);
  float hole = step(0.3, sprocketY) * step(sprocketY, 0.7);
  float sprocketMask = mix(1.0, 0.0,
    (1.0 - sprocketEdge) * hole * 0.3);
  color *= sprocketMask;

  // === HALATION: warm film bloom ===
  color = halation(vUv, color, uEnergy);

  // === HEXAGONAL BOKEH: bright defocused circles ===
  float lum2 = dot(color, vec3(0.299, 0.587, 0.114));
  if (lum2 > 0.45) {
    float bokehStr = smoothstep(0.45, 0.8, lum2) * 0.12;
    // 3 bokeh circles at semi-random positions near bright areas
    for (int b = 0; b < 3; b++) {
      float fb = float(b);
      vec2 bokehPos = centered + vec2(
        sin(t * 0.3 + fb * 2.1) * 0.15,
        cos(t * 0.25 + fb * 3.7) * 0.1
      );
      float bokeh = hexBokeh(centered, bokehPos, 0.06 + fb * 0.02);
      color += bokeh * bokehStr * vec3(1.0, 0.95, 0.85);
    }
  }

  // Bayer-dithered film grain (blue-noise approximation — less harsh than hash grain)
  float grainTime = floor(t * 15.0) / 15.0;
  float bayerN = bayerGrain(gl_FragCoord.xy, grainTime);
  color += bayerN * vec3(1.0, 0.95, 0.85) * (0.05 + uSpectralFlux * 0.03) * sectionGrain;

  // Vertical scratches — random thin lines
  float scratch = smoothstep(0.001, 0.0, abs(uv.x - hash(floor(t * 3.0)) ));
  scratch *= hash(floor(t * 3.0) + 0.5);
  color += scratch * 0.15;

  // Frame flicker — subtle brightness variation
  float flicker = 0.95 + 0.05 * sin(t * 24.0 * PI);
  flicker *= 0.97 + 0.03 * hash(floor(t * 24.0));
  color *= flicker;

  // === CLIMAX REACTIVITY ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // Beat-triggered gate flicker (projector stutter — amplified)
  float bp = beatPulse(uMusicalTime);
  float gateFlicker = 1.0 - (bp * 0.15 + max(uBeatSnap, uDrumBeat) * 0.14) * sectionFlicker;
  color *= gateFlicker;

  // Vignette — heavy, like a projector hotspot
  float vig = 1.0 - smoothstep(0.6, 1.4, length(centered));
  vig = 0.55 + vig * 0.45;
  color *= vig;

  // === ANIMATED STAGE FLOOD: flowing palette noise in dark areas ===
  color = stageFloodFill(color, centered, uDynamicTime, uEnergy, uPalettePrimary, uPaletteSecondary);

  // === ANAMORPHIC FLARE: horizontal light streak ===
  color = anamorphicFlare(vUv, color, uEnergy, uOnsetSnap);

  // === CINEMATIC GRADE (ACES filmic tone mapping) ===
  color = cinematicGrade(color, uEnergy);

  // === KODACHROME COLOR PUSH: warm shadows, rich midtones ===
  float filmLuma = dot(color, vec3(0.299, 0.587, 0.114));
  // Warm shadows (push dark areas toward amber)
  color = mix(color, color * vec3(1.15, 0.95, 0.75), smoothstep(0.3, 0.0, filmLuma) * 0.25);
  // Rich midtone saturation boost
  color = mix(color, color * vec3(1.08, 1.0, 0.88), smoothstep(0.0, 0.4, filmLuma) * smoothstep(0.8, 0.4, filmLuma) * 0.2);

  // ONSET SATURATION PULSE: push colors away from gray (psychedelic, not white)
  float onsetPulse = step(0.5, uOnsetSnap) * uOnsetSnap;
  float onsetLuma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(onsetLuma), color, 1.0 + onsetPulse * 1.0);
  color *= 1.0 + onsetPulse * 0.12;

  // ONSET CHROMATIC ABERRATION (directional fringing)
  if (uOnsetSnap > 0.4) {
    float caAmt = (uOnsetSnap - 0.4) * 0.15;
    color = applyCA(color, vUv, caAmt);
  }

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(centered * 2.0, uTime * 0.1));
  color += iconEmergence(centered, uTime, energy, uBass, warm, palColor, _nf, uClimaxPhase, uSectionIndex);
  color += heroIconEmergence(centered, uTime, energy, uBass, warm, palColor, _nf, uSectionIndex);

  // Lifted blacks (build-phase-aware: near true black during build for anticipation)
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.15, isBuild * uClimaxIntensity);
  color = max(color, vec3(0.06, 0.05, 0.08) * liftMult);

  gl_FragColor = vec4(color, 1.0);
}
`;
