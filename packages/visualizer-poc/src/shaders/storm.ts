/**
 * Storm — thunderstorm clouds viewed from below with lightning, rain, and wind.
 * Dramatic, ominous, powerful. Near-black between flashes, full electrical storm at peaks.
 *
 * Audio reactivity:
 *   uEnergy       -> cloud roil speed, overall storm intensity
 *   uOnset        -> lightning flash trigger
 *   uBass         -> wind particle intensity, thunder rumble glow
 *   uHighs        -> rain intensity, detail in cloud edges
 *   uOnsetSnap    -> secondary flash trigger
 *   uSlowEnergy   -> ambient purple cloud glow
 *   uStemDrumOnset -> biggest lightning bolts
 *   uSpectralFlux -> cloud turbulence
 *   uSectionType  -> jam=constant rumble/frequent lightning, space=distant/dark, solo=massive bolt
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const stormVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const stormFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'heavy', bloomEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Storm cloud FBM: layered, turbulent ---
mat2 stormRot = mat2(0.82, 0.57, -0.57, 0.82);

float stormCloudFBM(vec3 p, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    val += amp * snoise(p * freq);
    p.xz = stormRot * p.xz;
    p.y *= 1.05;
    freq *= 2.15;
    amp *= 0.50;
  }
  return val;
}

// --- Lightning bolt SDF: branching fork pattern ---
float lightningBolt(vec2 p, float seed, float time) {
  // Main bolt: segmented zigzag line
  float d = 1e10;
  vec2 pos = vec2(0.0, 0.5); // start from top
  float segLen = 0.08;
  float angle = -PI * 0.5; // pointing down

  for (int i = 0; i < 12; i++) {
    // Random zigzag angle per segment
    float h = fract(sin(float(i) * 73.156 + seed * 31.72) * 43758.5453);
    float zigzag = (h - 0.5) * 1.2;
    angle += zigzag;

    vec2 nextPos = pos + vec2(cos(angle), sin(angle)) * segLen;

    // Line segment SDF
    vec2 pa = p - pos;
    vec2 ba = nextPos - pos;
    float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float segDist = length(pa - ba * t);

    // Thicker at top, thinner at bottom
    float thickness = 0.006 * (1.0 - float(i) * 0.06);
    d = min(d, segDist - thickness);

    // Branch at some segments
    if (i == 3 || i == 6 || i == 9) {
      float branchAngle = angle + (h > 0.5 ? 0.8 : -0.8);
      vec2 branchEnd = pos + vec2(cos(branchAngle), sin(branchAngle)) * segLen * 0.6;
      vec2 bp = p - pos;
      vec2 bb = branchEnd - pos;
      float bt = clamp(dot(bp, bb) / dot(bb, bb), 0.0, 1.0);
      float branchDist = length(bp - bb * bt) - 0.003;
      d = min(d, branchDist);
    }

    pos = nextPos;
  }
  return d;
}

// --- Rain: diagonal streaks ---
float rain(vec2 uv, float time, float intensity, float windAngle) {
  float acc = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float speed = 2.0 + float(layer) * 0.8;
    float density = 40.0 + float(layer) * 20.0;
    float seed = float(layer) * 17.3;

    // Rotate UV for wind angle
    vec2 ruv = uv;
    ruv.x += ruv.y * windAngle * 0.3;
    ruv.y -= time * speed;

    vec2 cell = floor(ruv * density);
    vec2 f = fract(ruv * density);

    float h = fract(sin(dot(cell + seed, vec2(127.1, 311.7))) * 43758.5453);

    // Vertical streak
    float streakX = abs(f.x - h) * density;
    float streakY = f.y;
    float streak = smoothstep(1.5, 0.0, streakX) * smoothstep(0.0, 0.15, streakY) * smoothstep(0.7, 0.3, streakY);
    streak *= step(0.6, h); // only some cells have rain

    acc += streak * (0.5 + float(layer) * 0.15);
  }
  return acc * intensity;
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
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float slowTime = uDynamicTime * 0.1;
  float cloudSpeed = (0.05 + energy * 0.08 + flux * 0.04) * mix(1.0, 1.6, sJam) * mix(1.0, 0.3, sSpace);

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  // === SKY: near-black base ===
  vec3 col = vec3(0.01, 0.01, 0.02);

  // === CLOUD LAYER: top 60% ===
  float cloudY = smoothstep(-0.1, 0.15, p.y); // clouds exist above this line

  if (cloudY > 0.01) {
    // Cloud density from layered FBM
    int cloudOctaves = 4 + int(energy * 2.0) + int(sJam * 2.0);
    vec3 cloudPos = vec3(p.x * 1.5, p.y * 0.8 + slowTime * cloudSpeed, slowTime * cloudSpeed * 0.3);
    float cloudDensity = stormCloudFBM(cloudPos, cloudOctaves);

    // Second layer: slower, larger scale
    float cloudDensity2 = stormCloudFBM(cloudPos * 0.4 + vec3(10.0, slowTime * cloudSpeed * 0.2, 5.0), cloudOctaves - 1);

    float cloud = smoothstep(-0.1, 0.4, cloudDensity) * 0.7 + smoothstep(-0.05, 0.3, cloudDensity2) * 0.3;
    cloud *= cloudY;

    // Cloud color: dark gray with subtle purple/blue glow
    vec3 cloudColor = vec3(0.03, 0.025, 0.04);
    // Purple underglow from ambient electrical charge
    float purpleGlow = slowE * 0.08 + energy * 0.04;
    cloudColor += vec3(0.04, 0.01, 0.06) * purpleGlow;
    // Jam: more purple rumble
    cloudColor += vec3(0.03, 0.01, 0.05) * sJam * 0.3;

    col = mix(col, cloudColor, cloud);

    // Cloud edge highlights (subtle)
    float edgeLight = smoothstep(0.3, 0.5, cloudDensity) * (1.0 - smoothstep(0.5, 0.7, cloudDensity));
    col += vec3(0.06, 0.04, 0.08) * edgeLight * cloud * (0.3 + energy * 0.4);
  }

  // === LIGHTNING ===
  // Flash probability: onset-driven with section modulation
  float flashChance = max(onset, drumOnset * 1.5);
  flashChance = max(flashChance, uBeatSnap * 0.5);
  // Jam: more frequent flashes
  flashChance *= mix(1.0, 2.0, sJam);
  // Space: rare distant flashes
  flashChance *= mix(1.0, 0.15, sSpace);
  // Solo: single massive bolt
  float soloFlash = sSolo * step(0.8, onset);

  // Flash timing: seed from musical time for beat-locked flashes
  float flashSeed = floor(uMusicalTime * 4.0);
  float flashHash = fract(sin(flashSeed * 91.237) * 43758.5453);
  float flashActive = step(1.0 - flashChance * 0.5, flashHash);
  flashActive = max(flashActive, soloFlash);

  // Flash decay: quick bright then fast fade
  float flashTime = fract(uMusicalTime * 4.0);
  float flashBrightness = flashActive * smoothstep(0.0, 0.02, flashTime) * smoothstep(0.3, 0.05, flashTime);
  // Drum onset: biggest bolts
  float drumBoltScale = mix(1.0, 2.0, drumOnset);
  flashBrightness *= drumBoltScale;
  flashBrightness += climaxBoost * 0.3 * flashActive;

  if (flashBrightness > 0.01) {
    // Lightning bolt position: random horizontal offset
    float boltX = (flashHash - 0.5) * 1.2;
    // Solo: center the bolt
    boltX = mix(boltX, 0.0, sSolo);

    vec2 boltUV = p - vec2(boltX, 0.1);
    float boltDist = lightningBolt(boltUV, flashSeed, uTime);

    // Bolt glow: bright core with wide falloff
    float boltGlow = smoothstep(0.15, 0.0, boltDist) * flashBrightness;
    float boltCore = smoothstep(0.008, 0.0, boltDist) * flashBrightness;

    // Lightning color: blue-white core, purple-white glow
    vec3 boltColor = vec3(0.7, 0.7, 1.0) * boltGlow * 1.5;
    boltColor += vec3(1.0, 0.95, 1.0) * boltCore * 3.0;
    col += boltColor;

    // Cloud illumination from flash: wide area bloom
    float cloudIllum = flashBrightness * 0.4;
    float illumDist = length(p - vec2(boltX, 0.15));
    float illumFalloff = smoothstep(0.8, 0.0, illumDist);
    col += vec3(0.15, 0.12, 0.20) * cloudIllum * illumFalloff * cloudY;

    // Full-sky flash at peak moments
    float skyFlash = flashBrightness * 0.08 * (1.0 + climaxBoost);
    col += vec3(0.1, 0.08, 0.15) * skyFlash;
  }

  // === RAIN: diagonal sheets below clouds ===
  float rainIntensity = mix(0.0, 0.3, energy) + highs * 0.15;
  rainIntensity *= mix(1.0, 1.5, sJam);
  rainIntensity *= mix(1.0, 0.2, sSpace);
  float windAngle = 0.3 + bass * 0.4; // wind from bass
  float rainVal = rain(uv, uTime, rainIntensity, windAngle);
  // Rain only below cloud base
  float rainMask = smoothstep(0.2, -0.1, p.y);
  col += vec3(0.12, 0.12, 0.15) * rainVal * rainMask;

  // === WIND PARTICLES: bass-driven streaks ===
  float windStrength = bass * 0.15 + uFastBass * 0.1;
  if (windStrength > 0.01) {
    vec2 windUV = uv;
    windUV.x += uTime * 0.8;
    windUV.y += sin(windUV.x * 5.0) * 0.02;
    float windNoise = snoise(vec3(windUV * vec2(8.0, 2.0), uTime * 0.5));
    float windParticle = smoothstep(0.6, 0.8, windNoise) * windStrength;
    // Mostly in lower half
    windParticle *= smoothstep(0.3, -0.2, p.y);
    col += vec3(0.08, 0.08, 0.1) * windParticle;
  }

  // === DISTANT THUNDER GLOW (space sections) ===
  float distantGlow = sSpace * 0.06 * (0.5 + 0.5 * sin(uTime * 0.3));
  float distantPos = sin(uTime * 0.1) * 0.5;
  float distantDist = length(p - vec2(distantPos, 0.3));
  col += vec3(0.04, 0.02, 0.06) * distantGlow * smoothstep(0.6, 0.0, distantDist);

  // === HERO ICON EMERGENCE ===
  {
    float nf = stormCloudFBM(vec3(p * 2.0, slowTime), 4);
    vec3 heroLight = heroIconEmergence(p, uTime, energy, bass,
      vec3(0.5, 0.4, 1.0), vec3(1.0, 0.95, 1.0), nf, uSectionIndex);
    col += heroLight;
  }

  // === VIGNETTE: heavy darkness at edges ===
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.005, 0.01), col, vignette);

  // === DARKNESS TEXTURE ===
  col += darknessTexture(uv, uTime, energy);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
