/**
 * Cosmic Dust Field — raymarched volumetric interstellar dust cloud with
 * embedded crystalline grain SDFs. Camera drifts through luminous dust lanes,
 * backlit gas wisps, and glittering specular dust grains.
 *
 * Audio reactivity:
 *   uBass            → dust density pulse (clouds swell on bass)
 *   uEnergy          → grain count / brightness, step budget
 *   uDrumOnset       → grain sparkle burst (specular flash)
 *   uVocalPresence   → backlight intensity (voice lights the dust from behind)
 *   uHarmonicTension → color temperature (low=cool blue, high=warm amber)
 *   uSectionType     → jam=dense swirling, space=thin sparse, chorus=golden backlight
 *   uClimaxPhase     → dust parts to reveal bright star behind
 *   uMelodicPitch    → grain size (high pitch = fine crystalline, low = broad)
 *   uSlowEnergy      → camera drift speed
 *   uTimbralBrightness → edge glow intensity
 *   uSpaceScore      → dust thinning / cosmic silence
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const cosmicDustVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: 'normal',
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  dofEnabled: true,
  lightLeakEnabled: true,
});

export const cosmicDustFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Hash helpers (cd2 prefixed) ───

float cd2Hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float cd2Hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ─── Dust density field: layered FBM with curl advection ───
// Returns density (0-1+) at a given 3D position in the dust cloud.

float cd2Dust(vec3 pos, float flowTime, float densityMod) {
  // Primary volume: broad structure
  float broad = fbm3(pos * 0.7 + vec3(flowTime * 0.04, 0.0, flowTime * 0.02));

  // Filament structure: ridged fractal for wispy lanes
  float filament = ridgedMultifractal(pos * 1.2 + vec3(0.0, flowTime * 0.03, flowTime * 0.06), 4, 2.2, 0.45);

  // Fine turbulence: small-scale eddies
  float fine = snoise(pos * 3.5 + vec3(flowTime * 0.1, flowTime * 0.07, 0.0)) * 0.5 + 0.5;

  // Combine: broad shapes with filament detail
  float density = broad * 0.45 + filament * 0.4 + fine * 0.15;

  // Apply density modifier (bass, section, etc.)
  density *= densityMod;

  // Soft floor: don't allow negative density
  return max(density - 0.15, 0.0);
}

// ─── Crystalline dust grain SDF ───
// Tiny specular point lights scattered through the volume.
// Returns brightness (0-1) for a grain at this position.

float cd2Grain(vec3 pos, float grainDensity, float sparkle) {
  // Grid-based placement: each cell may contain a grain
  float grainScale = 6.0 + grainDensity * 4.0;
  vec3 cell = floor(pos * grainScale);
  vec3 cellFrac = fract(pos * grainScale) - 0.5;

  float grainBright = 0.0;

  // Check surrounding cells for nearest grain
  for (int dz = -1; dz <= 1; dz++) {
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec3 neighbor = vec3(float(dx), float(dy), float(dz));
        vec3 cellId = cell + neighbor;
        float cellHash = cd2Hash(cellId);

        // Only ~18% of cells have grains (energy increases this)
        if (cellHash > (0.82 - grainDensity * 0.15)) {
          // Grain position within cell (jittered)
          vec3 grainPos = neighbor + vec3(
            cd2Hash(cellId + 0.1),
            cd2Hash(cellId + 0.2),
            cd2Hash(cellId + 0.3)
          ) - 0.5 - cellFrac;

          float dist = length(grainPos);

          // Tiny specular point: very sharp falloff
          float grain = smoothstep(0.12, 0.0, dist);

          // Per-grain twinkle (phase varies per grain)
          float twinklePhase = cellHash * 100.0;
          float twinkleSpeed = 2.0 + cellHash * 4.0;
          float twinkle = 0.4 + 0.6 * pow(max(0.0, sin(uTime * twinkleSpeed + twinklePhase)), 3.0);

          // Sparkle burst on drum onset
          float burstPhase = sin(uTime * 12.0 + twinklePhase);
          float burst = sparkle * max(0.0, burstPhase) * 2.0;

          grain *= twinkle + burst;

          // Size variation: some grains are brighter/larger
          grain *= 0.5 + cellHash * 0.8;

          grainBright += grain;
        }
      }
    }
  }

  return grainBright;
}

// ─── Backlight scattering: simulates light from behind dust ───
// Brighter where dust is thin and backlight is strong.

vec3 cd2Backlight(vec3 pos, vec3 lightDir, float dustDensity, float intensity, vec3 lightColor) {
  // Forward-scattering approximation: bright when viewing toward light through thin dust
  float scatter = exp(-dustDensity * 4.0) * intensity;

  // Mie-like forward scattering lobe
  float phase = 0.5 + 0.5 * dot(normalize(pos), lightDir);
  phase = pow(phase, 3.0);

  return lightColor * scatter * phase;
}

// ─── Central star (revealed during climax) ───

vec3 cd2Star(vec2 screenPos, float reveal, float vocalLight) {
  float dist = length(screenPos);

  // Core glow
  float core = exp(-dist * 8.0) * reveal;

  // Corona rays
  float rays = 0.0;
  float angle = atan(screenPos.y, screenPos.x);
  rays += exp(-dist * 3.0) * pow(max(0.0, sin(angle * 4.0 + uTime * 0.2)), 8.0) * 0.3;
  rays += exp(-dist * 2.0) * pow(max(0.0, sin(angle * 6.0 - uTime * 0.15)), 12.0) * 0.15;

  // Diffraction spikes (4-point cross)
  float spikeH = exp(-abs(screenPos.y) * 40.0) * exp(-abs(screenPos.x) * 4.0);
  float spikeV = exp(-abs(screenPos.x) * 40.0) * exp(-abs(screenPos.y) * 4.0);
  float spikes = (spikeH + spikeV) * reveal * 0.4;

  float totalBright = core + rays + spikes;

  // Star color: warm white shifting to gold with vocal presence
  vec3 starColor = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.85, 0.55), vocalLight * 0.4);

  return starColor * totalBright;
}

void main() {
  vec2 uvScreen = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (uvScreen - 0.5) * aspect;

  // ─── Audio clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);
  float melDir = uMelodicDirection;
  float chromaHue = uChromaHue;

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam    = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace  = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo   = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // Climax dust parting: 0 = normal, 1 = fully parted (star revealed)
  float dustParting = smoothstep(1.5, 3.0, uClimaxPhase) * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Drift speed: slow + energy-responsive + section-modulated ───
  float driftSpeed = (0.02 + slowE * 0.015) * (1.0 + sJam * 0.6 - sSpace * 0.5);
  float flowTime = uDynamicTime * driftSpeed;

  // ─── Palette ───
  float hue1 = uPalettePrimary + chromaHue * 0.15;
  float hue2 = uPaletteSecondary;

  // Color temperature from harmonic tension: cool blue → warm amber
  vec3 coolDust = vec3(0.12, 0.15, 0.3);  // deep blue
  vec3 warmDust = vec3(0.35, 0.18, 0.08); // warm amber
  vec3 dustBaseColor = mix(coolDust, warmDust, tension);

  // Palette tinting
  vec3 paletteTint = paletteHueColor(hue1, 0.78, 0.9);
  dustBaseColor = mix(dustBaseColor, paletteTint * 0.4, 0.3 + uPaletteSaturation * 0.2);

  // Secondary color for grain specular
  vec3 grainColor = paletteHueColor(hue2, 0.85, 0.95);
  grainColor = mix(grainColor, vec3(1.0, 0.95, 0.85), 0.4); // shift toward white

  // Chorus golden backlight color
  vec3 chorusBacklightColor = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.92, 0.7), vocalPres);

  // Backlight color: vocal presence warms it, chorus makes it golden
  vec3 backlightColor = mix(vec3(0.8, 0.85, 1.0), chorusBacklightColor, sChorus * 0.8 + vocalPres * 0.3);

  // ─── Ray setup (3D camera system) ───
  vec3 ro, rd;
  setupCameraRay(uvScreen, aspect, ro, rd);

  // ─── Dust density modulation (audio-driven) ───
  // Bass → density pulse, section → swirl/sparse, space → thin
  float densityMod = 0.8 + bass * 0.5;
  densityMod *= (1.0 + sJam * 0.4 - sSpace * 0.35 + sSolo * 0.15);
  densityMod *= (1.0 - spaceScore * 0.25);
  densityMod *= (1.0 - dustParting * 0.7); // climax parts the dust

  // ─── Volumetric raymarch (40-72 steps) ───
  int stepCount = int(mix(40.0, 72.0, smoothstep(0.15, 0.55, energy)));
  float stepSize = 0.10;

  vec3 dustAccum = vec3(0.0);
  float dustAlpha = 0.0;
  float totalGrainBright = 0.0;

  // Backlight direction: from behind, slightly offset by melodic direction
  vec3 backlightDir = normalize(vec3(melDir * 0.1, 0.1, -1.0));

  // Grain density scales with energy
  float grainDensityParam = energy * 0.8 + 0.2;

  // Sparkle from drum onset
  float sparkleParam = drumOnset * 1.5;

  for (int i = 0; i < 72; i++) {
    if (i >= stepCount) break;
    if (dustAlpha > 0.96) break;

    float fi = float(i);
    float marchDist = 0.3 + fi * stepSize;
    vec3 pos = ro + rd * marchDist;

    // Swirling motion for jam sections: curl offset
    vec3 swirlOffset = vec3(0.0);
    if (sJam > 0.01) {
      // Cheap swirl approximation without full curlNoise
      float swirlAngle = flowTime * 3.0 + length(pos.xy) * 2.0;
      swirlOffset = vec3(
        sin(swirlAngle + pos.z * 1.5) * 0.15,
        cos(swirlAngle + pos.x * 1.5) * 0.15,
        sin(swirlAngle * 0.7 + pos.y) * 0.1
      ) * sJam;
    }

    vec3 samplePos = pos + swirlOffset;

    // Sample dust density
    float density = cd2Dust(samplePos, flowTime, densityMod);

    // Depth-dependent absorption: far dust is thinner
    float depthFade = exp(-fi * 0.015);
    density *= depthFade;

    if (density > 0.001) {
      float alpha = density * 0.06 * (1.0 - dustAlpha);

      // ─── Dust illumination ───

      // Self-emission: denser regions glow faintly
      vec3 selfGlow = dustBaseColor * density * 2.5;

      // Backlit scattering (vocal presence drives intensity)
      float backlightIntensity = 0.3 + vocalPres * 0.7 + sChorus * 0.4;
      vec3 backlit = cd2Backlight(rd, backlightDir, density * 8.0, backlightIntensity, backlightColor);

      // Edge glow: timbral brightness drives rim lighting
      float edgeGlow = pow(1.0 - abs(dot(rd, normalize(samplePos))), 2.5);
      vec3 rimLight = dustBaseColor * edgeGlow * timbralBright * 0.4;

      // Combine illumination
      vec3 dustColor = selfGlow + backlit + rimLight;

      // Depth coloring: near = warm, far = cool
      float depthT = fi / float(stepCount);
      dustColor = mix(dustColor, dustColor * vec3(0.7, 0.75, 1.1), depthT * 0.5);

      // Dynamic range → contrast in dust layers
      dustColor *= 0.8 + dynamicRange * 0.4;

      dustAccum += dustColor * alpha;
      dustAlpha += alpha;
    }

    // ─── Crystalline dust grains (embedded in the volume) ───
    float grain = cd2Grain(samplePos, grainDensityParam, sparkleParam);
    if (grain > 0.01) {
      float grainVisibility = (1.0 - dustAlpha) * grain * depthFade;

      // Grain color: mix of palette secondary + white specular
      vec3 gColor = grainColor * (0.6 + grain * 0.8);

      // Beat instability → extra shimmer on grains
      gColor *= 1.0 + (1.0 - beatStab) * 0.3 * sin(uTime * 10.0 + fi * 7.0);

      dustAccum += gColor * grainVisibility * 0.35;
      totalGrainBright += grainVisibility;
    }
  }

  vec3 col = dustAccum;

  // ─── Background: deep space with distant stars ───
  float bgStarField = 0.0;
  {
    // Distant static stars behind the dust
    vec3 bgDir = rd * 15.0;
    vec3 bgCell = floor(bgDir);
    vec3 bgFrac = fract(bgDir) - 0.5;

    for (int bz = -1; bz <= 1; bz++) {
      for (int by = -1; by <= 1; by++) {
        for (int bx = -1; bx <= 1; bx++) {
          vec3 bNeighbor = vec3(float(bx), float(by), float(bz));
          vec3 bCellId = bgCell + bNeighbor;
          float bHash = cd2Hash(bCellId);
          if (bHash > 0.88) {
            vec3 starPos = bNeighbor + vec3(
              cd2Hash(bCellId + 0.1),
              cd2Hash(bCellId + 0.2),
              cd2Hash(bCellId + 0.3)
            ) - 0.5 - bgFrac;
            float sDist = length(starPos);
            float sBright = smoothstep(0.06, 0.0, sDist) * bHash;
            bgStarField += sBright;
          }
        }
      }
    }
  }

  // Background color: deep indigo with faint stars
  vec3 bgColor = vec3(0.01, 0.012, 0.03) + vec3(0.8, 0.85, 1.0) * bgStarField * 0.25 * (1.0 - dustAlpha);
  col = mix(bgColor, col, dustAlpha * 0.85 + 0.15);

  // ─── Central star (climax reveal) ───
  // As climax intensifies, dust parts and a brilliant star emerges behind
  if (dustParting > 0.05) {
    vec3 starGlow = cd2Star(screenPos, dustParting, vocalPres);
    // Star is attenuated by remaining dust
    float starAttenuation = 1.0 - dustAlpha * (1.0 - dustParting * 0.8);
    col += starGlow * starAttenuation;
  }

  // ─── Global modulations ───

  // Beat + climax brightness
  col *= 1.0 + climaxBoost * 0.15;
  col *= 1.0 + uBeatSnap * 0.08 * (1.0 + climaxBoost * 0.3);
  col *= 1.0 + max(uOnsetSnap, uDrumBeat) * 0.12;

  // Energy forecast: approaching peak → slow brightening
  col *= 1.0 + clamp(uEnergyForecast, 0.0, 1.0) * 0.06;
  col *= 1.0 + clamp(uPeakApproaching, 0.0, 1.0) * 0.08;

  // Semantic: cosmic → deepen blue + expand, ambient → soften
  col *= 1.0 + uSemanticCosmic * 0.15;
  col = mix(col, col * vec3(0.85, 0.9, 1.1), uSemanticAmbient * 0.2);

  // Jam phase modulation: building → brighter grains, peak_space → ethereal
  float jamBuild = smoothstep(0.5, 1.5, uJamPhase) * (1.0 - step(1.5, uJamPhase));
  float jamPeakSpace = smoothstep(1.5, 2.5, uJamPhase) * (1.0 - step(2.5, uJamPhase));
  col *= 1.0 + jamBuild * uJamProgress * 0.1;
  col = mix(col, col * vec3(0.8, 0.85, 1.15), jamPeakSpace * 0.25);

  // ─── Dead Iconography ───
  float _nf = snoise(vec3(screenPos * 2.0, uTime * 0.1));
  col += iconEmergence(screenPos, uTime, energy, bass, paletteTint, grainColor, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(screenPos, uTime, energy, bass, paletteTint, grainColor, _nf, uSectionIndex);

  // ─── Post-processing (shared chain) ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uvScreen, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
