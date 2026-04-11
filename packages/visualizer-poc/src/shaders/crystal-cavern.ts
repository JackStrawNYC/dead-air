/**
 * Crystal Cavern — raymarched geode interior.
 * Camera floats inside a massive geode lined with quartz crystal formations.
 * Crystals are elongated hexagonal prism SDFs with faceted tips, growing
 * inward from the cavity walls. Light refracts through the crystals creating
 * prismatic rainbows. Amethyst purple, quartz clear, citrine gold varieties.
 *
 * Audio reactivity:
 *   uBass             → crystal resonance vibration (displacement + pulse)
 *   uEnergy           → prismatic light intensity, crystal glow brightness
 *   uDrumOnset        → crystal ring (bright flash on facets)
 *   uVocalPresence    → internal warmth (amber glow from within crystals)
 *   uHarmonicTension  → crystal stress fracturing (crack lines appear)
 *   uSectionType      → jam=rapid prismatic shifting, space=dim single crystal glow,
 *                        chorus=full geode illumination
 *   uClimaxPhase      → crystals shatter into prismatic dust
 *   uHighs            → specular sharpness on crystal facets
 *   uMelodicPitch     → light source height (moves caustic patterns)
 *   uBeatStability    → crystal stillness (stable=solid, unstable=wobble)
 *   uSlowEnergy       → ambient glow intensity
 *   uChromaHue        → crystal variety tint cycling
 *   uPalettePrimary   → amethyst / citrine / quartz base hue
 *   uPaletteSecondary → prismatic accent color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const crystalCavernVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const cvNormalGLSL = buildRaymarchNormal("cvMap($P, bassVib, climaxShatter)", { eps: 0.003, name: "cvNormal" });
const cvAOGLSL = buildRaymarchAO("cvMap($P, bassVib, climaxShatter)", { steps: 5, stepBase: 0.0, stepScale: 0.08, weightDecay: 0.6, finalMult: 3.0, name: "cvAmbientOcclusion" });

export const crystalCavernFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  caEnabled: true,
  halationEnabled: true,
  lensDistortionEnabled: true,
  dofEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 18.0
#define SURF_DIST 0.002

// ============================================================
// Utility: rotation matrix around arbitrary axis
// ============================================================
mat2 cvRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// ============================================================
// SDF: hexagonal prism (elongated crystal shaft)
// p = position, h = half-height, r = radius
// ============================================================
float cvHexPrism(vec3 p, float h, float r) {
  vec3 ap = abs(p);
  // hexagonal cross-section
  float hex = max(ap.x * 0.866025 + ap.z * 0.5, ap.z) - r;
  float cap = ap.y - h;
  return max(hex, cap);
}

// ============================================================
// SDF: faceted crystal tip (tapered hexagonal pyramid)
// ============================================================
float cvCrystalTip(vec3 p, float h, float baseR) {
  float tipProgress = clamp(p.y / h, 0.0, 1.0);
  float radius = baseR * (1.0 - tipProgress * 0.85); // taper to point
  vec3 ap = abs(p);
  float hex = max(ap.x * 0.866025 + ap.z * 0.5, ap.z) - radius;
  float cap = max(p.y - h, -p.y);
  return max(hex, cap);
}

// ============================================================
// SDF: single complete crystal (shaft + tip)
// ============================================================
float cvCrystal(vec3 p, float shaftH, float tipH, float radius) {
  // Shaft below, tip above
  float shaft = cvHexPrism(p - vec3(0.0, -tipH * 0.5, 0.0), shaftH, radius);
  float tip = cvCrystalTip(p - vec3(0.0, shaftH, 0.0), tipH, radius);
  return min(shaft, tip);
}

// ============================================================
// Hash for deterministic per-crystal variation
// ============================================================
float cvHash(float n) { return fract(sin(n) * 43758.5453123); }
vec3 cvHash3(float n) {
  return vec3(cvHash(n), cvHash(n + 17.3), cvHash(n + 31.7));
}

// ============================================================
// SDF: geode shell (inverted sphere — camera is inside)
// ============================================================
float cvGeodeShell(vec3 p, float radius) {
  // Inverted sphere: positive inside, negative outside
  float shell = length(p) - radius;
  // Roughen the inner surface with noise
  float roughness = snoise(p * 2.5) * 0.15 + snoise(p * 5.0) * 0.08;
  return -shell + roughness; // flip sign so interior is negative (hittable)
}

// ============================================================
// Crystal cluster: multiple crystals growing inward from shell
// ============================================================
float cvCrystalCluster(vec3 p, float bassVib, float climaxShatter) {
  float minDist = MAX_DIST;

  // 12 primary crystal formations arranged on inner sphere surface
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = fi * 7.31;

    // Distribute crystals on sphere interior using fibonacci lattice
    float phi = acos(1.0 - 2.0 * (fi + 0.5) / 12.0);
    float theta = PI * (1.0 + sqrt(5.0)) * fi;

    vec3 crystalOrigin = vec3(
      sin(phi) * cos(theta),
      sin(phi) * sin(theta),
      cos(phi)
    ) * 4.5; // radius of geode shell (crystals grow from here)

    // Crystal points inward (toward center)
    vec3 growDir = -normalize(crystalOrigin);

    // Per-crystal variation
    vec3 variation = cvHash3(seed);
    float shaftH = 0.8 + variation.x * 1.2;
    float tipH = 0.3 + variation.y * 0.5;
    float radius = 0.08 + variation.z * 0.12;

    // Bass resonance vibration: displacement along growth axis
    float vibPhase = fi * 0.97 + uDynamicTime * 3.0;
    float vibAmount = bassVib * 0.06 * sin(vibPhase);

    // Build local coordinate frame aligned to growth direction
    vec3 localUp = growDir;
    vec3 localRight = normalize(cross(localUp, vec3(0.01, 1.0, 0.02)));
    vec3 localForward = cross(localRight, localUp);

    // Transform point into crystal's local space
    vec3 localP = p - crystalOrigin - growDir * vibAmount;
    vec3 crystalP = vec3(
      dot(localP, localRight),
      dot(localP, localUp),
      dot(localP, localForward)
    );

    // Small tilt per crystal for natural randomness
    float tiltAngle = variation.x * 0.3 - 0.15;
    crystalP.xy *= cvRot2(tiltAngle);
    crystalP.xz *= cvRot2(variation.y * TAU);

    // Climax shatter: crystals fragment outward
    if (climaxShatter > 0.01) {
      vec3 shatterOff = (variation - 0.5) * climaxShatter * 1.5;
      crystalP += shatterOff;
      // Shrink crystals as they shatter
      shaftH *= max(0.2, 1.0 - climaxShatter * 0.6);
      tipH *= max(0.2, 1.0 - climaxShatter * 0.5);
    }

    float crystal = cvCrystal(crystalP, shaftH, tipH, radius);
    minDist = min(minDist, crystal);
  }

  // Secondary smaller crystals (8 more, thinner)
  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 12.0;
    float seed = fi * 11.17;

    float phi = acos(1.0 - 2.0 * (fi + 0.5) / 20.0);
    float theta = PI * (1.0 + sqrt(5.0)) * fi + 1.0;

    vec3 crystalOrigin = vec3(
      sin(phi) * cos(theta),
      sin(phi) * sin(theta),
      cos(phi)
    ) * 4.2;

    vec3 growDir = -normalize(crystalOrigin);
    vec3 variation = cvHash3(seed);

    float shaftH = 0.4 + variation.x * 0.6;
    float tipH = 0.15 + variation.y * 0.3;
    float radius = 0.04 + variation.z * 0.06;

    float vibPhase = fi * 1.23 + uDynamicTime * 2.5;
    float vibAmount = bassVib * 0.04 * sin(vibPhase);

    vec3 localUp = growDir;
    vec3 localRight = normalize(cross(localUp, vec3(0.01, 1.0, 0.02)));
    vec3 localForward = cross(localRight, localUp);

    vec3 localP = p - crystalOrigin - growDir * vibAmount;
    vec3 crystalP = vec3(
      dot(localP, localRight),
      dot(localP, localUp),
      dot(localP, localForward)
    );

    crystalP.xy *= cvRot2(variation.x * 0.4);
    crystalP.xz *= cvRot2(variation.y * TAU + 0.5);

    if (climaxShatter > 0.01) {
      crystalP += (variation - 0.5) * climaxShatter * 2.0;
      shaftH *= max(0.1, 1.0 - climaxShatter * 0.7);
    }

    float crystal = cvCrystal(crystalP, shaftH, tipH, radius);
    minDist = min(minDist, crystal);
  }

  return minDist;
}

// ============================================================
// Scene SDF: geode shell + crystal clusters
// ============================================================
float cvMap(vec3 p, float bassVib, float climaxShatter) {
  float geode = cvGeodeShell(p, 5.0);
  float crystals = cvCrystalCluster(p, bassVib, climaxShatter);
  return min(geode, crystals);
}

// ============================================================
// Material ID: 0 = geode wall, 1 = crystal
// ============================================================
float cvMaterialID(vec3 p, float bassVib, float climaxShatter) {
  float geode = cvGeodeShell(p, 5.0);
  float crystals = cvCrystalCluster(p, bassVib, climaxShatter);
  return (crystals < geode) ? 1.0 : 0.0;
}

// Normal & AO — generated by shared raymarching utilities
${cvNormalGLSL}
${cvAOGLSL}

// ============================================================
// Prismatic dispersion: wavelength-dependent refraction
// ============================================================
vec3 cvPrismaticDispersion(vec3 rd, vec3 n, float ior, float spread) {
  // Separate IOR per channel for chromatic dispersion
  float rIOR = ior - spread * 0.02;
  float gIOR = ior;
  float bIOR = ior + spread * 0.02;

  vec3 refR = refract(rd, n, 1.0 / rIOR);
  vec3 refG = refract(rd, n, 1.0 / gIOR);
  vec3 refB = refract(rd, n, 1.0 / bIOR);

  // Sample environment along refracted directions (noise-based)
  float r = 0.5 + 0.5 * snoise(refR * 3.0);
  float g = 0.5 + 0.5 * snoise(refG * 3.0);
  float b = 0.5 + 0.5 * snoise(refB * 3.0);

  return vec3(r, g, b);
}

// ============================================================
// Caustic pattern (projected light through crystal facets)
// ============================================================
float cvCaustics(vec3 p, float timeSlow) {
  // Voronoi-like bright caustic lines
  vec3 q = p * 4.0 + vec3(timeSlow * 0.1, timeSlow * 0.07, timeSlow * -0.05);
  float c1 = abs(snoise(q));
  float c2 = abs(snoise(q * 2.1 + 33.0));
  float c3 = abs(snoise(q * 4.3 + 71.0));
  // Sharp bright lines where noise crosses zero
  float caustic = pow(1.0 - c1, 8.0) * 0.5 + pow(1.0 - c2, 12.0) * 0.3 + pow(1.0 - c3, 16.0) * 0.2;
  return caustic;
}

// ============================================================
// Stress fracture lines (harmonic tension driven)
// ============================================================
float cvFractures(vec3 p, float tension) {
  if (tension < 0.15) return 0.0;
  vec3 q = p * 8.0;
  float n1 = snoise(q);
  float n2 = snoise(q * 2.3 + 50.0);
  // Sharp crack lines: very narrow bright bands
  float crack = pow(1.0 - abs(n1), 20.0) * 0.7 + pow(1.0 - abs(n2), 25.0) * 0.3;
  return crack * smoothstep(0.15, 0.5, tension);
}

// ============================================================
// Prismatic dust (climax shatter particles)
// ============================================================
vec3 cvPrismaticDust(vec3 p, float timeSlow, float shatterAmount) {
  if (shatterAmount < 0.05) return vec3(0.0);

  vec3 dustP = p * 6.0 + vec3(timeSlow * 0.3, -timeSlow * 0.5, timeSlow * 0.2);
  float density = fbm3(dustP) * shatterAmount;
  density = max(0.0, density - 0.2); // threshold for particle appearance

  // Rainbow coloring of dust particles
  float hue = fract(snoise(dustP * 0.5) * 0.5 + 0.5 + timeSlow * 0.1);
  vec3 dustColor = hsv2rgb(vec3(hue, 0.8, 1.0));

  // Sparkle on individual particles
  float sparkle = pow(max(0.0, snoise(dustP * 3.0)), 8.0);

  return dustColor * density * 2.0 + vec3(1.0, 0.95, 0.9) * sparkle * shatterAmount * 0.5;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === Clamp audio uniforms ===
  float bass = clamp(uBass, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalWarmth = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float energy2 = energy * energy;

  // === Section type modulation ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section modifiers
  float prismaticSpeed = mix(1.0, 3.0, sJam) * mix(1.0, 0.15, sSpace);
  float illumination = mix(1.0, 1.6, sChorus) * mix(1.0, 0.25, sSpace) * mix(1.0, 1.3, sSolo);
  float singleGlowFocus = sSpace * 0.8; // space mode: focus on one crystal

  // === Climax state ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);
  float climaxShatter = climaxBoost * smoothstep(0.3, 1.0, uClimaxIntensity);

  // === Palette ===
  float chromaHueMod = uChromaHue * 0.25;
  float chordConf = smoothstep(0.3, 0.6, uChordConfidence);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1 * chordConf;
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.1, 0.85, energy2) * uPaletteSaturation;

  // Crystal color varieties: amethyst, quartz, citrine
  vec3 amethystCol = hsv2rgb(vec3(fract(0.78 + hue1 * 0.3), 0.6 * uPaletteSaturation, 0.7));
  vec3 quartzCol = hsv2rgb(vec3(fract(0.55 + hue1 * 0.1), 0.15 * uPaletteSaturation, 0.85));
  vec3 citrineCol = hsv2rgb(vec3(fract(0.12 + hue1 * 0.2), 0.7 * uPaletteSaturation, 0.8));
  vec3 primaryCol = hsv2rgb(vec3(hue1, sat, 0.9));
  vec3 secondaryCol = hsv2rgb(vec3(hue2, sat * 0.8, 0.85));

  // === Time ===
  float timeSlow = uDynamicTime * 0.02 * (1.0 + sJam * 0.5 - sSpace * 0.5);

  // === Ray setup ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Gentle orbit: camera floats inside geode
  float orbitAngle = timeSlow * 0.5;
  float orbitRadius = 1.2 + sin(timeSlow * 0.3) * 0.4;
  float orbitY = sin(timeSlow * 0.2) * 0.6 + melodicPitch * 0.3;
  ro = vec3(
    cos(orbitAngle) * orbitRadius,
    orbitY,
    sin(orbitAngle) * orbitRadius
  );

  // Look direction: slightly ahead of orbit + outward toward crystals
  vec3 lookTarget = vec3(
    cos(orbitAngle + 0.3) * 3.0,
    orbitY + sin(timeSlow * 0.15) * 0.5,
    sin(orbitAngle + 0.3) * 3.0
  );
  vec3 camForward = normalize(lookTarget - ro);
  vec3 camRight = normalize(cross(camForward, vec3(0.0, 1.0, 0.0)));
  vec3 camUp = cross(camRight, camForward);
  float fovScale = tan(radians(mix(55.0, 70.0, energy)) * 0.5);
  vec2 sp = (uv - 0.5) * aspect;
  rd = normalize(camForward + camRight * sp.x * fovScale + camUp * sp.y * fovScale);

  // Beat stability wobble: camera shake when unstable
  float wobble = (1.0 - stability) * 0.015;
  rd.xy += vec2(
    sin(uDynamicTime * 7.0) * wobble,
    cos(uDynamicTime * 5.3) * wobble
  );
  rd = normalize(rd);

  // === Bass vibration amount ===
  float bassVib = bass;

  // === RAYMARCH ===
  float totalDist = 0.0;
  float marchDist = 0.0;
  bool marchHit = false;
  vec3 marchPos = ro;
  int stepCount = MAX_STEPS;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    marchDist = cvMap(marchPos, bassVib, climaxShatter);

    if (marchDist < SURF_DIST) {
      marchHit = true;
      break;
    }
    if (totalDist > MAX_DIST) break;

    totalDist += marchDist * 0.8; // conservative step for SDF accuracy
  }

  // === BLACK FLOOR ===
  vec3 col = vec3(0.005, 0.003, 0.01);

  if (marchHit) {
    vec3 pos = marchPos;
    vec3 norm = cvNormal(pos);
    float matID = cvMaterialID(pos, bassVib, climaxShatter);

    // === AMBIENT OCCLUSION ===
    float occl = cvAmbientOcclusion(pos, norm);

    // === LIGHTING ===
    // Primary light: overhead + moving with melodic pitch
    vec3 lightPos1 = vec3(
      sin(timeSlow * 0.7) * 2.0,
      2.5 + melodicPitch * 1.5,
      cos(timeSlow * 0.5) * 2.0
    );
    vec3 lightDir1 = normalize(lightPos1 - pos);
    float ndotl1 = max(0.0, dot(norm, lightDir1));

    // Secondary light: lower fill
    vec3 lightDir2 = normalize(vec3(-0.4, -0.6, 0.3));
    float ndotl2 = max(0.0, dot(norm, lightDir2)) * 0.3;

    // Rim light for silhouette
    float rimDot = 1.0 - max(0.0, dot(norm, -rd));

    if (matID > 0.5) {
      // ========== CRYSTAL MATERIAL ==========

      // Per-crystal color variation based on world position hash
      float crystalSeed = floor(snoise(pos * 0.5) * 3.0 + 1.5);
      vec3 crystalBaseCol = (crystalSeed < 1.0) ? amethystCol :
                            (crystalSeed < 2.0) ? quartzCol : citrineCol;

      // === FRESNEL ===
      float fresnel = pow(rimDot, 3.0);
      float fresnelIntensity = 0.3 + energy * 0.4 + climaxBoost * 0.2;

      // === SPECULAR (Blinn-Phong, highs-driven sharpness) ===
      vec3 halfVec = normalize(lightDir1 - rd);
      float specPow = 64.0 + highs * 128.0;
      float specular = pow(max(0.0, dot(norm, halfVec)), specPow);

      // === PRISMATIC DISPERSION ===
      float ior = 1.55 + tension * 0.1; // quartz IOR ~1.55
      float dispSpread = (1.0 + energy * 2.0 + climaxBoost * 3.0) * prismaticSpeed;
      vec3 prismColor = cvPrismaticDispersion(rd, norm, ior, dispSpread);

      // === INTERNAL GLOW (vocal warmth) ===
      float internalGlow = (1.0 - fresnel) * (0.1 + vocalWarmth * 0.4 + slowE * 0.2);
      vec3 warmGlow = mix(
        crystalBaseCol,
        vec3(1.0, 0.85, 0.6), // amber warmth
        vocalWarmth * 0.5
      ) * internalGlow;

      // === CAUSTICS on crystal surfaces ===
      float caustic = cvCaustics(pos, timeSlow * prismaticSpeed);
      vec3 causticColor = hsv2rgb(vec3(
        fract(caustic * 0.3 + hue1 + timeSlow * 0.05 * prismaticSpeed),
        0.7 * uPaletteSaturation,
        0.9
      )) * caustic * energy * 0.6;

      // === STRESS FRACTURES ===
      float fracture = cvFractures(pos, tension);
      vec3 fractureColor = vec3(0.8, 0.6, 1.0) * fracture * 0.4;

      // === DRUM ONSET: crystal ring flash ===
      float ringFlash = drumOnset * pow(max(0.0, dot(norm, -rd)), 6.0) * 1.5;
      vec3 flashColor = vec3(1.0, 0.97, 0.92) * ringFlash;

      // === COMPOSITE CRYSTAL ===
      vec3 diffuse = crystalBaseCol * (0.08 + ndotl1 * 0.35 + ndotl2 * 0.15) * illumination;
      vec3 reflective = mix(prismColor * 0.4, vec3(0.9, 0.92, 1.0), 0.3) * fresnel * fresnelIntensity;
      vec3 specCol = vec3(1.0, 0.98, 0.95) * specular * (0.5 + highs * 0.5);

      col = diffuse;
      col += reflective;
      col += specCol;
      col += warmGlow;
      col += causticColor;
      col += fractureColor;
      col += flashColor;

      // Rim glow (prismatic at edges)
      float rimGlow = pow(rimDot, 4.0) * (0.2 + energy * 0.4);
      col += prismColor * rimGlow * 0.3;

      // Space mode: dim everything except one focal crystal
      col *= mix(1.0, 0.4 + 0.6 * smoothstep(2.0, 0.5, length(pos - lookTarget)), singleGlowFocus);

    } else {
      // ========== GEODE WALL MATERIAL ==========

      // Rough stone with embedded mineral sparkle
      float stoneNoise = fbm3(vec3(pos * 3.0 + timeSlow * 0.02));
      vec3 stoneColor = mix(
        vec3(0.06, 0.04, 0.08), // dark geode interior
        vec3(0.12, 0.08, 0.14), // slightly lighter
        stoneNoise
      );

      // Mineral sparkle embedded in wall
      float sparkle = pow(max(0.0, snoise(pos * 20.0 + timeSlow * 0.1)), 12.0);
      vec3 sparkleCol = hsv2rgb(vec3(fract(hue1 + sparkle), 0.6, 0.9)) * sparkle * energy * 0.5;

      // Caustic light projected onto walls from crystals
      float wallCaustic = cvCaustics(pos * 0.7, timeSlow * prismaticSpeed * 0.5);
      vec3 wallCausticCol = hsv2rgb(vec3(
        fract(wallCaustic * 0.5 + hue2),
        0.5 * uPaletteSaturation,
        0.7
      )) * wallCaustic * energy2 * 0.4 * illumination;

      col = stoneColor * (0.15 + ndotl1 * 0.25 + ndotl2 * 0.1);
      col += sparkleCol;
      col += wallCausticCol;

      // Vocal warmth: warm ambient bounce light on walls
      col += vec3(0.08, 0.05, 0.02) * vocalWarmth * 0.3;
    }

    // === SHARED LIGHTING ===
    col *= occl;

    // Beat snap brightness pulse
    float beatKick = uBeatSnap * 0.15 * smoothstep(0.3, 0.7, uBeatConfidence);
    col *= 1.0 + beatKick * (1.0 + climaxBoost * 0.4);

    // Distance fog inside geode (subtle depth cueing)
    float fogDist = totalDist / MAX_DIST;
    vec3 fogCol = mix(vec3(0.02, 0.01, 0.04), vec3(0.04, 0.02, 0.06), energy);
    col = mix(col, fogCol, smoothstep(0.0, 1.0, fogDist * 0.6));

  } else {
    // === MISS: deep geode interior darkness ===
    // Faint ambient glow in the void
    float voidGlow = fbm3(vec3(rd * 2.0 + timeSlow * 0.1));
    col = vec3(0.01, 0.005, 0.02) * (1.0 + voidGlow * 0.3 * energy);
  }

  // === PRISMATIC DUST (climax shatter) ===
  col += cvPrismaticDust(ro + rd * totalDist * 0.5, timeSlow, climaxShatter);

  // === CLIMAX OVERALL BOOST ===
  col *= 1.0 + climaxBoost * 0.4;

  // === DRUM ONSET GLOBAL FLASH ===
  col += vec3(0.08, 0.06, 0.12) * drumOnset * 0.4;

  // === SEMANTIC: psychedelic -> rainbow saturation, cosmic -> depth glow ===
  col *= 1.0 + uSemanticPsychedelic * 0.15;
  col *= 1.0 + uSemanticCosmic * 0.12;

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm3(vec3(screenP * 2.0, timeSlow));
    col += iconEmergence(screenP, uTime, energy, bass, primaryCol, secondaryCol, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, primaryCol, secondaryCol, nf, uSectionIndex);
  }

  // === ATMOSPHERIC DEPTH FOG ===
  float fogNoise = fbm3(vec3(screenP * 0.5, uDynamicTime * 0.01));
  float fogDensity = mix(0.3, 0.05, energy);
  vec3 fogColor = vec3(0.01, 0.005, 0.02);
  col = mix(col, fogColor, fogDensity * (0.4 + fogNoise * 0.4));

  // === POST-PROCESSING ===
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
