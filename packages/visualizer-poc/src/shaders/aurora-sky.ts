/**
 * Aurora Sky — realistic aurora borealis curtains across a vast night sky.
 * Vertically-stretched FBM curtains with horizontal sine wave deformation.
 * Star field behind, mountain/treeline silhouette at bottom 15%.
 * Vast, spiritual, transcendent — designed for peak emotional moments.
 *
 * Audio reactivity:
 *   uEnergy       -> curtain speed, brightness, dynamic range
 *   uBeat         -> brightness pulse through curtains
 *   uChromaHue    -> shifts curtain color bands (green/purple/pink)
 *   uSpectralFlux -> curtain complexity (FBM octaves)
 *   uMelodicPitch -> curtain height shift
 *   uBass         -> low-frequency curtain sway
 *   uHighs        -> fine curtain detail, star twinkle
 *   uOnsetSnap    -> brief flash through aurora
 *   uSlowEnergy   -> overall drift speed
 *   uSectionType  -> jam=rapid dance, space=slow gentle, solo=focused beam
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

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

${buildPostProcessGLSL({ grainStrength: 'light', bloomEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Starfield: procedural stars with magnitude variation ---
float stars(vec2 uv, float density, float seed) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  float h = fract(sin(dot(cell + seed, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell + seed, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.72, h);
  float brightness = h2 * 0.6 + 0.4;
  return hasStar * brightness * smoothstep(0.025, 0.003, dist);
}

// --- Mountain/treeline silhouette ---
float mountainSilhouette(float x, float time) {
  // Layered noise for organic mountain profile
  float m = 0.0;
  m += snoise(vec3(x * 1.5, 0.0, 0.0)) * 0.06;
  m += snoise(vec3(x * 3.0, 1.0, 0.0)) * 0.03;
  m += snoise(vec3(x * 8.0, 2.0, 0.0)) * 0.012;
  // Base height at bottom 15%
  m += 0.10;
  // Tree-like spikes on ridgeline
  float treeNoise = snoise(vec3(x * 25.0, 3.0, 0.0));
  m += max(0.0, treeNoise) * 0.015;
  return m;
}

// --- Aurora curtain FBM: vertically-stretched with horizontal sine deformation ---
mat2 auroraRot = mat2(0.80, 0.60, -0.60, 0.80);

float auroraCurtainFBM(vec3 p, float complexity, float turbulence) {
  int octaves = 3 + int(complexity * 4.0);
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 7; i++) {
    if (i >= octaves) break;
    val += amp * snoise(p * freq);
    p.xz = auroraRot * p.xz;
    p.y *= 1.15;
    p.x += turbulence * 0.15 * float(i);
    freq *= 2.2;
    amp *= 0.48;
  }
  return val;
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
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // --- Timing ---
  float slowTime = uDynamicTime * 0.06;
  float driftSpeed = (0.04 + slowE * 0.03) * mix(1.0, 2.0, sJam) * mix(1.0, 0.3, sSpace);

  // === SKY GRADIENT: deep night sky ===
  vec3 skyColor = mix(
    vec3(0.01, 0.01, 0.04),
    vec3(0.03, 0.04, 0.10),
    smoothstep(0.5, -0.3, p.y)
  );
  // Subtle horizon glow
  skyColor += vec3(0.02, 0.015, 0.03) * smoothstep(0.1, -0.05, p.y);
  vec3 col = skyColor;

  // === STAR FIELD: multiple layers for depth ===
  float starLayer1 = stars(uv + slowTime * 0.008, 90.0, 0.0);
  float starLayer2 = stars(uv + slowTime * 0.004 + 10.0, 140.0, 42.0) * 0.5;
  float starLayer3 = stars(uv + slowTime * 0.002 + 25.0, 200.0, 91.0) * 0.3;
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.5 + uv.x * 60.0 + uv.y * 40.0);
  float twinkle2 = 0.8 + 0.2 * cos(uTime * 1.8 + uv.x * 35.0);
  vec3 starColor = vec3(0.85, 0.9, 1.0) * (starLayer1 * twinkle + starLayer2 * twinkle2 + starLayer3);
  col += starColor * 0.5;

  // === AURORA COLORS: classic green/purple/pink with chroma shift ===
  float hueBase = chromaH * 0.15;
  vec3 auroraGreen = hsv2rgb(vec3(0.33 + hueBase, 0.85 * uPaletteSaturation, 1.0));
  vec3 auroraPurple = hsv2rgb(vec3(0.78 + hueBase * 0.5, 0.75 * uPaletteSaturation, 0.9));
  vec3 auroraPink = hsv2rgb(vec3(0.92 + hueBase * 0.3, 0.65 * uPaletteSaturation, 0.85));

  // Blend in palette colors subtly
  auroraGreen = mix(auroraGreen, hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0)), 0.2);
  auroraPurple = mix(auroraPurple, hsv2rgb(vec3(uPaletteSecondary, 0.7, 0.9)), 0.2);

  // === CURTAIN RAYMARCHING ===
  float climaxBoost = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * uClimaxIntensity;

  // Curtain vertical band: melodicPitch lifts curtains higher
  float curtainBase = mix(0.08, 0.35, energy) + melodicP * 0.15;
  float curtainTop = mix(0.35, 0.85, energy) + melodicP * 0.1;

  // Solo: focused narrow beam
  float soloNarrow = sSolo * 0.4;
  float curtainCenterX = sSolo * 0.0; // center for solo beam
  float curtainWidthMod = 1.0 - soloNarrow;

  // Accumulate aurora light
  vec4 auroraAcc = vec4(0.0);
  int maxSteps = 20 + int(energy * 12.0) + int(sJam * 8.0);
  float stepSize = mix(0.12, 0.08, energy);

  for (int i = 0; i < 40; i++) {
    if (i >= maxSteps) break;
    if (auroraAcc.a > 0.95) break;

    float t = float(i) * stepSize + 0.3;
    vec3 pos = vec3(p.x, 0.5 + p.y * 0.7, -1.0) * t;

    // Vertical band constraint
    float curtainY = pos.y / max(t, 0.01);
    if (curtainY < curtainBase || curtainY > curtainTop) continue;

    // Horizontal sine wave deformation (the classic curtain shape)
    float sineDeform = sin(pos.y * 3.0 + slowTime * driftSpeed * 8.0) * 0.3;
    sineDeform += sin(pos.y * 7.0 + slowTime * driftSpeed * 12.0) * 0.1;
    pos.x += sineDeform * curtainWidthMod;

    // Bass sway
    float swayAmt = bass * 0.3 * mix(1.0, 0.5, clamp(uBeatStability, 0.0, 1.0));
    pos.x += swayAmt * sin(pos.y * 2.5 + slowTime * 0.4);

    // Drift
    pos.x += slowTime * driftSpeed * 6.0;
    pos.z += slowTime * driftSpeed * 3.0;

    // Curtain density from FBM
    // Vertically stretch: multiply y to create vertical curtain structure
    vec3 curtainPos = vec3(pos.x * 0.4, pos.y * 2.5, pos.z * 0.5);
    float density = auroraCurtainFBM(curtainPos, flux, onset * 1.0 + uHarmonicTension * 0.2);

    density = smoothstep(-0.15, 0.35, density);

    // Vertical falloff
    float bandFade = smoothstep(curtainBase, curtainBase + 0.08, curtainY)
                   * smoothstep(curtainTop, curtainTop - 0.1, curtainY);
    density *= bandFade;

    if (density > 0.01) {
      // Color varies with height: green at base, purple in middle, pink at top
      float heightMix = smoothstep(curtainBase, curtainTop, curtainY);
      vec3 curtainCol = mix(auroraGreen, auroraPurple, smoothstep(0.0, 0.5, heightMix));
      curtainCol = mix(curtainCol, auroraPink, smoothstep(0.5, 1.0, heightMix));

      // Luminosity shimmer
      float lumNoise = snoise(vec3(pos.x * 2.0, pos.y * 4.0, slowTime * 0.4));
      density *= 0.55 + 0.45 * lumNoise;

      // Curtain brightness: MASSIVE dynamic range
      float brightness = mix(0.15, 0.90, energy);
      brightness += uBeat * 0.3;
      brightness += onset * 0.4;
      brightness += climaxBoost * 0.3;
      brightness += sChorus * 0.15;
      brightness *= mix(1.0, 1.5, sJam);
      brightness *= mix(1.0, 0.3, sSpace);
      // Solo: concentrated brightness
      brightness *= mix(1.0, 1.8, sSolo);

      // Alpha compositing
      float alpha = density * stepSize * 3.5;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - auroraAcc.a);

      auroraAcc.rgb += curtainCol * brightness * weight;
      auroraAcc.a += weight;
    }
  }

  float auroraIntensity = auroraAcc.a;
  col += auroraAcc.rgb;

  // === HERO ICON EMERGENCE ===
  {
    float nf = auroraCurtainFBM(vec3(p * 2.0, slowTime), 0.5, 0.0);
    vec3 heroLight = heroIconEmergence(p, uTime, energy, bass, auroraGreen, auroraPurple, nf, uSectionIndex);
    col += heroLight;
  }

  // === ATMOSPHERIC GLOW beneath aurora ===
  float glowY = smoothstep(0.25, -0.15, p.y);
  float glowStrength = auroraIntensity * (0.06 + energy * 0.14);
  vec3 glowColor = mix(auroraGreen, vec3(0.08, 0.15, 0.1), 0.6);
  col += glowColor * glowY * glowStrength;

  // === DIM STARS behind bright aurora ===
  col -= starColor * 0.5 * auroraIntensity;

  // === MOUNTAIN SILHOUETTE: bottom 15% ===
  float mountainY = mountainSilhouette(p.x, uTime);
  float mountainMask = smoothstep(mountainY + 0.003, mountainY - 0.003, p.y + 0.5);
  // Mountain color: very dark with subtle aurora reflection
  vec3 mountainCol = vec3(0.008, 0.01, 0.015);
  // Faint aurora glow on mountain tops
  mountainCol += auroraGreen * auroraIntensity * 0.03 * smoothstep(mountainY - 0.02, mountainY, p.y + 0.5);
  col = mix(col, mountainCol, mountainMask);

  // === VIGNETTE ===
  float vigScale = mix(0.25, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.01, 0.03), col, vignette);

  // === DARKNESS TEXTURE: prevent dead black in quiet passages ===
  col += darknessTexture(uv, uTime, energy);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
