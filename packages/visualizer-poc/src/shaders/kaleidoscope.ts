/**
 * Kaleidoscope Tunnel — raymarched kaleidoscope interior.
 * Camera looks DOWN through a real kaleidoscope tube. Angled mirrors
 * create infinite reflections of colorful SDF gem objects (spheres,
 * octahedra, faceted beads) at the far end. The angular mirror-folding
 * of the ray direction produces classic kaleidoscope symmetry in full
 * 3D depth with proper lighting, refraction highlights, and AO.
 *
 * Audio reactivity:
 *   uBass            → gem size pulse
 *   uEnergy          → gem count, color saturation
 *   uDrumOnset       → kaleidoscope rotation snap
 *   uVocalPresence   → backlight through gems
 *   uHarmonicTension → mirror angle (symmetry order)
 *   uSectionType     → jam=rapid rotation, space=still/symmetric, chorus=max gems
 *   uClimaxPhase     → mirrors shatter revealing infinite depth
 *   uSlowEnergy      → drift speed
 *   uMelodicPitch    → gem color hue offset
 *   uBeatSnap        → flash on facets
 *   uHighs           → specular sharpness
 *   uSpectralFlux    → gem wobble
 *   uPalettePrimary  → primary gem palette
 *   uPaletteSecondary→ secondary gem palette
 *   uChromaHue       → hue modulation
 *   uTimbralBrightness → rim light intensity
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const kaleidoscopeVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const kaleidoscopeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "normal", bloomEnabled: true, halationEnabled: true, paletteCycleEnabled: true, temporalBlendEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 30.0
#define SURF_DIST 0.002

// ─── SDF Primitives ───

float ksSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float ksOctahedron(vec3 pos, float sz) {
  pos = abs(pos);
  return (pos.x + pos.y + pos.z - sz) * 0.57735027;
}

float ksGem(vec3 pos, float sz) {
  // Faceted gem: intersection of octahedron and sphere for cut look
  float octa = ksOctahedron(pos, sz * 1.2);
  float sph = ksSphere(pos, sz);
  return max(octa, sph);
}

float ksTorus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

float ksDodecahedron(vec3 pos, float sz) {
  // Approximate dodecahedron via clipping planes
  float phi = 1.618033988;
  float d = 0.0;
  d = max(d, abs(dot(pos, normalize(vec3(0.0, 1.0, phi)))) - sz);
  d = max(d, abs(dot(pos, normalize(vec3(0.0, 1.0, -phi)))) - sz);
  d = max(d, abs(dot(pos, normalize(vec3(1.0, phi, 0.0)))) - sz);
  d = max(d, abs(dot(pos, normalize(vec3(1.0, -phi, 0.0)))) - sz);
  d = max(d, abs(dot(pos, normalize(vec3(phi, 0.0, 1.0)))) - sz);
  d = max(d, abs(dot(pos, normalize(vec3(-phi, 0.0, 1.0)))) - sz);
  return d;
}

// Smooth min for blending SDFs
float ksSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Mirror Folding ───
// Fold ray direction around N angular mirrors to create kaleidoscope symmetry
vec3 ksMirrorFold(vec3 rd, int numFolds, float rotOffset) {
  // Work in polar angle around Z axis
  float angle = atan(rd.y, rd.x) + rotOffset;

  float segAngle = TAU / float(numFolds);

  // Fold into first segment
  angle = mod(angle, segAngle);
  if (angle > segAngle * 0.5) {
    angle = segAngle - angle;
  }

  float len2d = length(rd.xy);
  return vec3(cos(angle) * len2d, sin(angle) * len2d, rd.z);
}

// ─── Scene SDF ───
// Returns vec2(distance, materialID) where materialID encodes gem type
vec2 ksMap(vec3 pos, float bassSize, float gemCount, float shatterAmt, float flowTime) {
  float dist = MAX_DIST;
  float matID = 0.0;

  // Tube walls — cylindrical enclosure
  float tubeRadius = 2.8 - shatterAmt * 0.8;
  float tube = -(length(pos.xy) - tubeRadius);
  dist = tube;
  matID = 1.0; // mirror wall

  // Gem cluster at the far end of the tunnel
  // Gems are arranged in a ring + center, repeated by mirror folding
  float gemBase = 0.18 + bassSize * 0.12;

  // Central gem — large sphere
  vec3 centerGemPos = pos - vec3(0.0, 0.0, 6.0 + sin(flowTime * 0.3) * 0.5);
  float centerGem = ksSphere(centerGemPos, gemBase * 1.5);
  if (centerGem < dist) { dist = centerGem; matID = 2.0; }

  // Ring of octahedral gems
  float ringCount = 4.0 + gemCount * 4.0;
  for (int idx = 0; idx < 12; idx++) {
    if (float(idx) >= ringCount) break;
    float fi = float(idx);
    float ringAngle = fi / ringCount * TAU + flowTime * 0.15;
    float ringR = 1.2 + sin(flowTime * 0.2 + fi) * 0.2;
    float ringZ = 5.5 + cos(fi * 2.3 + flowTime * 0.1) * 0.8;
    vec3 gemPos = pos - vec3(cos(ringAngle) * ringR, sin(ringAngle) * ringR, ringZ);
    float gemD = ksGem(gemPos, gemBase * (0.8 + sin(fi * 1.7) * 0.2));
    if (gemD < dist) { dist = gemD; matID = 3.0 + mod(fi, 4.0); }
  }

  // Scattered small faceted beads
  float beadCount = 3.0 + gemCount * 5.0;
  for (int idx = 0; idx < 10; idx++) {
    if (float(idx) >= beadCount) break;
    float fi = float(idx);
    float bAngle = fi * 2.399 + flowTime * 0.08; // golden angle scatter
    float bR = 0.6 + fi * 0.15;
    float bZ = 4.0 + fi * 0.5 + sin(fi * 3.1 + flowTime * 0.2) * 0.3;
    vec3 beadPos = pos - vec3(cos(bAngle) * bR, sin(bAngle) * bR, bZ);
    float beadD = ksDodecahedron(beadPos, gemBase * 0.5);
    if (beadD < dist) { dist = beadD; matID = 7.0 + mod(fi, 3.0); }
  }

  // Floating torus rings (chorus adds more)
  vec3 torusPos = pos - vec3(0.0, 0.0, 7.5);
  torusPos.xy *= mat2(cos(flowTime * 0.1), -sin(flowTime * 0.1),
                       sin(flowTime * 0.1), cos(flowTime * 0.1));
  float torusDist = ksTorus(torusPos, 0.8 + bassSize * 0.3, 0.06 + bassSize * 0.03);
  if (torusDist < dist) { dist = torusDist; matID = 10.0; }

  // Climax shatter: fragments of mirror floating in space
  if (shatterAmt > 0.01) {
    for (int idx = 0; idx < 6; idx++) {
      float fi = float(idx);
      float shardAngle = fi * 1.047 + flowTime * 0.3;
      float shardR = 2.0 + shatterAmt * fi * 0.3;
      float shardZ = 2.0 + fi * 1.5;
      vec3 shardPos = pos - vec3(cos(shardAngle) * shardR, sin(shardAngle) * shardR, shardZ);
      // Flat shard: squashed box
      vec3 absP = abs(shardPos);
      float shardD = max(max(absP.x - 0.4, absP.y - 0.3), absP.z - 0.02);
      shardD *= 0.8;
      if (shardD < dist) { dist = shardD; matID = 11.0; }
    }
  }

  return vec2(dist, matID);
}

// ─── Normal Calculation ───
vec3 ksNormal(vec3 pos, float bassSize, float gemCount, float shatterAmt, float flowTime) {
  vec2 offset = vec2(0.001, 0.0);
  float d = ksMap(pos, bassSize, gemCount, shatterAmt, flowTime).x;
  return normalize(vec3(
    ksMap(pos + offset.xyy, bassSize, gemCount, shatterAmt, flowTime).x - d,
    ksMap(pos + offset.yxy, bassSize, gemCount, shatterAmt, flowTime).x - d,
    ksMap(pos + offset.yyx, bassSize, gemCount, shatterAmt, flowTime).x - d
  ));
}

// ─── Soft Shadow (4-step) ───
float ksSoftShadow(vec3 orig, vec3 lightDir, float bassSize, float gemCount, float shatterAmt, float flowTime) {
  float shade = 1.0;
  float marchDist = 0.05;
  for (int idx = 0; idx < 4; idx++) {
    vec3 pos = orig + lightDir * marchDist;
    float d = ksMap(pos, bassSize, gemCount, shatterAmt, flowTime).x;
    shade = min(shade, 8.0 * d / marchDist);
    marchDist += clamp(d, 0.02, 0.5);
    if (shade < 0.01) break;
  }
  return clamp(shade, 0.0, 1.0);
}

// ─── Ambient Occlusion (5-step) ───
float ksOcclusion(vec3 pos, vec3 nor, float bassSize, float gemCount, float shatterAmt, float flowTime) {
  float occ = 0.0;
  float sca = 1.0;
  for (int idx = 0; idx < 5; idx++) {
    float h = 0.01 + 0.12 * float(idx);
    float d = ksMap(pos + nor * h, bassSize, gemCount, shatterAmt, flowTime).x;
    occ += (h - d) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

// ─── Gem Color from Material ID ───
vec3 ksGemColor(float matID, float hue1, float hue2, float chromaShift, float saturation) {
  float hueBase = matID < 5.0 ? hue1 : hue2;
  float hueOff = matID * 0.073 + chromaShift;
  float sat = mix(0.5, 0.95, saturation);
  float val = 0.8 + matID * 0.02;

  if (matID < 1.5) {
    // Mirror wall — highly reflective silver
    return vec3(0.7, 0.72, 0.75);
  }
  if (matID < 2.5) {
    // Center gem — primary palette, bright
    return hsv2rgb(vec3(fract(hue1 + chromaShift), sat, 0.95));
  }
  if (matID < 7.0) {
    // Ring gems — spread across hue range
    float spread = (matID - 3.0) / 4.0;
    return hsv2rgb(vec3(fract(mix(hue1, hue2, spread) + hueOff), sat, val));
  }
  if (matID < 10.0) {
    // Beads — secondary palette variants
    return hsv2rgb(vec3(fract(hue2 + hueOff * 0.5), sat * 0.8, 0.7));
  }
  if (matID < 10.5) {
    // Torus — metallic gold
    return vec3(0.85, 0.7, 0.3);
  }
  // Shatter fragments — mirror with color tint
  return vec3(0.6, 0.65, 0.7);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uv - 0.5) * aspect;

  // ─── Audio Inputs ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float spectralFlux = clamp(uSpectralFlux, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);

  // FFT bands for detail
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  float flowTime = uDynamicTime * 0.1;

  // ─── Section Type ───
  float sectionT = uSectionType;
  float jamFactor = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float spaceFactor = smoothstep(6.5, 7.5, sectionT);
  float chorusFactor = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float soloFactor = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Symmetry Order from Harmonic Tension ───
  // Low tension = high symmetry (8-fold), high tension = fractured (3-fold)
  float baseSymmetry = mix(8.0, 3.0, tension);
  baseSymmetry += chorusFactor * 2.0; // chorus: more folds
  baseSymmetry -= jamFactor * 1.0;    // jam: fewer folds, wilder
  baseSymmetry += spaceFactor * 2.0;  // space: very symmetric, calm
  int numFolds = int(clamp(baseSymmetry, 3.0, 12.0));

  // ─── Rotation ───
  // Drum onset snaps rotation; jam = rapid rotation; space = near-still
  float rotSpeed = 0.02 + slowE * 0.03;
  rotSpeed *= mix(1.0, 3.0, jamFactor);    // jam: rapid spin
  rotSpeed *= mix(1.0, 0.15, spaceFactor); // space: barely turning
  rotSpeed *= mix(1.0, 1.5, chorusFactor); // chorus: lively
  rotSpeed *= mix(1.0, 2.0, soloFactor);   // solo: energetic
  // Tempo derivative modulates rotation rate
  rotSpeed *= 1.0 + uTempoDerivative * 0.3;

  float rotAngle = flowTime * rotSpeed;
  // Drum onset snap: discrete rotation jump
  rotAngle += drumOnset * 0.5;

  // ─── Gem Parameters ───
  float gemSize = bass;
  float gemCount = energy;
  gemCount = mix(gemCount, 1.0, chorusFactor * 0.5); // chorus: maximum gems

  // ─── Climax Shatter ───
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float shatterAmt = isClimax * climaxIntensity;

  // ─── Palette ───
  float hue1 = uPalettePrimary + uChromaHue * 0.15 + melodicPitch * 0.1;
  float hue2 = uPaletteSecondary + uChromaHue * 0.08;
  float saturation = mix(0.3, 1.0, energy) * uPaletteSaturation;

  // ─── Camera: looking down the tube ───
  vec3 ro = vec3(0.0, 0.0, -1.0); // camera at tube entrance
  float fovScale = tan(radians(mix(50.0, 70.0, energy)) * 0.5);
  vec3 forward = vec3(0.0, 0.0, 1.0);
  vec3 camRight = vec3(1.0, 0.0, 0.0);
  vec3 camUp = vec3(0.0, 1.0, 0.0);

  // Slight camera sway from audio
  float swayX = sin(flowTime * 0.7) * 0.03 * (1.0 + spectralFlux * 0.5);
  float swayY = cos(flowTime * 0.5) * 0.02 * (1.0 + spectralFlux * 0.5);
  vec3 rd = normalize(forward + camRight * (screenPos.x * fovScale + swayX) + camUp * (screenPos.y * fovScale + swayY));

  // ─── Mirror Folding of Ray Direction ───
  // This is the core kaleidoscope effect: fold the ray into one angular segment
  rd = ksMirrorFold(rd, numFolds, rotAngle);

  // ─── Raymarching ───
  float totalDist = 0.0;
  float matID = 0.0;
  bool didMarch = false;

  for (int idx = 0; idx < MAX_STEPS; idx++) {
    vec3 pos = ro + rd * totalDist;
    vec2 mapResult = ksMap(pos, gemSize, gemCount, shatterAmt, flowTime);
    float dist = mapResult.x;
    matID = mapResult.y;

    if (abs(dist) < SURF_DIST) {
      didMarch = true;
      break;
    }
    totalDist += dist * 0.8; // slight understepping for safety
    if (totalDist > MAX_DIST) break;
  }

  // ─── Background: deep tunnel void ───
  vec3 col = vec3(0.0);
  {
    // Infinite depth look: radial gradient with gem glow
    float radDist = length(screenPos);
    float depthGlow = exp(-radDist * radDist * 3.0);
    vec3 voidColor = hsv2rgb(vec3(fract(hue1 + flowTime * 0.01), 0.3, 0.03));
    col = voidColor * (1.0 + depthGlow * 0.5);

    // Backlight from vocal presence
    float backlight = vocalPres * 0.15 * depthGlow;
    vec3 backlightColor = hsv2rgb(vec3(fract(hue2 + 0.1), 0.6, 1.0));
    col += backlightColor * backlight;

    // Shatter infinite depth: when mirrors break, reveal starfield
    if (shatterAmt > 0.01) {
      float stars = pow(snoise(vec3(screenPos * 40.0, flowTime * 0.01)), 16.0);
      col += vec3(stars * shatterAmt * 3.0);
      // Deep space color behind shattered mirrors
      vec3 spaceCol = hsv2rgb(vec3(fract(hue1 + screenPos.x * 0.1), 0.5, 0.08));
      col += spaceCol * shatterAmt * 0.5;
    }
  }

  if (didMarch) {
    vec3 marchPos = ro + rd * totalDist;
    vec3 nor = ksNormal(marchPos, gemSize, gemCount, shatterAmt, flowTime);

    // ─── Material Color ───
    vec3 matColor = ksGemColor(matID, hue1, hue2, uChromaHue * 0.2, saturation);

    // ─── Lighting ───
    // Key light: from behind camera, warm
    vec3 keyLightDir = normalize(vec3(0.3, 0.5, -0.8));
    float keyDiff = max(dot(nor, keyLightDir), 0.0);
    vec3 keyColor = vec3(1.0, 0.95, 0.9) * 0.7;

    // Backlight through gems (vocal presence driven)
    vec3 backLightDir = normalize(vec3(0.0, 0.0, 1.0));
    float backDiff = max(dot(nor, backLightDir), 0.0);
    float backIntensity = 0.2 + vocalPres * 0.6;
    vec3 backColor = hsv2rgb(vec3(fract(hue2 + 0.15), 0.7, 1.0)) * backIntensity;

    // Rim light from timbral brightness
    float rim = pow(1.0 - max(dot(nor, -rd), 0.0), 3.0);
    float rimIntensity = 0.15 + timbralBright * 0.4;
    vec3 rimColor = hsv2rgb(vec3(fract(hue1 + 0.3), 0.5, 1.0)) * rimIntensity;

    // Specular: highs control sharpness
    float specPow = mix(16.0, 128.0, highs);
    vec3 halfVec = normalize(keyLightDir - rd);
    float spec = pow(max(dot(nor, halfVec), 0.0), specPow);

    // Gem refraction highlight: iridescent internal reflection
    vec3 refractDir = refract(rd, nor, 0.67); // glass-like IOR
    float internalGlow = pow(max(dot(refractDir, backLightDir), 0.0), 4.0);
    vec3 refractionColor = hsv2rgb(vec3(fract(hue1 + dot(nor, vec3(0.3, 0.7, 0.1)) * 0.3), 0.9, 1.0));

    // Ambient occlusion
    float occVal = ksOcclusion(marchPos, nor, gemSize, gemCount, shatterAmt, flowTime);

    // Soft shadow from key light
    float shadowVal = ksSoftShadow(marchPos + nor * 0.01, keyLightDir, gemSize, gemCount, shatterAmt, flowTime);

    // ─── Compose Lighting ───
    vec3 litColor = vec3(0.0);

    // Mirror walls get high reflectivity
    if (matID < 1.5) {
      // Mirror: reflect the gem colors back
      vec3 reflDir = reflect(rd, nor);
      float mirrorSpec = pow(max(dot(reflDir, keyLightDir), 0.0), 64.0);
      litColor = matColor * 0.3 + vec3(mirrorSpec * 0.8);
      // Add colored reflection from nearby gems
      float gemReflect = fbm3(vec3(marchPos.xy * 2.0, flowTime * 0.2));
      vec3 reflGemCol = hsv2rgb(vec3(fract(hue1 + gemReflect * 0.3), saturation, 0.6));
      litColor += reflGemCol * 0.3 * energy;
    } else {
      // Gem lighting
      litColor += matColor * keyDiff * keyColor * shadowVal;
      litColor += matColor * backDiff * backColor;
      litColor += rimColor * rim;
      litColor += spec * vec3(1.0, 0.98, 0.95) * 0.6;
      litColor += refractionColor * internalGlow * 0.35 * (matID < 7.0 ? 1.0 : 0.5);
      litColor *= occVal;

      // Beat flash on facets
      float beatFlash = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
      litColor += matColor * beatFlash * 0.3;

      // Spectral flux wobble: subtle normal perturbation already baked into gem positions
      // Add color shimmer
      litColor += matColor * spectralFlux * 0.08 * sin(flowTime * 5.0 + matID);
    }

    // Depth fog: attenuate distant objects
    float fogFactor = 1.0 - exp(-totalDist * totalDist * 0.008);
    vec3 fogColor = hsv2rgb(vec3(fract(hue1), 0.2, 0.04));
    litColor = mix(litColor, fogColor, fogFactor * 0.6);

    col = litColor;
  }

  // ─── Peak Approaching Glow ───
  float peakApproach = clamp(uPeakApproaching, 0.0, 1.0);
  col *= 1.0 + peakApproach * 0.15;

  // ─── Climax Boost ───
  if (shatterAmt > 0.01) {
    // Shatter: add prismatic dispersion
    float dispersion = shatterAmt * 0.3;
    col.r *= 1.0 + dispersion * 0.5;
    col.b *= 1.0 + dispersion * 0.3;
    col *= 1.0 + shatterAmt * 0.4;
  }

  // ─── Semantic: psychedelic boost ───
  float psychBoost = uSemanticPsychedelic * 0.4;
  col = mix(col, col * vec3(1.0 + psychBoost * 0.2, 1.0, 1.0 + psychBoost * 0.15), psychBoost);

  // ─── Cosmic: adds deep blue tint ───
  float cosmicBoost = uSemanticCosmic * 0.15;
  col += vec3(0.0, 0.02, 0.06) * cosmicBoost * (1.0 + energy * 0.5);

  // ─── SDF Icon Emergence ───
  {
    float nf = fbm3(vec3(screenPos * 2.0, flowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, saturation, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, saturation, 1.0));
    col += iconEmergence(screenPos, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ─── Atmospheric Depth ───
  float fogNoise = fbm3(vec3(screenPos * 0.6, uDynamicTime * 0.015));
  float fogDensity = mix(0.35, 0.05, energy);
  vec3 atmosphereFog = hsv2rgb(vec3(fract(hue1), 0.1, 0.04));
  col = mix(col, atmosphereFog, fogDensity * (0.4 + fogNoise * 0.4));

  // ─── Vignette ───
  float vigScale = mix(0.28, 0.18, energy);
  // Circular vignette for tunnel look
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(-0.05, 0.8, vignette);
  col = mix(vec3(0.01, 0.008, 0.02), col, vignette);

  // ─── Post-Processing ───
  col = applyPostProcess(col, uv, screenPos);

  // ─── Feedback Trails ───
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay = mix(0.92, 0.85, energy);
  float feedbackDecay = baseDecay + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase feedback
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
