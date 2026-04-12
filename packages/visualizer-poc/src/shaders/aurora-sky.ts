/**
 * Aurora Sky — raymarched full-sky aurora panorama with terrain silhouettes.
 * Looking UP at the entire dome of sky. Northern lights fill the entire hemisphere,
 * meteor streaks, star field, and terrain silhouette at the horizon.
 * Different from aurora.ts (which is ground-level curtains). This is the full
 * sky dome experience rendered with volumetric raymarching.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → curtain brightness, speed, activity level
 *   uBass             → curtain sway amplitude, horizon glow pulse
 *   uHighs            → fine aurora detail, star twinkle, meteor sharpness
 *   uOnsetSnap        → meteor trigger, aurora flash
 *   uBeatSnap         → curtain brightness pulse sync
 *   uSlowEnergy       → overall sky brightness, drift speed
 *   uHarmonicTension  → aurora complexity, color band count
 *   uBeatStability    → smooth curtain flow vs turbulent dance
 *   uMelodicPitch     → aurora curtain altitude, zenith brightness
 *   uChromaHue        → aurora color shift (green/purple/pink rotation)
 *   uChordIndex       → per-chord aurora band hue offset
 *   uVocalEnergy      → zenith corona brightness
 *   uSpectralFlux     → aurora FBM complexity, curtain fold density
 *   uSectionType      → jam=rapid dance, space=gentle glow, solo=focused beam
 *   uClimaxPhase      → full dome aurora explosion
 *   uPalettePrimary/Secondary → aurora base + accent colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const auroraSkyVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const auroraSkyFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, halationEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ═══════════════════════════════════════════════════════════
// Prefixed helpers — as2 namespace
// ═══════════════════════════════════════════════════════════

// Star field: procedural multi-layer
float as2Stars(vec2 coordUv, float density, float seed) {
  vec2 cell = floor(coordUv * density);
  vec2 f = fract(coordUv * density);
  float h = fract(sin(dot(cell + seed, vec2(127.1, 311.7))) * 43758.5);
  float h2 = fract(sin(dot(cell + seed, vec2(269.5, 183.3))) * 43758.5);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.72, h);
  float brightness = h2 * 0.6 + 0.4;
  return hasStar * brightness * smoothstep(0.025, 0.003, dist);
}

// Terrain silhouette: layered noise for organic mountain profile
float as2TerrainSilhouette(float xCoord) {
  float m = 0.0;
  m += snoise(vec3(xCoord * 1.2, 0.0, 0.0)) * 0.08;
  m += snoise(vec3(xCoord * 2.5, 1.0, 0.0)) * 0.04;
  m += snoise(vec3(xCoord * 6.0, 2.0, 0.0)) * 0.018;
  m += snoise(vec3(xCoord * 15.0, 3.0, 0.0)) * 0.008;
  m += 0.08; // base height
  // Tree spikes on ridgeline
  float treeNoise = snoise(vec3(xCoord * 30.0, 4.0, 0.0));
  m += max(0.0, treeNoise) * 0.012;
  return m;
}

// Aurora FBM: vertically-stretched with horizontal sine deformation
mat2 as2AuroraRot = mat2(0.80, 0.60, -0.60, 0.80);

float as2AuroraCurtainFBM(vec3 pos, float complexity, float turbulence) {
  int octaves = 4 + int(complexity * 4.0);
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  // Domain warp for organic folds
  float warpX = snoise(pos * 0.3 + vec3(7.0, 0.0, 3.0)) * 0.3;
  float warpZ = snoise(pos * 0.25 + vec3(0.0, 11.0, 5.0)) * 0.25;
  pos.x += warpX;
  pos.z += warpZ;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    val += amp * snoise(pos * freq);
    pos.xz = as2AuroraRot * pos.xz;
    pos.y *= 1.15;
    pos.x += turbulence * 0.15 * float(i);
    freq *= 2.15;
    amp *= 0.46;
  }
  return val;
}

// Meteor streak
float as2MeteorStreak(vec2 coordUv, vec2 startPos, vec2 endPos, float width, float progress) {
  vec2 dir = endPos - startPos;
  float len = length(dir);
  vec2 normDir = dir / max(len, 0.001);
  vec2 toPoint = coordUv - startPos;
  float along = dot(toPoint, normDir);
  float perp = abs(dot(toPoint, vec2(-normDir.y, normDir.x)));

  // Meteor head position
  float headPos = progress * len;
  float tailLen = 0.15;

  float inMeteor = smoothstep(headPos - tailLen, headPos, along)
                 * smoothstep(headPos + 0.01, headPos, along)
                 * smoothstep(width, width * 0.2, perp);

  return inMeteor;
}

// ═══════════════════════════════════════════════════════════
// Volumetric sky dome ray setup
// ═══════════════════════════════════════════════════════════

vec3 as2SkyRayDir(vec2 screenPos, float camPitch) {
  // Hemisphere mapping: screen coords to sky dome direction
  // Looking UP: y component increases with distance from center
  float pitch = camPitch + screenPos.y * PI * 0.4 + PI * 0.25;
  float yaw = screenPos.x * PI * 0.5;
  return normalize(vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)));
}

void main() {
  vec2 fragUv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (fragUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float chromaH = uChromaHue;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * smoothstep(0.3, 0.6, uChordConfidence);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float slowTime = uDynamicTime * 0.04;
  float driftSpeed = (0.04 + slowE * 0.03) * mix(1.0, 2.0, sJam) * mix(1.0, 0.3, sSpace);

  // Aurora colors
  float hueBase = chromaH * 0.15;
  vec3 auroraGreen = hsv2rgb(vec3(0.33 + hueBase + chordHue, 0.85 * uPaletteSaturation, 1.0));
  vec3 auroraPurple = hsv2rgb(vec3(0.78 + hueBase * 0.5 + chordHue * 0.5, 0.75 * uPaletteSaturation, 0.9));
  vec3 auroraPink = hsv2rgb(vec3(0.92 + hueBase * 0.3, 0.65 * uPaletteSaturation, 0.85));
  vec3 auroraBlue = hsv2rgb(vec3(0.58 + hueBase * 0.4, 0.8 * uPaletteSaturation, 0.7));

  // Blend palette
  auroraGreen = mix(auroraGreen, hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0)), 0.2);
  auroraPurple = mix(auroraPurple, hsv2rgb(vec3(uPaletteSecondary, 0.7, 0.9)), 0.2);

  vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary + chromaH * 0.1, uPaletteSaturation * 0.9, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary + chordHue, uPaletteSaturation * 0.8, 0.85));

  // ═══ Sky dome ray direction ═══
  float camPitch = 0.3 + melPitch * 0.2; // looking upward
  vec3 skyDir = as2SkyRayDir(screenPos, camPitch);
  float skyElevation = skyDir.y; // 0=horizon, 1=zenith

  // ═══ Sky gradient: deep night ═══
  vec3 col = mix(
    vec3(0.01, 0.01, 0.04),
    vec3(0.005, 0.008, 0.025),
    smoothstep(0.0, 0.8, skyElevation)
  );
  // Subtle horizon glow
  col += vec3(0.015, 0.012, 0.025) * smoothstep(0.15, 0.0, skyElevation);

  // ═══ Star field: 3 depth layers ═══
  {
    vec2 starUV = vec2(atan(skyDir.x, skyDir.z) / TAU + 0.5, skyElevation);
    float starLayer1 = as2Stars(starUV + slowTime * 0.005, 100.0, 0.0);
    float starLayer2 = as2Stars(starUV + slowTime * 0.003 + 10.0, 160.0, 42.0) * 0.5;
    float starLayer3 = as2Stars(starUV + slowTime * 0.001 + 25.0, 220.0, 91.0) * 0.3;
    float twinkle = 0.7 + 0.3 * sin(uTime * 2.5 + starUV.x * 60.0 + starUV.y * 40.0);
    float twinkle2 = 0.8 + 0.2 * cos(uTime * 1.8 + starUV.x * 35.0);
    vec3 starColor = vec3(0.85, 0.9, 1.0) * (starLayer1 * twinkle + starLayer2 * twinkle2 + starLayer3);
    // Highs brighten stars
    starColor *= 1.0 + highs * 0.3;
    col += starColor * 0.5;
  }

  // ═══ Volumetric aurora raymarching ═══
  {
    float curtainBase = mix(0.05, 0.3, energy) + melPitch * 0.15;
    float curtainTop = mix(0.4, 0.9, energy) + melPitch * 0.1;

    // Solo: narrow focused beam
    float curtainWidthMod = 1.0 - sSolo * 0.4;

    vec4 auroraAcc = vec4(0.0);
    int maxSteps = 24 + int(energy * 16.0) + int(sJam * 8.0);
    float stepSize = mix(0.1, 0.06, energy);

    for (int i = 0; i < 48; i++) {
      if (i >= maxSteps) break;
      if (auroraAcc.a > 0.95) break;

      float marchT = float(i) * stepSize + 0.2;
      vec3 samplePos = skyDir * marchT;

      // Curtain vertical constraint (in elevation space)
      float sampleElev = samplePos.y / max(marchT, 0.01);
      if (sampleElev < curtainBase || sampleElev > curtainTop) continue;

      // Horizontal sine wave deformation (curtain shape)
      float sineDeform = sin(samplePos.y * 3.0 + slowTime * driftSpeed * 8.0) * 0.3;
      sineDeform += sin(samplePos.y * 7.0 + slowTime * driftSpeed * 12.0) * 0.1;
      sineDeform += sin(samplePos.y * 13.0 + slowTime * driftSpeed * 18.0) * 0.05; // extra octave for dome
      samplePos.x += sineDeform * curtainWidthMod;

      // Bass sway
      float swayAmt = bass * 0.3 * mix(1.0, 0.5, stability);
      samplePos.x += swayAmt * sin(samplePos.y * 2.5 + slowTime * 0.4);
      samplePos.z += swayAmt * cos(samplePos.y * 1.8 + slowTime * 0.3) * 0.5;

      // Drift
      samplePos.x += slowTime * driftSpeed * 6.0;
      samplePos.z += slowTime * driftSpeed * 3.0;

      // Curtain density
      vec3 curtainPos = vec3(samplePos.x * 0.3, samplePos.y * 2.5, samplePos.z * 0.4);
      float density = as2AuroraCurtainFBM(curtainPos, flux, onset * 0.8 + tension * 0.2);

      // Fine detail overlay
      float fineDetail = as2AuroraCurtainFBM(curtainPos * 2.5 + vec3(20.0, 0.0, 10.0), flux * 0.5, 0.0);
      density += fineDetail * 0.3;

      // Azimuthal variation: aurora wraps around the dome
      float azimuth = atan(samplePos.z, samplePos.x);
      float azVar = sin(azimuth * 2.0 + slowTime * driftSpeed * 4.0) * 0.3 + 0.7;
      density *= azVar;

      density = smoothstep(-0.15, 0.35, density);

      // Vertical falloff
      float bandFade = smoothstep(curtainBase, curtainBase + 0.08, sampleElev)
                     * smoothstep(curtainTop, curtainTop - 0.1, sampleElev);
      density *= bandFade;

      if (density > 0.01) {
        // Color: green at base → purple mid → pink upper → blue zenith
        float heightMix = smoothstep(curtainBase, curtainTop, sampleElev);
        vec3 curtainCol = mix(auroraGreen, auroraPurple, smoothstep(0.0, 0.35, heightMix));
        curtainCol = mix(curtainCol, auroraPink, smoothstep(0.35, 0.65, heightMix));
        curtainCol = mix(curtainCol, auroraBlue, smoothstep(0.65, 1.0, heightMix));

        // Luminosity shimmer
        float lumNoise = snoise(vec3(samplePos.x * 2.0, samplePos.y * 4.0, slowTime * 0.4));
        density *= 0.55 + 0.45 * lumNoise;

        // Brightness: massive dynamic range
        float brightness = mix(0.15, 0.90, energy);
        brightness += effectiveBeat * 0.25;
        brightness += onset * 0.3;
        brightness += climaxBoost * 0.4;
        brightness += sChorus * 0.15;
        brightness *= mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);
        brightness *= mix(1.0, 1.6, sSolo);

        float alpha = density * stepSize * 3.5;
        alpha = min(alpha, 1.0);
        float weight = alpha * (1.0 - auroraAcc.a);

        auroraAcc.rgb += curtainCol * brightness * weight;
        auroraAcc.a += weight;
      }
    }

    float auroraIntensity = auroraAcc.a;
    col += auroraAcc.rgb;

    // Dim stars behind bright aurora
    col -= vec3(0.3, 0.35, 0.4) * auroraIntensity * 0.3;
    col = max(col, vec3(0.0));

    // Zenith corona: vocal-driven bright spot at zenith
    {
      float zenithDist = 1.0 - skyElevation;
      float corona = smoothstep(0.5, 0.0, zenithDist) * vocalE * 0.4;
      corona += smoothstep(0.3, 0.0, zenithDist) * auroraIntensity * 0.15;
      col += mix(auroraGreen, auroraPurple, 0.5) * corona;
    }

    // Atmospheric glow beneath aurora
    float glowY = smoothstep(0.3, 0.0, skyElevation);
    float glowStrength = auroraIntensity * (0.06 + energy * 0.12);
    vec3 glowColor = mix(auroraGreen, vec3(0.08, 0.15, 0.1), 0.6);
    col += glowColor * glowY * glowStrength;
  }

  // ═══ Meteor streaks (onset-triggered) ═══
  {
    if (onset > 0.3) {
      float meteorSeed = floor(uTime * 2.0);
      float mh1 = fract(sin(meteorSeed * 127.1) * 43758.5);
      float mh2 = fract(sin(meteorSeed * 311.7) * 43758.5);
      vec2 meteorStart = vec2(mh1 - 0.5, 0.2 + mh2 * 0.3) * aspect;
      vec2 meteorEnd = meteorStart + vec2(0.15 + mh1 * 0.1, -0.08 - mh2 * 0.05);
      float meteorProgress = fract(uTime * 3.0);
      float meteor = as2MeteorStreak(screenPos, meteorStart, meteorEnd, 0.003, meteorProgress);
      vec3 meteorColor = vec3(1.0, 0.95, 0.85);
      col += meteorColor * meteor * (onset - 0.3) * 3.0;
    }

    // Occasional random meteor
    float randomMeteorSeed = floor(uDynamicTime * 0.3);
    float rmh = fract(sin(randomMeteorSeed * 543.3) * 43758.5);
    if (rmh > 0.85) {
      float rmh2 = fract(sin(randomMeteorSeed * 711.1) * 43758.5);
      vec2 rmStart = vec2(rmh * 1.2 - 0.6, 0.15 + rmh2 * 0.25) * aspect;
      vec2 rmEnd = rmStart + vec2(0.12, -0.06);
      float rmProgress = fract(uDynamicTime * 0.3 * 4.0);
      float rmMeteor = as2MeteorStreak(screenPos, rmStart, rmEnd, 0.002, rmProgress);
      col += vec3(0.8, 0.85, 1.0) * rmMeteor * 0.5;
    }
  }

  // ═══ Terrain silhouette: bottom edge ═══
  {
    float terrainY = as2TerrainSilhouette(screenPos.x);
    float terrainMask = smoothstep(terrainY + 0.003, terrainY - 0.003, screenPos.y + 0.5);
    vec3 terrainCol = vec3(0.006, 0.008, 0.012);
    // Faint aurora reflection on terrain
    float auroraReflect = 0.0;
    for (int li = 0; li < 3; li++) {
      float fli = float(li);
      auroraReflect += smoothstep(terrainY - 0.01, terrainY, screenPos.y + 0.5)
                     * max(0.0, 0.03 - fli * 0.01);
    }
    terrainCol += auroraGreen * auroraReflect * energy;
    col = mix(col, terrainCol, terrainMask);
  }

  // Beat pulse
  col *= 1.0 + effectiveBeat * 0.1;
  col *= 1.0 + climaxBoost * 0.3;

  // Vignette
  float vigScale = mix(0.25, 0.20, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.005, 0.015), col, vignette);

  // Darkness texture for quiet passages
  col += darknessTexture(fragUv, uTime, energy);

  // Icon emergence
  {
    float nf = as2AuroraCurtainFBM(vec3(screenPos * 2.0, slowTime), 0.5, 0.0);
    col += iconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
