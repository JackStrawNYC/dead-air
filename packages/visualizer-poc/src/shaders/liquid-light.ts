/**
 * Liquid Light Cathedral — raymarched 3D liquid light show projector.
 * You are INSIDE a giant overhead projector: pools of colored oil float on
 * a glass ceiling above, light projects through them onto cathedral-like
 * surfaces below, creating caustic patterns, volumetric light cones,
 * and oil-on-glass transmission effects.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → oil blob size/merge rate
 *   uEnergy           → color saturation/flow speed
 *   uDrumOnset        → oil splash/split ripple
 *   uVocalPresence    → light cone brightness/god ray intensity
 *   uHarmonicTension  → oil viscosity (high=rigid blobs, low=flowing)
 *   uSectionType      → jam=rapid flow, space=slow merge, chorus=full color flood
 *   uClimaxPhase      → oil evaporates to pure light
 *   uMelodicPitch     → oil color temperature shift
 *   uSlowEnergy       → camera drift speed
 *   uHighs            → caustic shimmer intensity
 *   uSpectralFlux     → oil surface turbulence
 *   uTimbralBrightness → light transmission clarity
 *   uBeatStability    → geometric vs organic oil flow
 *   uSemanticPsychedelic → color bleed between oil pools
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

const llNormalGLSL = buildRaymarchNormal(
  "llMap($P, bass, energy, llTime, viscosity, splashWave, beatStab, sJam, sSpace, sChorus, climB)",
  { eps: 0.003, name: "llNormal" },
);
const llAOGLSL = buildRaymarchAO(
  "llMap($P, bass, energy, llTime, viscosity, splashWave, beatStab, sJam, sSpace, sChorus, climB)",
  { steps: 4, stepBase: 0.0, stepScale: 0.12, weightDecay: 0.5, finalMult: 0.35, name: "llCalcAO" },
);

export const liquidLightVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  lightLeakEnabled: true,
  grainStrength: "light",
  eraGradingEnabled: true,
  lensDistortionEnabled: true,
});

export const liquidLightFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;

#define LL_PI 3.14159265
#define LL_TAU 6.28318530
#define LL_MAX_STEPS 80
#define LL_MAX_DIST 20.0
#define LL_SURF_DIST 0.002

// ─── Hash helpers ───
float llHash(float n) { return fract(sin(n) * 43758.5453); }
float llHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ─── Smooth minimum for merging oil blobs ───
float llSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Oil blob: metaball-style SDF for a single floating oil pool ───
// Returns distance to a deformed sphere on the glass ceiling plane
float llOilBlob(vec3 pos, vec3 center, float radius, float deform, float llTime) {
  vec3 diff = pos - center;
  // Flatten into a lens/disc shape (oil is thin on glass)
  diff.y *= 2.5;
  // Organic deformation from noise
  float nz = snoise(center * 1.3 + llTime * 0.15) * deform;
  float nz2 = fbm3(pos * 2.0 + center * 0.7 + llTime * 0.08) * deform * 0.5;
  return length(diff) - radius + nz * 0.12 + nz2 * 0.06;
}

// ─── Oil density field: multiple merging oil pools on the glass ceiling ───
// Returns (distance to nearest oil, oil color index 0-1)
vec2 llOilField(vec3 pos, float bass, float energy, float llTime,
                float viscosity, float splashWave, float beatStab,
                float sJam, float sSpace, float sChorus, float climB) {
  // Oil pools live on a glass ceiling at y ~ 2.0
  float ceilingY = 2.0;
  // Merge radius: bass makes blobs merge more aggressively
  float mergeK = 0.3 + bass * 0.4 - viscosity * 0.15;
  mergeK = clamp(mergeK, 0.1, 0.8);

  // Flow speed: section-type modulated
  float flowSpeed = 0.08 + energy * 0.06;
  flowSpeed *= 1.0 + sJam * 0.8 - sSpace * 0.5;
  flowSpeed *= 1.0 + climB * 0.5;

  float oilDist = 999.0;
  float colorIdx = 0.0;
  float totalWeight = 0.0;

  // 7 oil blobs in a slowly rotating configuration
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float phase = fi * 0.897 + llTime * flowSpeed;
    float angle = phase + fi * LL_TAU / 7.0;

    // Orbital radius: bass expands, space contracts
    float orbitR = 0.6 + fi * 0.15 + bass * 0.3 + sChorus * 0.2;
    orbitR *= 1.0 - sSpace * 0.3;

    // Blob center on the ceiling
    vec3 blobCenter = vec3(
      sin(angle) * orbitR + cos(phase * 0.37 + fi * 2.1) * 0.25,
      ceilingY + sin(phase * 0.5 + fi) * 0.08,
      cos(angle) * orbitR + sin(phase * 0.41 + fi * 1.7) * 0.25
    );

    // Blob radius: bass increases size, climax shrinks (evaporation)
    float blobR = 0.25 + bass * 0.15 + llHash(fi * 7.3) * 0.1;
    blobR *= 1.0 - climB * 0.6; // evaporation during climax
    blobR *= mix(1.0, 0.85, sSpace); // smaller in space sections

    // Deformation: low viscosity = more organic flow
    float deform = (1.0 - viscosity) * 0.8 + splashWave * 0.5;
    deform *= mix(1.0, 0.6, beatStab); // stable beats = more geometric

    float d = llOilBlob(pos, blobCenter, blobR, deform, llTime);

    // Splash ripple on drum onset
    float splashRipple = sin(length(pos.xz - blobCenter.xz) * 12.0 - splashWave * 8.0) * 0.02 * splashWave;
    d += splashRipple;

    // Smooth union for merging
    float prevDist = oilDist;
    oilDist = llSmin(oilDist, d, mergeK);

    // Track color index for the dominant blob
    float weight = 1.0 / (1.0 + max(0.0, d) * 5.0);
    colorIdx += fi / 7.0 * weight;
    totalWeight += weight;
  }

  colorIdx /= max(totalWeight, 0.001);
  return vec2(oilDist, colorIdx);
}

// ─── Cathedral floor: undulating stone surface with pillars ───
float llFloor(vec3 pos, float llTime) {
  // Floor plane at y = -1.5 with gentle undulation
  float base = pos.y + 1.5;
  // Stone texture: low-frequency terrain
  base += fbm3(vec3(pos.xz * 0.3, llTime * 0.01)) * 0.15;
  // Pillar stumps rising from floor (repeating grid)
  vec2 pillarCell = fract(pos.xz * 0.5) - 0.5;
  float pillarDist = length(pillarCell) - 0.08;
  float pillarHeight = smoothstep(0.08, 0.0, pillarDist) * 0.6;
  base -= pillarHeight;
  return base;
}

// ─── Cathedral walls: curved enclosing surfaces ───
float llWalls(vec3 pos, float llTime) {
  // Cylindrical cathedral: radius varies with height (gothic arch shape)
  float radius = 3.0 + sin(pos.y * 0.5 + 1.0) * 0.8;
  // Rib pattern along the walls
  float ribAngle = atan(pos.z, pos.x);
  float ribs = sin(ribAngle * 8.0) * 0.06;
  return -(length(pos.xz) - radius + ribs);
}

// ─── Glass ceiling: the overhead projector surface ───
float llCeiling(vec3 pos) {
  return -(pos.y - 2.2);
}

// ─── Full scene SDF ───
float llMap(vec3 pos, float bass, float energy, float llTime,
            float viscosity, float splashWave, float beatStab,
            float sJam, float sSpace, float sChorus, float climB) {
  float floorDist = llFloor(pos, llTime);
  float wallDist = llWalls(pos, llTime);
  float ceilDist = llCeiling(pos);

  // Oil field for transmission calculation (not a physical barrier to march into)
  // The scene is the cathedral interior: floor, walls, ceiling
  float scene = min(floorDist, min(wallDist, ceilDist));

  return scene;
}

// ─── Oil color from index: psychedelic palette ───
vec3 llOilColor(float idx, float llTime, float energy, float melPitch,
                float h1, float h2, float sChorus, float psyche) {
  // Multi-hue oil: each blob has a different color
  float hue = idx + llTime * 0.02 + melPitch * 0.15;
  // Palette-derived base colors
  vec3 col1 = 0.5 + 0.5 * cos(LL_TAU * vec3(h1 + hue, h1 + hue + 0.33, h1 + hue + 0.67));
  vec3 col2 = 0.5 + 0.5 * cos(LL_TAU * vec3(h2 + hue * 0.7, h2 + hue * 0.7 + 0.33, h2 + hue * 0.7 + 0.67));
  vec3 oilCol = mix(col1, col2, sin(idx * LL_TAU + llTime * 0.1) * 0.5 + 0.5);
  // Chorus: full saturation flood
  oilCol *= 1.0 + sChorus * 0.3;
  // Psychedelic: colors bleed and shift
  oilCol = mix(oilCol, oilCol.gbr, psyche * 0.2);
  // Energy-driven saturation
  float luma = dot(oilCol, vec3(0.299, 0.587, 0.114));
  oilCol = mix(vec3(luma), oilCol, 0.5 + energy * 0.5);
  return oilCol;
}

// ─── Caustic pattern: light refracted through oil onto surfaces ───
float llCaustics(vec2 pos, float llTime, float energy) {
  // Overlapping wave interference patterns
  float c = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 3.0 + fi * 2.0;
    float speed = 0.15 + fi * 0.05;
    vec2 wave1 = pos * scale + vec2(llTime * speed, llTime * speed * 0.7);
    vec2 wave2 = pos * scale * 1.3 + vec2(-llTime * speed * 0.8, llTime * speed * 1.1);
    float n1 = sin(wave1.x + snoise(vec3(wave1, llTime * 0.1))) *
               cos(wave1.y + snoise(vec3(wave1.yx, llTime * 0.13)));
    float n2 = sin(wave2.x + snoise(vec3(wave2, llTime * 0.12 + 5.0))) *
               cos(wave2.y + snoise(vec3(wave2.yx, llTime * 0.11 + 3.0)));
    c += abs(n1 + n2) * 0.5;
  }
  c = pow(c / 3.0, 2.0) * (1.0 + energy * 0.5);
  return c;
}

// ─── Volumetric light cone: light projecting down from oil through glass ───
vec3 llLightCone(vec3 rayOrigin, vec3 rayDir, float marchDist, bool marchHit,
                 float bass, float energy, float llTime, float viscosity,
                 float splashWave, float beatStab,
                 float sJam, float sSpace, float sChorus, float climB,
                 float vocalP, float timbralBright,
                 float h1, float h2, float melPitch, float psyche) {
  // Accumulate light along the ray where it passes through oil-lit areas
  vec3 lightAccum = vec3(0.0);
  float stepSize = 0.25;
  int steps = int(mix(16.0, 28.0, energy));

  for (int i = 0; i < 28; i++) {
    if (i >= steps) break;
    float sampleDist = float(i) * stepSize + stepSize * 0.5;
    if (sampleDist > marchDist && marchHit) break;
    if (sampleDist > LL_MAX_DIST) break;

    vec3 samplePos = rayOrigin + rayDir * sampleDist;

    // Only accumulate light between ceiling and floor
    if (samplePos.y > 2.3 || samplePos.y < -1.6) continue;

    // Sample the oil field above this point
    vec3 oilSamplePos = vec3(samplePos.x, 2.0, samplePos.z);
    vec2 oilInfo = llOilField(oilSamplePos, bass, energy, llTime,
                              viscosity, splashWave, beatStab,
                              sJam, sSpace, sChorus, climB);

    float oilDist = oilInfo.x;
    float oilIdx = oilInfo.y;

    // If we're beneath an oil blob, we get colored light
    float lightStrength = smoothstep(0.2, -0.1, oilDist);
    if (lightStrength < 0.001) continue;

    // Light color from oil transmission
    vec3 oilCol = llOilColor(oilIdx, llTime, energy, melPitch, h1, h2, sChorus, psyche);

    // Height-based cone spread: narrower near ceiling, wider near floor
    float coneSpread = 1.0 - (samplePos.y + 1.5) / 3.7;
    coneSpread = clamp(coneSpread, 0.0, 1.0);

    // Atmospheric scattering: more visible in middle of cone
    float scatter = exp(-sampleDist * 0.15) * coneSpread;

    // Vocal presence drives overall light cone brightness
    float brightness = (0.3 + vocalP * 0.7) * (0.6 + timbralBright * 0.4);

    // Climax: oil evaporates, pure white light intensifies
    vec3 coneColor = mix(oilCol, vec3(1.0, 0.98, 0.92), climB * 0.7);

    lightAccum += coneColor * lightStrength * scatter * brightness * stepSize * 0.08;
  }

  return lightAccum;
}

// ─── Transmission: colored shadow from oil projected onto surfaces ───
vec3 llTransmission(vec3 surfPos, float bass, float energy, float llTime,
                    float viscosity, float splashWave, float beatStab,
                    float sJam, float sSpace, float sChorus, float climB,
                    float h1, float h2, float melPitch, float psyche) {
  // Look straight up from the surface to find oil above
  vec3 oilSamplePos = vec3(surfPos.x, 2.0, surfPos.z);
  vec2 oilInfo = llOilField(oilSamplePos, bass, energy, llTime,
                            viscosity, splashWave, beatStab,
                            sJam, sSpace, sChorus, climB);

  float oilDist = oilInfo.x;
  float oilIdx = oilInfo.y;

  // Transmission: how much colored light passes through oil to this surface
  float transmission = smoothstep(0.3, -0.15, oilDist);

  vec3 oilCol = llOilColor(oilIdx, llTime, energy, melPitch, h1, h2, sChorus, psyche);

  // Climax: pure white light
  oilCol = mix(oilCol, vec3(1.0, 0.97, 0.90), climB * 0.8);

  return oilCol * transmission;
}

${llNormalGLSL}
${llAOGLSL}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Clamp all audio uniforms ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float highsVal = clamp(uHighs, 0.0, 1.0);
  float specFlux = clamp(uSpectralFlux, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);

  // ─── Section type parsing ───
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // ─── Climax ───
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Derived parameters ───
  float viscosity = tension; // high tension = rigid oil
  float splashWave = drumOn * (1.0 + specFlux * 0.5); // drum onset + spectral flux = splash
  float llTime = uDynamicTime * (0.06 + slowE * 0.04) * (1.0 + sJam * 0.6 - sSpace * 0.4);

  // ─── Palette ───
  // h1/h2 use cosine-hue for the multi-blob procedural color generator (llOilColor)
  float h1 = hsvToCosineHue(uPalettePrimary);
  float h2 = hsvToCosineHue(uPaletteSecondary);
  // palPrimary/palSecondary are direct palette colors used for cathedral glow / icons
  vec3 palPrimary = paletteHueColor(uPalettePrimary, 0.85, 0.95);
  vec3 palSecondary = paletteHueColor(uPaletteSecondary, 0.85, 0.95);

  // Cathedral material colors
  vec3 stoneWarm = vec3(0.18, 0.14, 0.10);
  vec3 stoneCool = vec3(0.10, 0.11, 0.14);
  vec3 stoneBase = mix(stoneCool, stoneWarm, 0.5 + energy * 0.3);

  // ─── Camera: slowly drifting inside the cathedral, looking around ───
  float camTime = llTime * 0.8;
  float camOrbitR = 1.2 + sin(camTime * 0.07) * 0.3;
  vec3 ro = vec3(
    sin(camTime * 0.05) * camOrbitR,
    mix(-0.5, 0.3, sin(camTime * 0.03) * 0.5 + 0.5) + sSolo * 0.6,
    cos(camTime * 0.05) * camOrbitR
  );

  // Look target: wanders, solo looks up at ceiling/oil, space looks far
  vec3 lookPt = vec3(
    sin(camTime * 0.03 + 1.0) * 0.8,
    mix(0.5, 1.5, vocalP * 0.3 + sSolo * 0.5) + sSpace * 0.3,
    cos(camTime * 0.03 + 1.0) * 0.8 + 2.0
  );

  // Drum onset nudge (subtle camera shake)
  ro.x += sin(uTime * 12.0) * drumOn * 0.03;
  ro.y += cos(uTime * 15.0) * drumOn * 0.02;

  vec3 fw = normalize(lookPt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 llUp = cross(fw, ri);
  float fov = 0.75 + energy * 0.1 + climB * 0.15;
  vec3 rd = normalize(p.x * ri + p.y * llUp + fov * fw);

  // ─── Raymarch the cathedral scene ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  bool wasHit = false;
  int maxSteps = int(mix(48.0, 72.0, energy));

  for (int i = 0; i < LL_MAX_STEPS; i++) {
    if (i >= maxSteps) break;
    vec3 marchPos = ro + rd * totalDist;
    float dist = llMap(marchPos, bass, energy, llTime,
                       viscosity, splashWave, beatStab,
                       sJam, sSpace, sChorus, climB);

    if (dist < LL_SURF_DIST) {
      hitPos = marchPos;
      wasHit = true;
      break;
    }
    if (totalDist > LL_MAX_DIST) break;
    totalDist += dist * 0.75;
  }

  vec3 col = vec3(0.0);

  if (wasHit) {
    vec3 norm = llNormal(hitPos);
    float llAO = llCalcAO(hitPos, norm);

    // ─── Basic directional light (from above, through glass) ───
    vec3 lightDir = normalize(vec3(sin(llTime * 0.08) * 0.3, 0.9, cos(llTime * 0.06) * 0.3));
    float diffuse = max(dot(norm, lightDir), 0.0);

    // Fill light from below (reflected caustics)
    float fillDiff = max(dot(norm, vec3(0.0, -0.5, 0.3)), 0.0) * 0.08;

    // Specular: wet stone reflections
    float specPow = 24.0 + energy * 40.0;
    float spec = pow(max(dot(reflect(-lightDir, norm), -rd), 0.0), specPow);

    // Fresnel: rim glow where light grazes surfaces
    float fresnelVal = pow(1.0 - max(dot(norm, -rd), 0.0), 3.5);

    // ─── Oil transmission: colored light projected onto surfaces ───
    vec3 oilLight = llTransmission(hitPos, bass, energy, llTime,
                                   viscosity, splashWave, beatStab,
                                   sJam, sSpace, sChorus, climB,
                                   h1, h2, melPitch, psyche);

    // ─── Caustic patterns on surfaces ───
    float caustic = llCaustics(hitPos.xz, llTime, energy);
    // Caustics are stronger on floor (facing up), weaker on walls
    float causticMask = max(dot(norm, vec3(0.0, 1.0, 0.0)), 0.0);
    causticMask += max(dot(norm, vec3(0.0, -1.0, 0.0)), 0.0) * 0.3; // some on ceiling too
    vec3 causticCol = oilLight * caustic * causticMask * (0.4 + highsVal * 0.6);

    // ─── Surface color: stone cathedral walls/floor ───
    // Per-surface variation
    float surfNoise = fbm3(hitPos * 1.5 + 3.0);
    vec3 surfColor = mix(stoneBase, stoneBase * 1.3, surfNoise * 0.4);

    // Floor gets more color from projected light
    float isFloor = smoothstep(-1.3, -1.5, hitPos.y);
    surfColor = mix(surfColor, surfColor * 0.8 + oilLight * 0.25, isFloor);

    // ─── Compose surface lighting ───
    // Ambient: dark cathedral interior lit primarily by overhead oil projection
    vec3 ambient = stoneBase * 0.03 * (1.0 + energy * 0.15);

    // Diffuse lit by oil transmission color
    vec3 oilLit = surfColor * (oilLight * 0.4 + vec3(0.1)) * diffuse;

    // Combine
    col = ambient + oilLit + surfColor * fillDiff;
    col += causticCol;
    col *= llAO;

    // Specular highlights: tinted by oil color
    col += mix(vec3(1.0), oilLight, 0.5) * spec * 0.15 * (1.0 + energy * 0.3);

    // Fresnel rim: subtle glow at grazing angles
    vec3 rimColor = mix(palSecondary * 0.15, oilLight * 0.2, energy);
    col += rimColor * fresnelVal * (0.08 + vocalP * 0.12);

    // Timbral brightness: clearer light transmission overall
    col *= 0.8 + timbralBright * 0.3;

    // ─── Depth fog: darker stone fades into blackness ───
    float depthFade = clamp(totalDist / 14.0, 0.0, 1.0);
    vec3 fogColor = vec3(0.02, 0.015, 0.025);
    col = mix(col, fogColor, depthFade * depthFade);

  } else {
    // ─── Background: deep void with faint glow ───
    col = vec3(0.01, 0.008, 0.015);
    // Distant cathedral glow
    float bgGlow = exp(-length(p) * 2.5) * 0.02;
    col += palPrimary * bgGlow * energy;
  }

  // ─── Volumetric light cones (always computed, even on miss) ───
  float effectiveMarchDist = wasHit ? totalDist : LL_MAX_DIST;
  vec3 volumetric = llLightCone(ro, rd, effectiveMarchDist, wasHit,
                                bass, energy, llTime, viscosity,
                                splashWave, beatStab,
                                sJam, sSpace, sChorus, climB,
                                vocalP, timbralBright,
                                h1, h2, melPitch, psyche);
  col += volumetric;

  // ─── Climax: pure light flood ───
  if (climB > 0.1) {
    // White light overwhelms the scene
    float floodIntensity = climB * climB * 0.15;
    vec3 floodColor = mix(palPrimary, vec3(1.0, 0.98, 0.93), climB);
    col += floodColor * floodIntensity;
    // Particle sparkle: evaporating oil droplets
    vec3 sparkCell = floor(rd * 30.0 + llTime * 2.0);
    float sparkH = llHash2(sparkCell.xy + sparkCell.z * 7.1);
    float sparkle = step(0.93, sparkH) * smoothstep(0.06, 0.01, length(fract(rd * 30.0 + llTime * 2.0) - 0.5));
    col += vec3(1.0, 0.95, 0.85) * sparkle * climB * 0.4;
  }

  // ─── Beat snap brightness ───
  col *= 1.0 + uBeatSnap * 0.10;

  // ─── Chromatic influence ───
  vec3 chromaInf = chromaColor(p * 0.5, uChroma0, uChroma1, uChroma2, energy);
  col += chromaInf * 0.03;

  // ─── Warm vignette: cathedral darkness at edges ───
  float vigDist = 1.0 - dot(p * 0.32, p * 0.32);
  float vig = smoothstep(0.0, 1.0, vigDist);
  vec3 vigTint = vec3(0.03, 0.02, 0.04);
  col = mix(vigTint, col, vig * mix(0.7, 1.0, vig));

  // ─── Icon emergence ───
  {
    float noiseField = snoise(vec3(p * 2.0, uTime * 0.1));
    vec3 iconCol1 = mix(palPrimary, vec3(1.0, 0.9, 0.7), 0.3);
    vec3 iconCol2 = mix(palSecondary, vec3(0.8, 0.7, 1.0), 0.3);
    col += iconEmergence(p, uTime, energy, bass, iconCol1, iconCol2, noiseField, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, iconCol1, iconCol2, noiseField, uSectionIndex);
  }

  // ─── Floor: never fully black ───
  col = max(col, vec3(0.01, 0.008, 0.012));

  // ─── Post-process ───
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;
