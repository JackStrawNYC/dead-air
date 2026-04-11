/**
 * Aurora Borealis — raymarched arctic landscape with volumetric aurora curtains.
 * Snow-covered mountains on the horizon, frozen lake reflecting the aurora,
 * snow particles drifting. Camera looks up at the dancing lights.
 *
 * Full raymarched 3D SDF scene: snow terrain, mountain silhouettes, frozen lake.
 * Multi-layer volumetric aurora curtains with FBM emission bands overhead.
 * Proper lighting: aurora illumination on snow, lake reflections, AO.
 *
 * Audio reactivity:
 *   uBass             → aurora wave amplitude, curtain sway
 *   uEnergy           → aurora brightness, emission band count
 *   uDrumOnset        → aurora flash pulse
 *   uVocalPresence    → warm green glow intensifies
 *   uHarmonicTension  → color shift (green → purple → red)
 *   uMelodicPitch     → aurora curtain height
 *   uSectionType      → jam=rapid curtain dance, space=still glow, chorus=full sky flood
 *   uClimaxPhase      → aurora eruption fills entire sky
 *   uSlowEnergy       → drift speed, ambient glow
 *   uChromaHue        → hue rotation on aurora palette
 *   uHighs            → fine ribbon detail, snow sparkle
 *   uOnsetSnap        → brief brightness pulse
 *   uFastBass         → curtain sway accent
 *   uBeatStability    → dampens curtain sway when tight groove
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const auroraVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  halationEnabled: true,
  caEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.05,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  lightLeakEnabled: false,
});

export const auroraFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI  3.14159265
#define TAU 6.28318530

// ─── Rotation matrix for FBM octave swirl ───
mat2 arRotOctave = mat2(0.80, 0.60, -0.60, 0.80);

// ─── Snow terrain height: layered ridged FBM for mountains + gentle rolling snow ───
float arTerrainHeight(vec2 pos) {
  // Rolling snow hills (low frequency)
  float snowHills = fbm3(vec3(pos * 0.15, 0.0)) * 0.4;

  // Mountain ridges (ridged multifractal for sharp peaks)
  float mtns = ridgedMultifractal(vec3(pos * 0.08, 1.0), 5, 2.2, 0.5) * 2.8;

  // Mountains only on the horizon band (fade near camera)
  float distFade = smoothstep(8.0, 20.0, length(pos));
  mtns *= distFade;

  return snowHills + mtns;
}

// ─── SDF: snow-covered terrain ───
float arSnowSDF(vec3 pos) {
  float terrainH = arTerrainHeight(pos.xz);
  return pos.y - terrainH;
}

// ─── SDF: frozen lake plane (flat, reflective, at y=0) ───
float arLakeSDF(vec3 pos) {
  return pos.y + 0.05; // slightly below terrain base
}

// ─── Scene SDF: union of terrain and lake ───
float arMapDist(vec3 pos) {
  float terrain = arSnowSDF(pos);
  float lake = arLakeSDF(pos);
  return min(terrain, lake);
}

// ─── Material ID: 0=sky, 1=snow/terrain, 2=lake ───
int arMapMaterial(vec3 pos) {
  float terrain = arSnowSDF(pos);
  float lake = arLakeSDF(pos);
  if (terrain < lake) return 1;
  return 2;
}

// ─── Normal estimation via central differences ───
vec3 arNormal(vec3 pos) {
  float eps = 0.02;
  float d = arMapDist(pos);
  return normalize(vec3(
    arMapDist(pos + vec3(eps, 0.0, 0.0)) - d,
    arMapDist(pos + vec3(0.0, eps, 0.0)) - d,
    arMapDist(pos + vec3(0.0, 0.0, eps)) - d
  ));
}

// ─── Ambient occlusion (5-step) ───
float arOcclusion(vec3 pos, vec3 nor) {
  float occ = 0.0;
  float scale = 1.0;
  for (int i = 0; i < 5; i++) {
    float dist = 0.05 + 0.15 * float(i);
    float d = arMapDist(pos + nor * dist);
    occ += (dist - d) * scale;
    scale *= 0.65;
  }
  return clamp(1.0 - 2.0 * occ, 0.0, 1.0);
}

// ─── Raymarching the terrain ───
float arMarch(vec3 ro, vec3 rd, out int matID) {
  float totalDist = 0.0;
  matID = 0;
  for (int i = 0; i < 80; i++) {
    vec3 pos = ro + rd * totalDist;
    float d = arMapDist(pos);
    if (d < 0.01) {
      matID = arMapMaterial(pos);
      return totalDist;
    }
    if (totalDist > 120.0) break;
    totalDist += d * 0.7; // conservative stepping for terrain
  }
  return -1.0;
}

// ─── Aurora FBM: multi-octave with per-octave rotation ───
float arAuroraFBM(vec3 pos, float turbulence, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    val += amp * snoise(pos * freq);
    pos.xz = arRotOctave * pos.xz;
    pos.y *= 1.1;
    pos.x += turbulence * 0.2 * float(i);
    freq *= 2.1;
    amp *= 0.5;
  }
  return val;
}

// ─── Volumetric aurora curtain layer ───
// Returns vec4(rgb emission, alpha density)
vec4 arAuroraLayer(vec3 rd, float layerOffset, float slowTime, float driftSpeed,
                   float bass, float energy, float onset, float turbulence,
                   float bandLow, float bandHigh, float swayDamp, int octaves,
                   vec3 color1, vec3 color2, float brightness) {
  vec4 acc = vec4(0.0);
  float stepSize = mix(0.18, 0.10, energy);
  int maxSteps = int(mix(18.0, 36.0, energy));

  for (int i = 0; i < 40; i++) {
    if (i >= maxSteps) break;
    if (acc.a > 0.95) break;

    float t = float(i) * stepSize + 0.5 + layerOffset;
    vec3 pos = rd * t;

    // Constrain to aurora band
    if (pos.y < bandLow || pos.y > bandHigh) continue;

    // Curtain sway from bass (dampened by beat stability)
    float swayAmt = (bass * 0.45 + uFastBass * 0.2) * swayDamp;
    pos.x += swayAmt * sin(pos.y * 2.0 + slowTime * 0.5 + layerOffset * 3.0);
    pos.z += swayAmt * 0.4 * cos(pos.y * 1.5 + slowTime * 0.3 + layerOffset * 5.0);

    // Drift
    pos.x += slowTime * driftSpeed * 10.0;
    pos.z += slowTime * driftSpeed * 5.0;

    // Density from FBM
    float density = arAuroraFBM(pos * 0.3 + layerOffset * 2.0, turbulence, octaves);
    density = smoothstep(-0.1, 0.4, density);

    // Vertical falloff
    float bandFade = smoothstep(bandLow, bandLow + 0.6, pos.y)
                   * smoothstep(bandHigh, bandHigh - 0.6, pos.y);
    density *= bandFade;

    if (density > 0.01) {
      float heightMix = smoothstep(bandLow, bandHigh, pos.y);
      vec3 col = mix(color1, color2, heightMix);

      // Shimmer luminosity variation
      float lumNoise = snoise(vec3(pos.x * 2.0, pos.y * 3.0, slowTime * 0.5 + layerOffset));
      density *= 0.6 + 0.4 * lumNoise;

      // Front-to-back compositing
      float alpha = density * stepSize * 3.0;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - acc.a);

      acc.rgb += col * brightness * weight;
      acc.a += weight;
    }
  }
  return acc;
}

// ─── Snow particle field ───
vec3 arSnowParticles(vec2 screenUV, float time) {
  vec3 snowCol = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float speed = 0.15 + fl * 0.08;
    float scale = 60.0 + fl * 40.0;
    float size = 0.012 - fl * 0.003;

    vec2 snowUV = screenUV * scale;
    snowUV.y += time * speed;
    snowUV.x += sin(time * 0.3 + fl) * 2.0; // wind drift

    vec2 cell = floor(snowUV);
    vec2 localUV = fract(snowUV);

    float h1 = fract(sin(dot(cell, vec2(127.1, 311.7)) + fl * 47.0) * 43758.5453);
    float h2 = fract(sin(dot(cell, vec2(269.5, 183.3)) + fl * 91.0) * 43758.5453);
    vec2 particlePos = vec2(h1, h2);
    float dist = length(localUV - particlePos);
    float brightness = smoothstep(size, size * 0.3, dist) * (0.3 + 0.7 * h1);

    snowCol += vec3(0.85, 0.90, 1.0) * brightness * (0.15 - fl * 0.03);
  }
  return snowCol;
}

// ─── Starfield ───
float arStars(vec2 pos, float density) {
  vec2 cell = floor(pos * density);
  vec2 localUV = fract(pos * density);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(localUV - starPos);
  float hasStar = step(0.72, h);
  float brightness = h2 * 0.5 + 0.5;
  return hasStar * brightness * smoothstep(0.025, 0.004, dist);
}


void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ─── Audio inputs ───
  float energy    = clamp(uEnergy, 0.0, 1.0);
  float bass      = clamp(uBass, 0.0, 1.0);
  float highs     = clamp(uHighs, 0.0, 1.0);
  float onset     = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE     = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH   = clamp(uChromaHue, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float harmTens  = clamp(uHarmonicTension, 0.0, 1.0);
  float melPitch  = clamp(uMelodicPitch, 0.0, 1.0);
  float dynRange  = clamp(uDynamicRange, 0.0, 1.0);
  float timbralBr = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScr  = clamp(uSpaceScore, 0.0, 1.0);
  float beatStab  = clamp(uBeatStability, 0.0, 1.0);

  // ─── Section type decomposition ───
  float sectionT = uSectionType;
  float sJam    = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace  = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo   = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax ───
  float climaxPhase = uClimaxPhase;
  float climaxI     = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax    = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // ─── Timing ───
  float slowTime   = uDynamicTime * 0.08;
  float driftSpeed = (0.03 + slowE * 0.02)
    * mix(1.0, 1.6, sJam)
    * mix(1.0, 0.3, sSpace)
    * mix(1.0, 1.2, sChorus)
    * (1.0 + uPeakApproaching * 0.3);

  // ─── Camera: low position looking up at aurora sky ───
  vec3 camPos = vec3(0.0, 1.5, 0.0);
  // Subtle camera sway from energy trend
  camPos.x += sin(uDynamicTime * 0.02) * 0.3;
  camPos.z += cos(uDynamicTime * 0.015) * 0.2;

  // Look upward (more so during climax)
  float lookUpAngle = mix(0.35, 0.65, energy) + climaxBoost * 0.25;
  vec3 lookDir = normalize(vec3(
    sin(uDynamicTime * 0.01) * 0.15,
    lookUpAngle,
    -1.0
  ));

  // Build camera basis
  vec3 camFwd = lookDir;
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRight = normalize(cross(camFwd, worldUp));
  vec3 camUp = cross(camRight, camFwd);
  float fovScale = tan(radians(mix(55.0, 70.0, energy)) * 0.5);
  vec3 rd = normalize(camFwd + camRight * screenP.x * fovScale + camUp * screenP.y * fovScale);
  vec3 ro = camPos;

  // ═══════════════════════════════════════════════════
  // SKY: dark arctic night with altitude gradient
  // ═══════════════════════════════════════════════════
  vec3 skyDark = vec3(0.01, 0.015, 0.04);
  vec3 skyHorizon = vec3(0.03, 0.04, 0.08);
  float skyGrad = smoothstep(-0.2, 0.8, rd.y);
  vec3 col = mix(skyHorizon, skyDark, skyGrad);

  // ─── Stars ───
  float starL1 = arStars(rd.xz / max(rd.y, 0.01) * 0.5, 90.0);
  float starL2 = arStars(rd.xz / max(rd.y, 0.01) * 0.5 + 10.0, 140.0) * 0.5;
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + rd.x * 50.0 + rd.z * 30.0);
  vec3 starCol = vec3(0.8, 0.85, 1.0) * (starL1 + starL2) * twinkle * 0.5;
  // Stars only in upper sky
  starCol *= smoothstep(0.0, 0.15, rd.y);
  col += starCol;

  // ═══════════════════════════════════════════════════
  // AURORA CURTAINS: multi-layer volumetric emission
  // ═══════════════════════════════════════════════════

  // Aurora palette: green → purple → red shifted by harmonic tension
  float hue1 = 0.33 + chromaH * 0.08 - harmTens * 0.15; // green baseline, tension shifts to purple
  float hue2 = 0.75 + chromaH * 0.06 + harmTens * 0.10; // purple baseline, tension shifts to red
  float saturation = mix(0.7, 1.0, slowE) * uPaletteSaturation;

  vec3 auroraColor1 = hsv2rgb(vec3(hue1, saturation, 1.0));
  vec3 auroraColor2 = hsv2rgb(vec3(hue2, saturation * 0.9, 0.85));

  // Vocal presence → warm green glow boost
  auroraColor1 = mix(auroraColor1, vec3(0.15, 1.0, 0.5), vocalPres * 0.25);

  // Palette tinting (blend in show palette)
  vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary, saturation, 1.0));
  vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary, saturation * 0.9, 0.85));
  auroraColor1 = mix(auroraColor1, palCol1, 0.2);
  auroraColor2 = mix(auroraColor2, palCol2, 0.15);

  // Aurora band parameters
  float pitchLift = (melPitch - 0.5) * 0.6;
  float vocalLift = (uVocalPitch - 0.5) * 0.25;
  float bandLow  = mix(2.0, 0.8, energy + climaxBoost * 0.5) - pitchLift + vocalLift;
  float bandHigh = mix(4.0, 7.0, energy + climaxBoost * 0.3) + pitchLift + vocalLift;

  // Chorus: full sky flood (lower band floor, raise ceiling)
  bandLow  -= sChorus * 1.2;
  bandHigh += sChorus * 2.0;

  // Climax eruption: aurora fills entire sky
  bandLow  -= climaxBoost * 1.5;
  bandHigh += climaxBoost * 3.0;

  // Space: constrained still glow
  bandLow  += sSpace * 0.8;
  bandHigh -= sSpace * 1.5;

  bandLow = max(bandLow, 0.3);

  // Curtain brightness
  float curtainBright = mix(0.25, 0.85, energy)
    + onset * 0.4
    + drumOnset * 0.5
    + sChorus * 0.2
    + climaxBoost * 0.35
    - sSpace * 0.15;
  float bpH = beatPulseHalf(uMusicalTime);
  curtainBright += bpH * 0.15 + max(uBeatSnap, uDrumBeat) * 0.2;
  curtainBright = clamp(curtainBright, 0.1, 1.5);

  // Turbulence from onset + harmonic tension
  float turbulence = max(onset, drumOnset) * 1.2 + harmTens * 0.3;

  // Sway dampening (tight groove = steady curtains)
  float swayDamp = mix(1.0, 0.35, beatStab);
  // Jam: faster sway
  swayDamp *= mix(1.0, 1.6, sJam);

  // FBM octave count: more octaves for richer detail at higher energy
  int octaves = int(mix(3.0, 7.0, energy + sJam * 0.3));

  // Ray direction for aurora marching (looking up)
  vec3 auroraRd = normalize(vec3(screenP.x, 0.6 + screenP.y * 0.8 + lookUpAngle * 0.5, -1.0));

  // Layer 1: primary curtain
  vec4 auroraAcc1 = arAuroraLayer(
    auroraRd, 0.0, slowTime, driftSpeed,
    bass, energy, onset, turbulence,
    bandLow, bandHigh, swayDamp, octaves,
    auroraColor1, auroraColor2, curtainBright
  );

  // Layer 2: secondary curtain (offset, slightly dimmer, different drift)
  vec4 auroraAcc2 = arAuroraLayer(
    auroraRd, 1.5, slowTime * 0.85, driftSpeed * 0.7,
    bass * 0.8, energy, onset * 0.6, turbulence * 0.7,
    bandLow + 0.5, bandHigh - 0.3, swayDamp * 0.8, max(octaves - 1, 3),
    mix(auroraColor1, auroraColor2, 0.6), auroraColor2, curtainBright * 0.6
  );

  // Layer 3: distant faint glow (only at higher energy or climax)
  vec4 auroraAcc3 = vec4(0.0);
  if (energy > 0.3 || climaxBoost > 0.1) {
    auroraAcc3 = arAuroraLayer(
      auroraRd, 3.0, slowTime * 0.6, driftSpeed * 0.4,
      bass * 0.5, energy * 0.6, 0.0, turbulence * 0.3,
      bandLow + 1.0, bandHigh + 1.0, swayDamp * 0.5, max(octaves - 2, 3),
      auroraColor2, mix(auroraColor1, vec3(0.8, 0.2, 0.3), harmTens * 0.4),
      curtainBright * 0.35
    );
  }

  // Composite aurora layers
  vec3 totalAurora = auroraAcc1.rgb + auroraAcc2.rgb + auroraAcc3.rgb;
  float totalAuroraAlpha = clamp(auroraAcc1.a + auroraAcc2.a * 0.6 + auroraAcc3.a * 0.3, 0.0, 1.0);

  // Dim stars behind aurora
  col -= starCol * totalAuroraAlpha * 0.8;
  col = max(col, vec3(0.0));

  // Add aurora emission
  col += totalAurora;

  // ═══════════════════════════════════════════════════
  // TERRAIN RAYMARCHING: mountains + frozen lake
  // ═══════════════════════════════════════════════════
  int materialID = 0;
  float marchDist = arMarch(ro, rd, materialID);

  if (marchDist > 0.0) {
    vec3 hitPos = ro + rd * marchDist;
    vec3 hitNor = arNormal(hitPos);
    float occl = arOcclusion(hitPos, hitNor);

    // Aurora illumination color (dominant aurora tint casts onto terrain)
    vec3 auroraIllum = mix(auroraColor1, auroraColor2, 0.5) * curtainBright;
    // Aurora light comes from above
    float aurLightDot = max(dot(hitNor, vec3(0.0, 1.0, 0.0)), 0.0);
    vec3 auroraLight = auroraIllum * aurLightDot * totalAuroraAlpha * 0.4;

    // Ambient: cold blue arctic night
    vec3 ambient = vec3(0.02, 0.03, 0.06) * occl;

    if (materialID == 1) {
      // ─── Snow terrain ───
      vec3 snowBase = vec3(0.75, 0.80, 0.90); // blue-white snow

      // Snow detail: sparkle from highs
      float snowNoise = fbm3(vec3(hitPos.xz * 3.0, uDynamicTime * 0.02));
      float sparkle = pow(max(snowNoise, 0.0), 8.0) * highs * 1.5;
      snowBase += vec3(sparkle);

      // Timbral brightness → snow shimmer
      snowBase += vec3(0.05, 0.07, 0.1) * timbralBr * 0.3;

      // Diffuse from moon (dim directional light from upper right)
      // Blend shared lighting for crossfade continuity
      vec3 moonDir = normalize(vec3(0.5, 0.8, 0.3));
      float localMoonDiff = max(dot(hitNor, moonDir), 0.0) * 0.15;
      vec3 sharedLight = sharedDiffuse(hitNor);
      float moonDiff = mix(localMoonDiff, dot(sharedLight, vec3(0.333)) * 0.15, 0.3);
      vec3 moonLight = vec3(0.15, 0.18, 0.25) * moonDiff;

      // Combine lighting
      vec3 terrainCol = snowBase * (ambient + moonLight + auroraLight);

      // Distance fog (fade terrain into sky)
      float fogFactor = smoothstep(15.0, 80.0, marchDist);
      terrainCol = mix(terrainCol, col, fogFactor);

      col = terrainCol;

    } else if (materialID == 2) {
      // ─── Frozen lake ───
      vec3 iceBase = vec3(0.08, 0.12, 0.18); // dark ice

      // Ice surface cracks (noise pattern)
      float iceCracks = ridgedMultifractal(vec3(hitPos.xz * 2.0, 0.5), 4, 2.0, 0.5);
      iceBase += vec3(0.03, 0.05, 0.08) * iceCracks * 0.5;

      // ─── Aurora reflection in lake ───
      // Reflect ray direction
      vec3 reflDir = reflect(rd, hitNor);
      // Sample aurora at reflected direction (simplified: just height lookup)
      float reflY = reflDir.y;
      float reflBand = smoothstep(0.1, 0.5, reflY);
      // Fresnel: more reflection at grazing angles
      float fresnel = pow(1.0 - max(dot(-rd, hitNor), 0.0), 3.0);
      fresnel = mix(0.2, 1.0, fresnel);

      // Reflected aurora color (height-dependent)
      vec3 reflAurora = mix(auroraColor1, auroraColor2, reflY * 2.0) * curtainBright;
      // Add ripple distortion to reflection (bass-driven)
      float ripple = sin(hitPos.x * 8.0 + hitPos.z * 6.0 + uDynamicTime * 0.5) * bass * 0.15;
      reflAurora *= (0.8 + 0.2 * ripple);

      vec3 lakeCol = iceBase * (ambient + auroraLight * 0.5)
                   + reflAurora * reflBand * fresnel * totalAuroraAlpha * 0.5;

      // Specular highlight from aurora
      vec3 specDir = normalize(vec3(0.0, 1.0, 0.0)); // aurora overhead
      float spec = pow(max(dot(reflDir, specDir), 0.0), 32.0);
      lakeCol += auroraIllum * spec * 0.15 * totalAuroraAlpha;

      // SpaceScore: increase lake stillness / clarity
      lakeCol = mix(lakeCol, lakeCol * 1.15, spaceScr * 0.3);

      // Distance fog
      float fogFactor = smoothstep(20.0, 90.0, marchDist);
      lakeCol = mix(lakeCol, col, fogFactor);

      col = lakeCol;
    }
  }

  // ═══════════════════════════════════════════════════
  // MOUNTAIN SILHOUETTES on horizon (simple analytic)
  // ═══════════════════════════════════════════════════
  if (materialID == 0 && rd.y < 0.15) {
    // Procedural mountain silhouette at horizon
    float mtnProfile = fbm3(vec3(rd.x * 3.0, 0.0, 0.0)) * 0.12
                     + fbm3(vec3(rd.x * 8.0 + 50.0, 0.0, 0.0)) * 0.04;
    float mtnMask = smoothstep(mtnProfile + 0.02, mtnProfile - 0.01, rd.y);
    vec3 mtnColor = vec3(0.02, 0.025, 0.04); // dark silhouette
    // Aurora backlight on mountain edges
    mtnColor += auroraColor1 * totalAuroraAlpha * 0.06 * smoothstep(0.0, 0.04, rd.y - mtnProfile + 0.03);
    col = mix(col, mtnColor, mtnMask);
  }

  // ═══════════════════════════════════════════════════
  // ATMOSPHERIC GLOW: aurora illuminates low sky
  // ═══════════════════════════════════════════════════
  float glowY = smoothstep(0.3, -0.2, screenP.y);
  float glowStrength = totalAuroraAlpha * (0.06 + energy * 0.10 + climaxBoost * 0.08);
  vec3 glowColor = mix(auroraColor1, vec3(0.1, 0.2, 0.15), 0.5);
  col += glowColor * glowY * glowStrength;

  // ═══════════════════════════════════════════════════
  // SNOW PARTICLES
  // ═══════════════════════════════════════════════════
  vec3 snow = arSnowParticles(uv, uDynamicTime);
  // Aurora tints the snow particles
  snow += totalAurora * 0.03;
  // Dynamic range: more snow in quiet passages (atmospheric)
  float snowIntensity = mix(1.0, 0.4, energy) + dynRange * 0.2;
  col += snow * snowIntensity;

  // ═══════════════════════════════════════════════════
  // DRUM ONSET FLASH: brief aurora flash
  // ═══════════════════════════════════════════════════
  float flashStrength = drumOnset * 0.3 * (1.0 + climaxBoost * 0.5);
  col += mix(auroraColor1, vec3(1.0), 0.5) * flashStrength * smoothstep(0.0, 0.3, screenP.y);

  // ═══════════════════════════════════════════════════
  // SDF ICON EMERGENCE
  // ═══════════════════════════════════════════════════
  {
    float nf = arAuroraFBM(vec3(screenP * 2.0, slowTime), 0.0, 4);
    vec3 iconLight = iconEmergence(screenP, uTime, energy, bass,
      auroraColor1, auroraColor2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight * 0.7;
  }

  // Hero icon emergence
  {
    float nf = arAuroraFBM(vec3(screenP * 1.5, slowTime * 0.5), 0.0, 3);
    vec3 heroLight = heroIconEmergence(screenP, uTime, energy, bass,
      auroraColor1, auroraColor2, nf, uSectionIndex);
    col += heroLight;
  }

  // ═══════════════════════════════════════════════════
  // SEMANTIC MODULATION
  // ═══════════════════════════════════════════════════
  // Cosmic: boost aurora saturation + brightness
  float cosmicBoost = uSemanticCosmic * 0.12;
  col *= 1.0 + cosmicBoost;

  // Ambient: pastel desaturation for contemplative moods
  float ambientDesat = uSemanticAmbient * 0.15;
  float ambLuma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(ambLuma) * vec3(0.95, 0.98, 1.0), ambientDesat);

  // Tender: slightly warmer, more green dominant
  col = mix(col, col * vec3(0.95, 1.05, 0.95), uSemanticTender * 0.1);

  // ═══════════════════════════════════════════════════
  // VIGNETTE (subtle arctic)
  // ═══════════════════════════════════════════════════
  float vigScale = mix(0.26, 0.20, energy);
  float vig = 1.0 - dot(screenP * vigScale, screenP * vigScale);
  vig = smoothstep(0.0, 1.0, vig);
  col = mix(vec3(0.01, 0.015, 0.03), col, vig);

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // ═══════════════════════════════════════════════════
  // POST-PROCESSING
  // ═══════════════════════════════════════════════════
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
