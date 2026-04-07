/**
 * Tie-Dye Vortex — raymarched 3D fabric folds with subsurface dye bleed.
 * A massive tie-dye cloth ripples and undulates in 3D space. The fabric
 * has volumetric depth — folds, creases, and billowing waves. Dye colors
 * bleed through the folds with subsurface scattering. Spiral tie-dye
 * patterns live ON the 3D surface. Volumetric haze drifts behind.
 *
 * Audio: uBass → wave amplitude, uEnergy → fold complexity + saturation,
 * uDrumOnset → ripple shockwave, uVocalPresence → subsurface glow,
 * uHarmonicTension → fold tightness, uSectionType → jam/space/chorus modes,
 * uClimaxPhase → fabric tears open to reveal light behind.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const tieDyeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.05,
  caEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
});

export const tieDyeFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Section type extraction ───
float tdSectionJam(float st)    { return smoothstep(4.5, 5.5, st) * (1.0 - step(5.5, st)); }
float tdSectionSpace(float st)  { return smoothstep(6.5, 7.5, st); }
float tdSectionChorus(float st) { return smoothstep(1.5, 2.5, st) * (1.0 - step(2.5, st)); }
float tdSectionSolo(float st)   { return smoothstep(3.5, 4.5, st) * (1.0 - step(4.5, st)); }

// ─── Fabric displacement: undulating cloth surface ───
float tdFabricDisplace(vec3 pos, float bassAmp, float foldTight, float waveTime,
                       float sJam, float sSpace, float shockwave) {
  // Primary billowing waves
  float wave1 = sin(pos.x * 2.0 + waveTime * 0.8) * cos(pos.z * 1.5 + waveTime * 0.6);
  float wave2 = sin(pos.x * 3.5 - waveTime * 1.1 + pos.z * 2.0) * 0.5;
  float wave3 = cos(pos.z * 4.0 + waveTime * 0.9 + pos.x * 1.8) * 0.3;

  // Bass-driven amplitude (space = flat/still, jam = wild)
  float amp = (0.3 + bassAmp * 0.5) * mix(1.0, 1.8, sJam) * mix(1.0, 0.15, sSpace);

  // Fold creases — tighter with harmonic tension
  float foldFreq = 5.0 + foldTight * 8.0;
  float folds = sin(pos.x * foldFreq + fbm3(vec3(pos.xz * 2.0, waveTime * 0.3)) * 3.0) * 0.15;
  folds += sin(pos.z * foldFreq * 0.7 + pos.x * 2.0) * 0.1;
  folds *= (0.5 + foldTight * 0.5);

  // Noise-driven organic wrinkles
  float wrinkle = fbm3(vec3(pos.xz * 3.0 + waveTime * 0.15, waveTime * 0.08)) * 0.2;

  // Drum onset shockwave — radial ripple from center
  float radDist = length(pos.xz);
  float ripple = sin(radDist * 8.0 - shockwave * 15.0) * exp(-radDist * 0.5) * shockwave * 0.4;

  return (wave1 + wave2 + wave3) * amp + folds + wrinkle + ripple;
}

// ─── SDF: fabric surface (displaced plane at y=0) ───
float tdFabricSDF(vec3 pos, float bassAmp, float foldTight, float waveTime,
                  float sJam, float sSpace, float shockwave) {
  float disp = tdFabricDisplace(pos, bassAmp, foldTight, waveTime, sJam, sSpace, shockwave);
  return pos.y - disp;
}

// ─── Scene SDF with climax tear ───
float tdMap(vec3 pos, float bassAmp, float foldTight, float waveTime,
            float sJam, float sSpace, float shockwave, float climax) {
  float fabric = tdFabricSDF(pos, bassAmp, foldTight, waveTime, sJam, sSpace, shockwave);

  // Climax: fabric tears open — carve holes that reveal the void behind
  if (climax > 0.1) {
    float tearNoise = fbm3(vec3(pos.xz * 1.5, waveTime * 0.5));
    // Tears widen with climax intensity
    float tearThreshold = mix(0.6, -0.2, climax);
    float tearSDF = tearNoise - tearThreshold;
    // Smooth subtraction: remove fabric where tears happen
    fabric = max(fabric, -tearSDF * 0.3);
  }

  return fabric;
}

// ─── Tie-dye color pattern on the fabric surface ───
vec3 tdDyeColor(vec3 surfPos, float waveTime, float energy, float h1, float h2,
                float sChorus, float sJam, float chromaHue, float chordIdx) {
  vec2 sp = surfPos.xz;

  // Radial + angular coordinates for classic spiral tie-dye
  float radius = length(sp);
  float angle = atan(sp.y, sp.x);

  // Domain warp the pattern coordinates for organic dye flow
  float warp = fbm3(vec3(sp * 1.5, waveTime * 0.1));
  float warp2 = fbm3(vec3(sp * 2.0 + 50.0, waveTime * 0.08));

  // Spiral arms — harmonic tension drives arm count
  float armCount = 3.0 + energy * 2.0;
  float spiral = angle / TAU + radius * armCount + warp * 1.2 + waveTime * 0.05;
  float bands = sin(spiral * TAU * 3.0 + warp2 * TAU) * 0.5 + 0.5;

  // Concentric ring pattern (from rubber bands)
  float rings = sin(radius * 10.0 - waveTime * 0.3 + warp * 4.0) * 0.5 + 0.5;

  // Blend spiral + rings
  float pattern = mix(bands, rings, 0.35);

  // Palette: interpolate between primary and secondary hues via pattern
  float hueRange = mod(h2 - h1 + 0.5, 1.0) - 0.5;
  float dyeHue = h1 + pattern * hueRange + warp * 0.08;

  // Chroma + chord modulation
  float chordShift = floor(chordIdx) / 24.0 * 0.12;
  dyeHue = mix(dyeHue, chromaHue, 0.12) + chordShift;

  // Saturation: chorus = full vivid, quiet = muted
  float sat = 0.5 + energy * 0.35 + sChorus * 0.15;
  sat *= uPaletteSaturation;

  // Value: pattern-driven brightness variation
  float val = 0.4 + pattern * 0.3 + energy * 0.2;

  vec3 col = hsv2rgb(vec3(fract(dyeHue), clamp(sat, 0.0, 1.0), clamp(val, 0.0, 1.0)));

  // Fold-line darkening: where fabric was tied, dye concentrates
  float foldCount = 6.0 + energy * 3.0;
  float foldAngle = mod(angle * foldCount / TAU, 1.0);
  float foldSDF = abs(foldAngle - 0.5) * 2.0;
  float bleedWidth = 0.06 + energy * 0.12;
  float foldDarken = smoothstep(bleedWidth, bleedWidth * 0.3, foldSDF) * 0.2;
  col *= 1.0 - foldDarken;

  return col;
}

// ─── Subsurface scattering approximation ───
vec3 tdSubsurface(vec3 norm, vec3 lightDir, vec3 viewDir, vec3 dyeCol, float thickness,
                  float vocalGlow) {
  // Wrap diffuse for translucent cloth
  float ndl = dot(norm, lightDir);
  float sss = max(0.0, dot(viewDir, -(lightDir + norm * 0.4))) ;
  sss = pow(sss, 3.0) * thickness;

  // Vocal presence drives subsurface glow intensity
  float sssStrength = 0.15 + vocalGlow * 0.35;

  // Dye color bleeds through — warmer, more saturated on back-lit areas
  vec3 bleedCol = dyeCol * vec3(1.2, 0.9, 0.7); // warm shift
  return bleedCol * sss * sssStrength;
}

// ─── Ambient occlusion (3-tap) ───
float tdAmbientOcclusion(vec3 pos, vec3 norm, float bassAmp, float foldTight,
                         float waveTime, float sJam, float sSpace, float shockwave, float climax) {
  float occl = 1.0;
  for (int j = 1; j <= 3; j++) {
    float dist = 0.12 * float(j);
    float sampled = tdMap(pos + norm * dist, bassAmp, foldTight, waveTime, sJam, sSpace, shockwave, climax);
    occl -= (dist - sampled) * (0.35 / float(j));
  }
  return clamp(occl, 0.15, 1.0);
}

// ─── Volumetric haze behind the fabric ───
vec3 tdVolumetricHaze(vec3 ro, vec3 rd, float maxDist, float waveTime,
                      vec3 hazeCol, float energy, float vocalP) {
  vec3 accum = vec3(0.0);
  float stepSize = maxDist / 8.0;
  for (int i = 0; i < 8; i++) {
    float dist = stepSize * (float(i) + 0.5);
    if (dist > maxDist) break;
    vec3 samplePos = ro + rd * dist;
    // Haze density from noise — denser behind fabric
    float density = fbm3(vec3(samplePos.xz * 0.5, waveTime * 0.05 + samplePos.y * 0.3));
    density = max(0.0, density * 0.5 + 0.1);
    density *= smoothstep(0.0, -1.5, samplePos.y); // denser below fabric
    // Vocal presence adds ethereal glow
    float glow = (0.3 + vocalP * 0.5) * density;
    accum += hazeCol * glow * stepSize * exp(-dist * 0.15);
  }
  return accum * (0.2 + energy * 0.3);
}

void main() {
  vec2 uvCoord = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 pScreen = (uvCoord - 0.5) * asp;

  // ─── Audio clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float harmTens = clamp(uHarmonicTension, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float tBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float tender = clamp(uSemanticTender, 0.0, 1.0);

  // ─── Section types ───
  float sJam = tdSectionJam(uSectionType);
  float sSpace = tdSectionSpace(uSectionType);
  float sChorus = tdSectionChorus(uSectionType);
  float sSolo = tdSectionSolo(uSectionType);

  // ─── Climax ───
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Fabric time (section-modulated) ───
  float waveTime = uDynamicTime * (0.08 + slowE * 0.05) *
    mix(1.0, 1.6, sJam) * mix(1.0, 0.2, sSpace) * mix(1.0, 1.2, sChorus);

  // ─── Palette ───
  float h1 = uPalettePrimary;
  float h2 = uPaletteSecondary;
  vec3 palWarm = paletteHueColor(h1, 0.85, 0.95);
  vec3 palCool = paletteHueColor(h2, 0.85, 0.95);
  // Haze color: blend palette with warm bias
  vec3 hazeCol = mix(palWarm, palCool, 0.3) * vec3(0.8, 0.7, 1.0);

  // ─── Camera ───
  // Looking down at fabric from above-front, gentle orbit
  float camOrbitSpeed = 0.03 * mix(1.0, 0.4, sSpace) * mix(1.0, 1.3, sJam);
  float camOrbit = waveTime * camOrbitSpeed;
  float camHeight = 2.8 + sin(waveTime * 0.02) * 0.3 - energy * 0.4;
  // Solo: camera pulls closer; climax: pulls back for drama
  camHeight = mix(camHeight, camHeight - 0.8, sSolo);
  camHeight = mix(camHeight, camHeight + 1.2, climB);

  vec3 ro = vec3(
    sin(camOrbit) * 2.5 + sin(waveTime * 0.05) * 0.3,
    camHeight,
    cos(camOrbit) * 2.5 + cos(waveTime * 0.04) * 0.2
  );
  vec3 lookAt = vec3(sin(waveTime * 0.015) * 0.5, 0.0, cos(waveTime * 0.012) * 0.3);
  vec3 fwd = normalize(lookAt - ro);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRight = normalize(cross(worldUp, fwd));
  vec3 camUp = cross(fwd, camRight);
  float fov = 0.9 + energy * 0.1 + climB * 0.2;
  vec3 rd = normalize(pScreen.x * camRight + pScreen.y * camUp + fov * fwd);

  // ─── Drum onset shockwave envelope ───
  float shockwave = drumOn * exp(-mod(uDynamicTime, 2.0) * 3.0);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 marchPos = ro;
  bool wasHit = false;
  int maxSteps = int(mix(60.0, 90.0, energy));

  for (int i = 0; i < 90; i++) {
    if (i >= maxSteps) break;
    vec3 samplePos = ro + rd * totalDist;
    float dist = tdMap(samplePos, bass, harmTens, waveTime, sJam, sSpace, shockwave, climB);

    if (dist < 0.002) {
      marchPos = samplePos;
      wasHit = true;
      break;
    }
    if (totalDist > 15.0) break;
    totalDist += dist * 0.65; // conservative step for folds
  }

  vec3 col = vec3(0.0);

  if (wasHit) {
    // ─── Normal via central differences ───
    vec2 eps = vec2(0.003, 0.0);
    float base = tdMap(marchPos, bass, harmTens, waveTime, sJam, sSpace, shockwave, climB);
    vec3 norm = normalize(vec3(
      tdMap(marchPos + eps.xyy, bass, harmTens, waveTime, sJam, sSpace, shockwave, climB) - base,
      tdMap(marchPos + eps.yxy, bass, harmTens, waveTime, sJam, sSpace, shockwave, climB) - base,
      tdMap(marchPos + eps.yyx, bass, harmTens, waveTime, sJam, sSpace, shockwave, climB) - base
    ));

    // ─── Tie-dye color on the surface ───
    vec3 dyeCol = tdDyeColor(marchPos, waveTime, energy, uPalettePrimary, uPaletteSecondary,
                              sChorus, sJam, uChromaHue, uChordIndex);

    // Psychedelic semantic boost: push saturation higher
    if (psyche > 0.1) {
      float dyeLuma = dot(dyeCol, vec3(0.299, 0.587, 0.114));
      dyeCol = mix(vec3(dyeLuma), dyeCol, 1.0 + psyche * 0.6);
    }

    // ─── Lighting ───
    // Key light: warm overhead, slightly behind camera
    vec3 lightDir1 = normalize(vec3(0.4, 0.9, 0.3));
    // Fill light: cool side
    vec3 lightDir2 = normalize(vec3(-0.6, 0.3, -0.5));
    // Back light for rim/silhouette
    vec3 lightDir3 = normalize(vec3(0.0, -0.5, -0.8));

    // Diffuse (half-Lambert for soft cloth look)
    float diff1 = dot(norm, lightDir1) * 0.5 + 0.5;
    diff1 = diff1 * diff1; // soften
    float diff2 = max(dot(norm, lightDir2), 0.0) * 0.3;

    // Specular: cloth sheen (low power, broad highlight)
    vec3 halfVec1 = normalize(lightDir1 - rd);
    float spec1 = pow(max(dot(norm, halfVec1), 0.0), 8.0 + highs * 16.0);
    // Sharper highlight for silk-like quality with timbral brightness
    float spec2 = pow(max(dot(norm, halfVec1), 0.0), 32.0 + tBright * 48.0) * tBright * 0.5;

    // Fresnel: fabric edge glow
    float ndv = max(dot(norm, -rd), 0.0);
    float fresnel = pow(1.0 - ndv, 3.0);

    // Ambient occlusion
    float fabricAO = tdAmbientOcclusion(marchPos, norm, bass, harmTens, waveTime,
                                         sJam, sSpace, shockwave, climB);

    // ─── Subsurface scattering ───
    // Fabric thickness estimate: thinner at folds (more SSS)
    float thickness = 1.0 - abs(tdFabricSDF(marchPos + norm * 0.1, bass, harmTens, waveTime,
                                             sJam, sSpace, shockwave)) * 2.0;
    thickness = clamp(thickness, 0.2, 1.0);
    vec3 sssCol = tdSubsurface(norm, lightDir1, -rd, dyeCol, thickness, vocalP);
    // Second light SSS contribution
    sssCol += tdSubsurface(norm, lightDir3, -rd, dyeCol, thickness, vocalP) * 0.4;

    // ─── Compose lighting ───
    vec3 ambient = dyeCol * 0.06;
    vec3 diffuse = dyeCol * (diff1 * 0.55 + diff2 * 0.15);
    vec3 specular = palWarm * spec1 * 0.12 + vec3(1.0, 0.95, 0.9) * spec2;
    vec3 rim = mix(palCool, palWarm, 0.5) * fresnel * 0.1;

    col = ambient + diffuse + specular + rim + sssCol;
    col *= fabricAO;

    // Energy-reactive brightness
    col *= 0.85 + energy * 0.35;

    // Dynamic range modulation: wider dynamic range = more contrast in lighting
    col *= 0.9 + dynRange * 0.2;

    // ─── Distance fog ───
    float fogFactor = 1.0 - exp(-totalDist * 0.08);
    vec3 fogCol = hazeCol * 0.05;
    col = mix(col, fogCol, fogFactor);

  } else {
    // ─── Missed fabric: background void with haze ───
    col = hazeCol * 0.015;

    // Climax: bright light behind the torn fabric
    if (climB > 0.05) {
      float tearGlow = exp(-length(pScreen) * 1.5) * climB;
      vec3 tearLight = mix(palWarm, vec3(1.0, 0.95, 0.85), 0.6);
      col += tearLight * tearGlow * 0.8;
      // Stars/particles in the tear light
      vec3 starCell = floor(rd * 25.0);
      float starHash = fract(sin(dot(starCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      float starMask = step(0.92, starHash) * smoothstep(0.05, 0.01, length(fract(rd * 25.0) - 0.5));
      col += mix(palCool, vec3(1.0), 0.5) * starMask * climB * 0.4;
    }
  }

  // ─── Volumetric haze (always, behind fabric) ───
  float hazeMaxDist = wasHit ? totalDist : 10.0;
  vec3 haze = tdVolumetricHaze(ro, rd, hazeMaxDist, waveTime, hazeCol, energy, vocalP);
  col += haze;

  // ─── Beat snap brightness kick ───
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  col *= 1.0 + effectiveBeat * 0.15;

  // ─── Onset flash — center glow ───
  float onsetFlash = max(uOnsetSnap, drumOn) * 0.6 * smoothstep(0.8, 0.0, length(pScreen));
  col += onsetFlash * mix(palWarm, vec3(1.0), 0.4);

  // ─── Tender semantic: soften and warm ───
  if (tender > 0.2) {
    float tLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(tLuma) * vec3(1.05, 1.0, 0.95), tender * 0.2);
  }

  // ─── Vignette (pre-postprocess) ───
  float vg = 1.0 - dot(pScreen * 0.3, pScreen * 0.3);
  col = mix(vec3(0.02, 0.015, 0.03), col, smoothstep(0.0, 1.0, vg));

  // ─── Lifted blacks ───
  col = max(col, vec3(0.03, 0.025, 0.04));

  // ─── Icon emergence ───
  float iconNoise = snoise(vec3(pScreen * 2.0, uTime * 0.1));
  col += iconEmergence(pScreen, uTime, energy, uBass, palWarm, palCool, iconNoise, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(pScreen, uTime, energy, uBass, palWarm, palCool, iconNoise, uSectionIndex);

  // ─── Post-processing chain ───
  col = applyPostProcess(col, uvCoord, pScreen);

  gl_FragColor = vec4(col, 1.0);
}
`;
