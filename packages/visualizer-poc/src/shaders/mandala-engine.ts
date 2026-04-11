/**
 * Mandala Engine — raymarched 3D mandala with depth.
 *
 * Concentric rings of sacred geometry SDFs at different Z-depths.
 * Each ring contains different shapes (lotuses, dharma wheels, vajra forms).
 * Camera faces the mandala head-on; rings rotate at different speeds,
 * revealing depth through parallax. Light streams through the gaps.
 *
 * Audio mapping (14+ uniforms):
 *   uBass              → ring breathing (radial pulse, geometry scale)
 *   uEnergy            → ring count, detail level, overall brightness
 *   uDrumOnset         → ring rotation snap (discrete angular jumps)
 *   uVocalPresence     → backlight intensity through mandala gaps
 *   uHarmonicTension   → ring alignment (low=ordered, high=chaotic offsets)
 *   uSectionType       → jam=all rings spin independently,
 *                         space=perfect stillness/alignment,
 *                         chorus=full illumination,
 *                         solo=spotlight from behind
 *   uClimaxPhase       → mandala opens like a flower revealing inner light
 *   uSlowEnergy        → camera drift speed
 *   uHighs             → specular sharpness on geometry edges
 *   uMelodicPitch      → camera Z-depth shift (closer/further)
 *   uBeatSnap          → pulse flash on ring edges
 *   uCoherence         → geometry crispness (high=perfect, low=organic)
 *   uSpaceScore        → void expansion, fewer rings
 *   uTimbralBrightness → surface shimmer / golden ratio iridescence
 *   uSemanticCosmic    → depth fog color toward deep indigo
 *   uSemanticPsychedelic → geometry complexity multiplication
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";
import { buildDepthAlphaOutput } from "./shared/raymarching.glsl";

export const mandalaEngineVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
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
const me2DepthAlpha = buildDepthAlphaOutput("totalDist", "15.0");

export const mandalaEngineFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define ME2_PI 3.14159265
#define ME2_TAU 6.28318530
#define ME2_PHI 1.61803398
#define ME2_MAX_RINGS 7
#define ME2_MAX_STEPS 80

// ─── Hash ───
float me2Hash(float n) { return fract(sin(n) * 43758.5453); }
float me2Hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ─── Smooth min for organic SDF blending ───
float me2Smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Rotation helpers ───
mat2 me2Rot(float a) {
  float ca = cos(a); float sa = sin(a);
  return mat2(ca, -sa, sa, ca);
}

// ─── SDF: Torus (concentric ring) ───
float me2Torus(vec3 p, float R, float r) {
  vec2 q = vec2(length(p.xy) - R, p.z);
  return length(q) - r;
}

// ─── SDF: Lotus petal (elongated teardrop rotated around center) ───
// A single petal: capsule with tapered end, mirrored into N-fold symmetry
float me2Petal(vec2 p, float petalLen, float petalWidth) {
  // Taper: petal narrows toward tip
  float taper = smoothstep(0.0, petalLen, p.x) * 0.6 + 0.4;
  float yDist = abs(p.y) - petalWidth * taper;
  float xDist = p.x - petalLen;
  float capsule = length(max(vec2(xDist, yDist), 0.0)) + min(max(xDist, yDist), 0.0);
  return capsule;
}

// ─── SDF: Lotus flower (N petals in a ring at given radius) ───
float me2Lotus(vec3 p, float radius, int petals, float petalLen, float petalWidth, float curlAmount) {
  // Work in XY plane at the ring's Z
  vec2 q = p.xy;
  float angle = atan(q.y, q.x);
  float r = length(q);

  // Fold into petal sectors
  float sector = ME2_TAU / float(petals);
  float foldedAngle = mod(angle + sector * 0.5, sector) - sector * 0.5;

  // Local petal coordinate: centered at ring radius
  vec2 localP = vec2(r - radius, 0.0);
  localP = vec2(cos(foldedAngle) * (r - radius) - sin(foldedAngle) * abs(p.z) * curlAmount,
                sin(foldedAngle) * (r - radius) + p.z * 0.5);

  float petal = me2Petal(localP, petalLen, petalWidth);

  // Also measure Z-thickness: petals are thin
  float zThick = abs(p.z) - petalWidth * 0.3;
  return max(petal, zThick);
}

// ─── SDF: Dharma wheel spokes (radial bars + central hub + rim) ───
float me2DharmaWheel(vec3 p, float radius, int spokes, float thickness) {
  vec2 q = p.xy;
  float r = length(q);
  float angle = atan(q.y, q.x);

  // Outer rim (torus cross-section)
  float rim = abs(r - radius) - thickness;
  rim = max(rim, abs(p.z) - thickness * 0.8);

  // Central hub
  float hub = length(vec3(q, p.z)) - radius * 0.15;

  // Spokes: fold into spoke sectors
  float sector = ME2_TAU / float(spokes);
  float foldedAngle = mod(angle + sector * 0.5, sector) - sector * 0.5;
  // Spoke as thin bar from hub to rim
  float spokeD = max(abs(foldedAngle) * r - thickness * 0.5,
                     abs(p.z) - thickness * 0.6);
  // Only between hub and rim
  spokeD = max(spokeD, -(r - radius * 0.15));
  spokeD = max(spokeD, r - radius + thickness * 0.5);

  return min(rim, min(hub, spokeD));
}

// ─── SDF: Vajra shape (double-ended diamond scepter) ───
float me2Vajra(vec3 p, float radius, float size) {
  vec2 q = p.xy;
  float r = length(q);
  float angle = atan(q.y, q.x);

  // Fold into 6 positions around the ring
  float sector = ME2_TAU / 6.0;
  float foldedAngle = mod(angle + sector * 0.5, sector) - sector * 0.5;

  // Local position centered at ring radius
  vec2 localP = vec2(r - radius, foldedAngle * radius);

  // Diamond/octahedron cross-section
  float diamond = (abs(localP.x) + abs(localP.y)) * 0.7071 - size;
  // Z thickness
  float zd = abs(p.z) - size * 0.5;
  return max(diamond, zd);
}

// ─── SDF: Star pattern (concentric star shapes) ───
float me2Star(vec3 p, float radius, int points, float innerR, float thickness) {
  vec2 q = p.xy;
  float r = length(q);
  float angle = atan(q.y, q.x);

  // Star shape: modulate radius by angle
  float sector = ME2_TAU / float(points);
  float foldedAngle = mod(angle, sector) - sector * 0.5;
  float starR = mix(innerR, radius, 0.5 + 0.5 * cos(foldedAngle * float(points)));

  float starD = r - starR;
  float zd = abs(p.z) - thickness;
  return max(abs(starD) - thickness * 0.5, zd);
}

// ─── Single ring SDF: choose geometry type based on ring index ───
float me2Ring(vec3 p, int ringIdx, float ringRadius, float breathe,
              float tension, float tm, float energy, float psyche) {
  // Breathing: rings expand/contract with bass
  float R = ringRadius + breathe * sin(float(ringIdx) * 1.7 + tm * 0.5) * 0.3;

  // Geometry type per ring (cycling through shapes)
  int geomType = int(mod(float(ringIdx), 4.0));

  // Complexity scales with energy and psychedelic
  float complexity = 1.0 + energy * 0.5 + psyche * 0.3;

  // Thickness gets thinner for outer rings
  float baseThick = mix(0.06, 0.03, float(ringIdx) / 7.0);
  float thick = baseThick * (1.0 + energy * 0.3);

  float d = 1e5;

  if (geomType == 0) {
    // Lotus petals
    int petals = int(6.0 + energy * 4.0 + float(ringIdx) * 2.0);
    float petalLen = 0.3 + energy * 0.15;
    float petalW = 0.05 + energy * 0.02;
    float curlAmt = 0.3 + tension * 0.5;
    d = me2Lotus(p, R, petals, petalLen, petalW, curlAmt);
  } else if (geomType == 1) {
    // Dharma wheel
    int spokes = int(8.0 + energy * 4.0);
    d = me2DharmaWheel(p, R, spokes, thick * 2.0);
  } else if (geomType == 2) {
    // Vajra diamonds
    float vSize = 0.08 + energy * 0.04;
    d = me2Vajra(p, R, vSize);
  } else {
    // Star mandala
    int pts = int(5.0 + energy * 3.0 + float(ringIdx));
    float innerRatio = 0.85 * R;
    d = me2Star(p, R, pts, innerRatio, thick);
  }

  // Tension warps geometry: noise displacement
  if (tension > 0.05) {
    d += snoise(vec3(p.xy * 3.0, tm * 0.3 + float(ringIdx) * 10.0)) * tension * 0.04;
  }

  return d;
}

// ─── Complete scene SDF ───
float me2Map(vec3 p, float energy, float bass, float tension, float tm,
             float sJam, float sSpace, float sChorus, float sSolo,
             float climB, float psyche, float coherence, float drumSnap) {
  float d = 1e5;

  // Number of rings scales with energy
  int numRings = int(3.0 + energy * 4.0 - sSpace * 3.0);
  numRings = clamp(numRings, 2, ME2_MAX_RINGS);

  // Ring spacing uses golden ratio for sacred proportions
  float baseSpacing = 0.5 * ME2_PHI;

  // Bass breathing: all rings breathe together
  float breathe = bass * 0.25;

  // Climax: mandala opens outward like a flower blooming
  float bloomOpen = smoothstep(1.5, 3.0, climB) * 1.5;

  for (int i = 0; i < ME2_MAX_RINGS; i++) {
    if (i >= numRings) break;

    float fi = float(i);
    float ringRadius = (fi + 1.0) * baseSpacing + breathe * 0.3 + bloomOpen * fi * 0.3;

    // Each ring at a different Z-depth for parallax
    float ringZ = (fi - float(numRings) * 0.5) * 0.4;
    // Space: all rings collapse to same Z (flat, aligned)
    ringZ *= mix(1.0, 0.05, sSpace);
    // Climax: rings separate more in Z (dramatic depth)
    ringZ *= 1.0 + climB * 0.8;

    // Per-ring rotation: independent in jam, aligned in space
    float baseRot = tm * (0.1 + fi * 0.03) * mix(1.0, -1.0, step(0.5, fract(fi * 0.5)));
    // Jam: each ring gets its own tempo multiplier
    float jamRot = sJam * tm * 0.2 * sin(fi * ME2_PHI);
    // Space: freeze rotation
    float spaceFreeze = mix(1.0, 0.0, sSpace);
    // Drum onset: snap rotation (discrete angular jumps)
    float drumRot = drumSnap * ME2_PI / (6.0 + fi * 2.0);
    // Tension: misalign rings
    float tensionOffset = tension * sin(fi * 2.7 + tm * 0.5) * 0.5;

    float totalRot = (baseRot + jamRot + drumRot + tensionOffset) * spaceFreeze;

    // Transform point into ring-local space
    vec3 ringP = p;
    ringP.z -= ringZ;
    // Rotate in XY plane (the mandala plane)
    ringP.xy = me2Rot(totalRot) * ringP.xy;

    float ringD = me2Ring(ringP, i, ringRadius, breathe, tension, tm, energy, psyche);
    d = min(d, ringD);
  }

  // ─── Central core: glowing orb that the mandala encircles ───
  // More visible during chorus (full illumination) and climax (revealed light)
  float coreRadius = 0.15 + bass * 0.1 + climB * 0.4;
  float coreSDF = length(p) - coreRadius;
  // Core is always soft, doesn't hard-surface
  d = me2Smin(d, coreSDF, 0.15 + climB * 0.2);

  // ─── Connecting filaments between rings (coherence-gated) ───
  if (coherence > 0.3) {
    float filaments = 1e5;
    float filAngle = atan(p.y, p.x);
    float filR = length(p.xy);
    // Radial filaments connecting rings
    float filSector = ME2_TAU / 12.0;
    float filFolded = mod(filAngle + filSector * 0.5, filSector) - filSector * 0.5;
    float filD = abs(filFolded) * filR - 0.01;
    filD = max(filD, abs(p.z) - 0.02);
    // Only between innermost and outermost ring radii
    float innerR = baseSpacing;
    float outerR = float(numRings) * baseSpacing + breathe * 0.3 + bloomOpen * float(numRings) * 0.3;
    filD = max(filD, -(filR - innerR));
    filD = max(filD, filR - outerR);
    d = min(d, filD / coherence);
  }

  return d;
}

// ─── Normal via central differences ───
vec3 me2Normal(vec3 p, float energy, float bass, float tension, float tm,
               float sJam, float sSpace, float sChorus, float sSolo,
               float climB, float psyche, float coherence, float drumSnap) {
  vec2 eps = vec2(0.003, 0.0);
  float ref = me2Map(p, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap);
  return normalize(vec3(
    me2Map(p + eps.xyy, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap) - ref,
    me2Map(p + eps.yxy, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap) - ref,
    me2Map(p + eps.yyx, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap) - ref
  ));
}

// ─── Ambient occlusion ───
float me2Occlusion(vec3 p, vec3 n, float energy, float bass, float tension, float tm,
                   float sJam, float sSpace, float sChorus, float sSolo,
                   float climB, float psyche, float coherence, float drumSnap) {
  float occ = 1.0;
  for (int i = 1; i < 5; i++) {
    float fi = float(i);
    float stepD = 0.1 * fi;
    float sampD = me2Map(p + n * stepD, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap);
    occ -= (stepD - sampD) * (0.3 / fi);
  }
  return clamp(occ, 0.1, 1.0);
}

// ─── Volumetric light through mandala gaps ───
float me2VolumetricLight(vec3 ro, vec3 rd, float maxDist, float energy, float bass,
                         float tension, float tm, float sJam, float sSpace,
                         float sChorus, float sSolo, float climB, float psyche,
                         float coherence, float drumSnap) {
  float accumLight = 0.0;
  float stepSize = maxDist / 16.0;
  for (int i = 0; i < 16; i++) {
    float marchDist = (float(i) + 0.5) * stepSize;
    vec3 samplePos = ro + rd * marchDist;
    float sceneDist = me2Map(samplePos, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap);
    // In open space (gaps between rings) = light passes through
    float inGap = smoothstep(-0.05, 0.15, sceneDist);
    // Fog density varies: denser near center, sparser at edges
    float centerDist = length(samplePos.xy);
    float fogDensity = exp(-centerDist * 0.4) * 0.06;
    // Distance attenuation from backlight source (behind mandala)
    float backFade = 1.0 / (1.0 + abs(samplePos.z - 3.0) * 0.2);
    accumLight += inGap * fogDensity * backFade;
  }
  return accumLight;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Audio clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float spaceS = clamp(uSpaceScore, 0.0, 1.0);
  float timbralB = clamp(uTimbralBrightness, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float beatSnp = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  // ─── Section type decomposition ───
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType) + spaceS * 0.5;
  sSpace = clamp(sSpace, 0.0, 1.0);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // ─── Climax state ───
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Time (slowed, section-modulated) ───
  float tm = uDynamicTime * (0.06 + slowE * 0.03) * (1.0 + sJam * 0.5 - sSpace * 0.4);
  // Drum onset snaps: accumulate discrete angular jumps
  float drumSnap = drumOn * 0.3;
  tm += drumSnap;

  // ─── Palette ───
  float h1 = uPalettePrimary;
  vec3 palPrimary = paletteHueColor(h1, 0.85, 0.95);
  float h2 = uPaletteSecondary;
  vec3 palSecondary = paletteHueColor(h2, 0.85, 0.95);

  // Backlight color: warm golden, modulated by vocal presence
  vec3 backlightColor = mix(vec3(1.0, 0.85, 0.55), vec3(1.0, 0.95, 0.85), vocalP);
  backlightColor *= 0.5 + vocalP * 1.0;
  // Chorus: full illumination — backlight strengthened
  backlightColor *= 1.0 + sChorus * 0.6;

  // ─── Camera: head-on view of the mandala ───
  // Camera looks straight down the Z axis at the mandala
  float camZ = -3.5 + melPitch * 0.8 - climB * 1.0;
  // Subtle drift for life
  float driftX = sin(tm * 0.07) * 0.15 * mix(1.0, 0.02, sSpace);
  float driftY = cos(tm * 0.05) * 0.1 * mix(1.0, 0.02, sSpace);

  vec3 ro = vec3(driftX, driftY, camZ);
  vec3 lookAt = vec3(0.0, 0.0, 0.0);
  vec3 fw = normalize(lookAt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 upVec = cross(fw, ri);
  float fov = 0.9 + energy * 0.15 + climB * 0.25;
  vec3 rd = normalize(p.x * ri + p.y * upVec + fov * fw);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 marchPos = ro;
  bool marchHit = false;

  for (int i = 0; i < ME2_MAX_STEPS; i++) {
    vec3 ps = ro + rd * totalDist;
    float dist = me2Map(ps, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap);

    if (dist < 0.002) {
      marchPos = ps;
      marchHit = true;
      break;
    }
    if (totalDist > 15.0) break;
    totalDist += dist * 0.7;
  }

  // ─── Shading ───
  vec3 col = vec3(0.0);

  if (marchHit) {
    vec3 norm = me2Normal(marchPos, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap);
    float occl = me2Occlusion(marchPos, norm, energy, bass, tension, tm, sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap);

    // ─── Lighting: backlight through mandala + rim + fill ───
    // Primary: backlight from behind the mandala (positive Z)
    // Blend shared lighting for crossfade continuity
    vec3 backLightDir = normalize(vec3(0.0, 0.0, 1.0));
    float localBackDiff = max(dot(norm, backLightDir), 0.0);
    vec3 sharedLight = sharedDiffuse(norm);
    float sharedLightMono = dot(sharedLight, vec3(0.333));
    float backDiff = mix(localBackDiff, sharedLightMono, 0.3);

    // Fill light from camera direction
    vec3 fillDir = normalize(vec3(0.2, 0.3, -0.8));
    float localFillDiff = max(dot(norm, fillDir), 0.0);
    float fillDiff = mix(localFillDiff, sharedLightMono, 0.3);

    // Specular: highs + timbral brightness control sharpness
    float specPow = 12.0 + highs * 48.0 + timbralB * 24.0;
    float specBack = pow(max(dot(reflect(-backLightDir, norm), -rd), 0.0), specPow);
    float specFill = pow(max(dot(reflect(-fillDir, norm), -rd), 0.0), specPow * 0.5);

    // Fresnel: rim glow (light wrapping around geometry edges)
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

    // ─── Surface color ───
    // Distance from center determines ring → palette gradient
    float centerR = length(marchPos.xy);
    float ringGrad = fract(centerR * ME2_PHI * 0.5);
    vec3 surfColor = mix(palPrimary * 0.2, palSecondary * 0.15, ringGrad);

    // Timbral iridescence: golden ratio shimmer on surfaces
    float shimmer = 0.5 + 0.5 * sin(centerR * ME2_PHI * 8.0 + tm * 0.5);
    surfColor += palPrimary * shimmer * timbralB * 0.08;

    // ─── Compose surface ───
    // Backlight + fill + ambient — boosted from dim originals so the
    // mandala geometry actually reads as illuminated rather than flat 2D.
    vec3 backContrib = backlightColor * backDiff * 1.1;
    vec3 fillContrib = mix(palPrimary, palSecondary, 0.3) * fillDiff * 0.45;
    vec3 ambient = surfColor * 0.35 * occl;

    col = ambient + backContrib + fillContrib;
    col += palSecondary * specBack * 0.55 * (1.0 + timbralB * 0.5);
    col += palPrimary * specFill * 0.25;

    // Rim glow: mandala edges glow with backlight color
    col += backlightColor * fresnel * 0.45 * (1.0 + vocalP * 0.4);

    // Beat snap flash on geometry
    col += vec3(1.0, 0.95, 0.9) * beatSnp * 0.1 * fresnel;

    // Coherence: crisp vs diffuse
    float crispness = mix(0.5, 1.0, coherence);
    col *= crispness + (1.0 - crispness) * 0.6;

    // Solo: dramatic spotlight from behind
    if (sSolo > 0.01) {
      float spotlight = exp(-centerR * 1.2);
      col += backlightColor * spotlight * sSolo * 0.25;
    }

    // AO application
    col *= occl;

    // Energy boost
    col *= 1.0 + energy * 0.3;

  } else {
    // ─── Background: deep void with subtle glow from mandala center ───
    float bgGrad = length(p) * 0.8;
    vec3 voidColor = mix(vec3(0.008, 0.005, 0.015), vec3(0.002, 0.001, 0.005), bgGrad);
    // Cosmic coloring shifts void toward indigo
    voidColor = mix(voidColor, vec3(0.005, 0.003, 0.02), cosmic * 0.5);
    col = voidColor;

    // Central glow: light that the mandala frames
    float centralGlow = exp(-length(p) * 2.5);
    col += backlightColor * centralGlow * 0.06 * (1.0 + climB * 0.5);

    // Distant stars
    vec3 starCell = floor(rd * 50.0);
    float starHash = fract(sin(dot(starCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float starBright = step(0.94, starHash) * smoothstep(0.04, 0.01, length(fract(rd * 50.0) - 0.5));
    col += mix(vec3(0.7, 0.75, 1.0), palSecondary, 0.3) * starBright * 0.2;
  }

  // ─── Volumetric backlight (god rays through mandala gaps) ───
  {
    float maxMarchDist = marchHit ? totalDist : 12.0;
    float volLight = me2VolumetricLight(ro, rd, maxMarchDist, energy, bass, tension, tm,
                                         sJam, sSpace, sChorus, sSolo, climB, psyche, coherence, drumSnap);
    col += backlightColor * volLight * (0.5 + vocalP * 0.8 + climB * 0.5);
  }

  // ─── Atmospheric haze (depth fog) ───
  {
    float hazeDensity = mix(0.04, 0.015, energy);
    float hazeD = 1.0 - exp(-totalDist * hazeDensity);
    vec3 hazeColor = mix(vec3(0.008, 0.005, 0.015), palPrimary * 0.02, 0.3 + cosmic * 0.4);
    col = mix(col, hazeColor, hazeD);
  }

  // ─── Climax: mandala opens, inner light floods outward ───
  if (climB > 0.2) {
    // Golden radial burst from center
    float burstR = length(p);
    float burst = exp(-burstR * mix(3.0, 1.5, climB));
    col += backlightColor * burst * climB * 0.35;
    // Sparkle particles
    float sparkle = snoise(vec3(p * 25.0, tm * 2.0));
    sparkle = smoothstep(0.65, 1.0, sparkle);
    col += backlightColor * sparkle * climB * 0.2;
  }

  // ─── Beat pulse brightness ───
  col *= 1.0 + beatSnp * 0.06;

  // ─── Minimum black floor ───
  col = max(col, vec3(0.006, 0.004, 0.01));

  // ─── Icon emergence ───
  {
    float nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, uBass, palPrimary, palSecondary, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, uBass, palPrimary, palSecondary, nf, uSectionIndex);
  }

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // ─── Post-processing ───
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
  ${me2DepthAlpha}
}
`;
