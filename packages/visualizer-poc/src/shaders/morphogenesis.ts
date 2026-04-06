/**
 * Morphogenesis -- raymarched 3D biological growth.
 * Organic structures growing, branching, and dividing in real time.
 * Microscopic biology: cell division, branching coral growth,
 * neural dendrite formation. Smooth organic SDFs that bud, split,
 * and extend. Bioluminescent internal glow with subsurface scattering.
 *
 * Audio reactivity:
 *   uBass              -> growth pulse (structures breathe and expand)
 *   uEnergy            -> branch complexity / generation count
 *   uDrumOnset         -> cell division event (budding burst)
 *   uVocalPresence     -> bioluminescent warmth (inner glow intensity)
 *   uHarmonicTension   -> organic complexity (simple -> fractal)
 *   uSectionType       -> jam=rapid growth, space=dormant, chorus=full bloom
 *   uClimaxPhase       -> massive branching explosion then retraction
 *   uMelodicPitch      -> tendril reach height
 *   uSlowEnergy        -> overall drift / rotation speed
 *   uSpaceScore        -> dormancy depth
 *   uTimbralBrightness -> specular wetness intensity
 *   uSemanticCosmic    -> bioluminescent color saturation boost
 *   uBeatSnap          -> rhythmic micro-pulse
 *   uDynamicRange      -> branch thickness variation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const morphogenesisVert = /* glsl */ `
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
  grainStrength: "light",
  dofEnabled: true,
  lightLeakEnabled: true,
});

export const morphogenesisFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ============================================================
// Smooth min (polynomial k=0.1) for organic SDF blending
// ============================================================
float mgSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ============================================================
// Rotation matrix around arbitrary axis
// ============================================================
mat3 mgRotAxis(vec3 axis, float angle) {
  float cs = cos(angle);
  float sn = sin(angle);
  float oc = 1.0 - cs;
  return mat3(
    oc * axis.x * axis.x + cs,         oc * axis.x * axis.y - sn * axis.z,  oc * axis.x * axis.z + sn * axis.y,
    oc * axis.y * axis.x + sn * axis.z, oc * axis.y * axis.y + cs,          oc * axis.y * axis.z - sn * axis.x,
    oc * axis.z * axis.x - sn * axis.y, oc * axis.z * axis.y + sn * axis.x, oc * axis.z * axis.z + cs
  );
}

// ============================================================
// Single capsule-like tendril segment
// ============================================================
float mgCapsule(vec3 p, vec3 a, vec3 b, float ra, float rb) {
  vec3 ba = b - a;
  vec3 pa = p - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

// ============================================================
// Organic bud: ellipsoid with noise displacement
// ============================================================
float mgBud(vec3 p, float radius, float noiseAmt, float phase) {
  float dist = length(p) - radius;
  // Organic surface deformation
  float surface = snoise(p * 6.0 + phase * 0.3) * noiseAmt;
  surface += snoise(p * 12.0 - phase * 0.5) * noiseAmt * 0.4;
  return dist + surface;
}

// ============================================================
// Cell membrane: hollow sphere with pulsing wall thickness
// ============================================================
float mgCell(vec3 p, float radius, float wallThick, float pulse) {
  float outer = length(p) - radius * (1.0 + pulse * 0.12);
  float inner = -(length(p) - radius * (1.0 - wallThick));
  float membrane = max(outer, inner);
  // Organic ripple on surface
  float ripple = sin(atan(p.z, p.x) * 8.0 + pulse * 2.0) * 0.02 * radius;
  ripple += sin(acos(clamp(p.y / max(length(p), 0.001), -1.0, 1.0)) * 6.0 - pulse * 1.5) * 0.015 * radius;
  return membrane + ripple;
}

// ============================================================
// Recursive branching structure
// ============================================================
float mgBranch(vec3 p, float flowTime, float complexity, float growthPulse,
               float divisionEvt, float thickness, float generations) {
  float dist = 1e5;

  // Base trunk: vertical capsule
  float trunkH = 0.6 + growthPulse * 0.15;
  float trunkR = 0.08 * thickness;
  dist = mgCapsule(p, vec3(0.0, -0.3, 0.0), vec3(0.0, trunkH, 0.0), trunkR * 1.3, trunkR * 0.7);

  // Central bud at trunk tip
  vec3 budPos = vec3(0.0, trunkH + 0.08, 0.0);
  float budR = 0.1 + growthPulse * 0.04 + divisionEvt * 0.06;
  dist = mgSmin(dist, mgBud(p - budPos, budR, 0.02 + complexity * 0.015, flowTime), 0.06);

  // Generation 1: primary branches (3-5 depending on energy)
  int numBranches = int(3.0 + generations * 2.0);
  for (int i = 0; i < 5; i++) {
    if (i >= numBranches) break;
    float fi = float(i);
    float angle = fi * TAU / float(numBranches) + flowTime * 0.08 + sin(flowTime * 0.15 + fi) * 0.2;
    float elevAngle = 0.5 + complexity * 0.3 + sin(flowTime * 0.12 + fi * 1.7) * 0.15;

    vec3 branchDir = vec3(cos(angle) * sin(elevAngle), cos(elevAngle), sin(angle) * sin(elevAngle));
    float branchLen = 0.35 + growthPulse * 0.1 + complexity * 0.15;
    vec3 branchStart = vec3(0.0, trunkH * (0.5 + fi * 0.1), 0.0);
    vec3 branchEnd = branchStart + branchDir * branchLen;

    float bR = trunkR * (0.7 - fi * 0.08);
    dist = mgSmin(dist, mgCapsule(p, branchStart, branchEnd, bR, bR * 0.4), 0.05);

    // Tip bud on each branch
    float tipBudR = 0.06 + divisionEvt * 0.05 + growthPulse * 0.02;
    dist = mgSmin(dist, mgBud(p - branchEnd, tipBudR, 0.015 + complexity * 0.01, flowTime + fi), 0.04);

    // Generation 2: sub-branches (only when complexity > 0.3)
    if (complexity > 0.3) {
      for (int j = 0; j < 3; j++) {
        float fj = float(j);
        float subAngle = angle + (fj - 1.0) * 0.8 + flowTime * 0.05;
        float subElev = elevAngle + (fj - 1.0) * 0.3;
        vec3 subDir = vec3(cos(subAngle) * sin(subElev), cos(subElev), sin(subAngle) * sin(subElev));
        float subLen = branchLen * (0.4 + complexity * 0.2);
        vec3 subEnd = branchEnd + subDir * subLen;

        float subR = bR * 0.5;
        dist = mgSmin(dist, mgCapsule(p, branchEnd, subEnd, subR, subR * 0.3), 0.035);

        // Tiny buds at sub-branch tips
        dist = mgSmin(dist, mgBud(p - subEnd, 0.03 + divisionEvt * 0.03, 0.01, flowTime + fi + fj), 0.025);
      }
    }
  }

  // Division event: splitting bud pair at top
  if (divisionEvt > 0.1) {
    float spread = divisionEvt * 0.15;
    vec3 divA = budPos + vec3(-spread, 0.05, 0.0);
    vec3 divB = budPos + vec3(spread, 0.05, 0.0);
    float divR = budR * 0.7 * divisionEvt;
    dist = mgSmin(dist, mgBud(p - divA, divR, 0.02, flowTime * 1.5), 0.03);
    dist = mgSmin(dist, mgBud(p - divB, divR, 0.02, flowTime * 1.5 + PI), 0.03);
    // Pinching bridge between dividing cells
    dist = mgSmin(dist, mgCapsule(p, divA, divB, divR * 0.3, divR * 0.3), 0.02);
  }

  return dist;
}

// ============================================================
// Full scene SDF: multiple organisms + floating cells
// ============================================================
float mgMap(vec3 p, float flowTime, float energy, float bass, float complexity,
            float divisionEvt, float growthPulse, float thickness, float generations,
            float climaxBranching) {
  float dist = 1e5;

  // Central organism
  dist = mgBranch(p, flowTime, complexity, growthPulse, divisionEvt, thickness, generations);

  // Secondary organisms (offset, smaller) -- count scales with energy
  int numOrganisms = int(1.0 + energy * 2.0 + climaxBranching * 2.0);
  for (int i = 0; i < 5; i++) {
    if (i >= numOrganisms) break;
    float fi = float(i) + 1.0;
    float orbitAngle = fi * 2.39996 + flowTime * 0.04; // golden angle
    float orbitR = 0.8 + fi * 0.35;
    vec3 offset = vec3(cos(orbitAngle) * orbitR, sin(fi * 1.3) * 0.3, sin(orbitAngle) * orbitR);

    // Rotate each sub-organism uniquely
    vec3 lp = mgRotAxis(normalize(vec3(sin(fi), cos(fi * 0.7), sin(fi * 1.3))), flowTime * 0.06 + fi) * (p - offset);
    float subScale = 0.6 - fi * 0.08;
    float subDist = mgBranch(lp / subScale, flowTime + fi * 3.0, complexity * 0.7, growthPulse, divisionEvt * 0.5, thickness, max(generations - 1.0, 0.0)) * subScale;
    dist = mgSmin(dist, subDist, 0.12);
  }

  // Floating cells / spores in the medium
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float cellPhase = flowTime * 0.08 + fi * 1.1;
    vec3 cellPos = vec3(
      sin(cellPhase * 0.7 + fi * 2.1) * (1.5 + fi * 0.3),
      cos(cellPhase * 0.5 + fi * 1.7) * 0.8 + sin(cellPhase * 0.3) * 0.4,
      cos(cellPhase * 0.6 + fi * 0.9) * (1.2 + fi * 0.2)
    );
    float cellR = 0.06 + sin(cellPhase + fi) * 0.02 + bass * 0.02;
    float wallT = 0.3 + energy * 0.15;
    dist = mgSmin(dist, mgCell(p - cellPos, cellR, wallT, growthPulse + fi), 0.08);
  }

  // Climax: massive extra branching tendrils reaching outward
  if (climaxBranching > 0.1) {
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float cAngle = fi * TAU / 4.0 + flowTime * 0.03;
      vec3 cDir = vec3(cos(cAngle), sin(fi * 0.8) * 0.3, sin(cAngle));
      float cLen = 1.0 + climaxBranching * 0.8;
      float cR = 0.06 + climaxBranching * 0.03;
      dist = mgSmin(dist, mgCapsule(p, vec3(0.0), cDir * cLen, cR, cR * 0.2), 0.1);
      // Climax buds at tendril tips
      dist = mgSmin(dist, mgBud(p - cDir * cLen, 0.08 * climaxBranching, 0.03, flowTime * 2.0 + fi), 0.05);
    }
  }

  return dist;
}

// ============================================================
// Compute normal via central differences
// ============================================================
vec3 mgNormal(vec3 p, float flowTime, float energy, float bass, float complexity,
              float divisionEvt, float growthPulse, float thickness, float generations,
              float climaxBranching) {
  vec2 eps = vec2(0.002, 0.0);
  float d0 = mgMap(p, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching);
  return normalize(vec3(
    mgMap(p + eps.xyy, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching) - d0,
    mgMap(p + eps.yxy, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching) - d0,
    mgMap(p + eps.yyx, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching) - d0
  ));
}

// ============================================================
// Ambient occlusion (4 steps along normal)
// ============================================================
float mgAO(vec3 p, vec3 n, float flowTime, float energy, float bass, float complexity,
           float divisionEvt, float growthPulse, float thickness, float generations,
           float climaxBranching) {
  float occ = 1.0;
  for (int i = 1; i < 5; i++) {
    float fi = float(i);
    float stepDist = 0.08 * fi;
    float sampDist = mgMap(p + n * stepDist, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching);
    occ -= (stepDist - sampDist) * (0.5 / fi);
  }
  return clamp(occ, 0.1, 1.0);
}

// ============================================================
// Subsurface scattering approximation
// ============================================================
vec3 mgSubsurface(vec3 p, vec3 n, vec3 lightDir, vec3 viewDir, vec3 sssColor,
                  float flowTime, float energy, float bass, float complexity,
                  float divisionEvt, float growthPulse, float thickness, float generations,
                  float climaxBranching, float sssIntensity) {
  // Back-face transmission
  float backLit = max(0.0, dot(n, -lightDir));
  // Thickness estimation: march inward
  float inDist = mgMap(p - n * 0.15, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching);
  float thinness = clamp(1.0 - inDist * 6.0, 0.0, 1.0);
  // Forward scattering term
  float scatter = pow(max(0.0, dot(viewDir, -lightDir)), 3.0) * 0.4;
  return sssColor * (backLit * thinness + scatter) * sssIntensity;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === Audio parameters ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float cosmicSemantic = clamp(uSemanticCosmic, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float fluxRate = clamp(uTimbralFlux, 0.0, 1.0);

  // === Section-type modulation ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Growth rate: jam=rapid, space=dormant, chorus=full bloom
  float growthRate = mix(1.0, 2.2, sJam) * mix(1.0, 0.15, sSpace) * mix(1.0, 1.5, sChorus) * mix(1.0, 1.3, sSolo);
  // Dormancy from space score
  growthRate *= mix(1.0, 0.2, smoothstep(0.4, 0.8, spaceScore));

  float flowTime = uDynamicTime * 0.08 * growthRate * (1.0 + slowE * 0.3);

  // === Climax handling ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);
  // Climax: massive branching explosion phase 2, retraction in phase 3
  float climaxExpansion = smoothstep(1.5, 2.5, uClimaxPhase) * clamp(uClimaxIntensity, 0.0, 1.0);
  float climaxRetract = smoothstep(2.5, 3.5, uClimaxPhase) * clamp(uClimaxIntensity, 0.0, 1.0);
  float climaxBranching = climaxExpansion * (1.0 - climaxRetract * 0.7);

  // === Derived scene parameters ===
  float complexity = tension * (1.0 + energy * 0.5) + sJam * 0.2;
  complexity = clamp(complexity, 0.0, 1.0);

  float growthPulse = bass * (1.0 + sChorus * 0.3);
  float divisionEvt = smoothstep(0.3, 0.8, drumOnset) * (1.0 + sJam * 0.5);
  float thickness = 0.8 + dynamicRange * 0.4 + bass * 0.2;
  float generations = energy * (1.0 + sJam * 0.4 + climaxBranching * 0.6);

  // === Palette ===
  float hue1 = hsvToCosineHue(uPalettePrimary);
  vec3 baseTint = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 accentTint = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // Bioluminescent glow color: warm when vocals present
  vec3 bioGlow = mix(
    vec3(0.1, 0.5, 0.9),     // cold bioluminescence (default)
    vec3(0.9, 0.5, 0.15),    // warm bioluminescence (vocal)
    vocalPresence * 0.6
  );
  bioGlow = mix(bioGlow, baseTint, 0.3);
  // Cosmic semantic boost to saturation
  float bioSat = 1.0 + cosmicSemantic * 0.3;

  // Subsurface color: translucent organics
  vec3 sssCol = mix(vec3(0.2, 0.8, 0.4), vec3(0.9, 0.3, 0.5), tension * 0.5 + vocalPresence * 0.3);
  sssCol = mix(sssCol, accentTint, 0.4);

  // === Camera: slow orbit around organisms ===
  float camOrbit = flowTime * 0.3 + sin(flowTime * 0.07) * 0.5;
  float camElev = 0.3 + sin(flowTime * 0.11) * 0.2 + pitch * 0.15;
  float camDist = 2.2 - energy * 0.4 - climaxBranching * 0.3;
  camDist += sSpace * 0.6; // pull back in space sections

  vec3 ro = vec3(
    cos(camOrbit) * camDist,
    camElev + melodicDir * 0.1,
    sin(camOrbit) * camDist
  );
  vec3 lookAt = vec3(0.0, 0.25 + pitch * 0.15, 0.0);
  vec3 fwd = normalize(lookAt - ro);
  vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 upVec = cross(fwd, side);
  float fovVal = 0.9 + energy * 0.1 + climaxBranching * 0.2;
  vec3 rd = normalize(p.x * side + p.y * upVec + fovVal * fwd);

  // === Raymarch ===
  float totalDist = 0.0;
  vec3 marchPos = ro;
  bool marchHit = false;
  int maxSteps = int(mix(48.0, 80.0, energy + climaxBranching * 0.3));

  for (int i = 0; i < 80; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * totalDist;
    float d = mgMap(ps, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching);
    if (d < 0.002) {
      marchPos = ps;
      marchHit = true;
      break;
    }
    if (totalDist > 8.0) break;
    totalDist += d * 0.7;
  }

  // === Shading ===
  vec3 col = vec3(0.0);

  // Background: dark aquatic medium
  vec3 bgCol = mix(vec3(0.01, 0.02, 0.04), vec3(0.02, 0.04, 0.06), uv.y);
  // Subtle background bioluminescent haze
  float bgNoise = fbm3(vec3(p * 1.5, flowTime * 0.05));
  bgCol += bioGlow * bioSat * 0.015 * (0.5 + bgNoise * 0.5) * (0.3 + vocalPresence * 0.4);

  if (marchHit) {
    vec3 norm = mgNormal(marchPos, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching);
    float occlusion = mgAO(marchPos, norm, flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations, climaxBranching);

    // === Lighting ===
    // Key light: above and slightly behind
    vec3 keyLightDir = normalize(vec3(0.3, 1.0, -0.5));
    float diffuse = max(dot(norm, keyLightDir), 0.0);
    float diffuseWrap = max(dot(norm, keyLightDir) * 0.5 + 0.5, 0.0); // wrapped diffuse for soft organics

    // Specular: wet organic surface
    float specPow = 16.0 + timbralBright * 48.0;
    vec3 halfVec = normalize(keyLightDir - rd);
    float specular = pow(max(dot(norm, halfVec), 0.0), specPow);
    // Wet surface fresnel
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);
    float wetSpec = specular * (0.4 + timbralBright * 0.6) + fresnel * 0.15;

    // === Bioluminescent emission ===
    // Internal glow: strongest deep in crevices (inverted AO)
    float creviceGlow = 1.0 - occlusion;
    float bioEmission = creviceGlow * (0.3 + vocalPresence * 0.7 + energy * 0.3);
    // Pulse with bass
    bioEmission *= 1.0 + bass * 0.4 + beatSnap * 0.2;
    // Noise-driven glow variation along surface
    float glowPattern = smoothstep(0.1, 0.6, snoise(marchPos * 4.0 + flowTime * 0.2));
    bioEmission *= 0.5 + glowPattern * 0.8;

    // === Subsurface scattering ===
    vec3 sss = mgSubsurface(marchPos, norm, keyLightDir, rd, sssCol,
                             flowTime, energy, bass, complexity, divisionEvt, growthPulse, thickness, generations,
                             climaxBranching, 0.4 + vocalPresence * 0.3);

    // === Compose surface color ===
    // Base organic color from palette (desaturated)
    float baseColorLuma = dot(baseTint, vec3(0.299, 0.587, 0.114));
    vec3 organicBase = mix(vec3(baseColorLuma) * 0.3, baseTint * 0.4, 0.6 + energy * 0.2);

    // Depth attenuation
    float depthFade = exp(-totalDist * 0.3);

    col = organicBase * (0.04 + diffuseWrap * 0.2) * occlusion;
    col += accentTint * wetSpec * 0.2 * depthFade;
    col += bioGlow * bioSat * bioEmission * 0.35;
    col += sss * 0.5;
    col *= depthFade;

    // Rim light: silhouette glow
    float rimStrength = fresnel * (0.2 + energy * 0.3 + climaxBranching * 0.2);
    col += mix(bioGlow, accentTint, 0.5) * rimStrength * 0.3;

    // Division flash: bright pulse on drum onset
    col += vec3(1.0, 0.95, 0.8) * divisionEvt * 0.15 * depthFade;

    // Timbral flux: micro-shimmer
    float shimmer = sin(snoise(marchPos * 20.0 + flowTime * 3.0) * 10.0) * fluxRate * 0.05;
    col += bioGlow * max(shimmer, 0.0);

  } else {
    col = bgCol;
    // Volumetric medium particles (floating spores in background)
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float sporeT = 0.5 + fi * 0.8;
      if (sporeT > 6.0) break;
      vec3 sporePos = ro + rd * sporeT;
      float sporeDist = length(fract(sporePos * 2.0 + vec3(flowTime * 0.03, flowTime * 0.02, flowTime * 0.04)) - 0.5);
      float sporeGlow = smoothstep(0.08, 0.02, sporeDist) * 0.03;
      col += bioGlow * bioSat * sporeGlow * (0.3 + vocalPresence * 0.4);
    }
  }

  // === Fog / atmospheric scattering in medium ===
  float fogAmount = 1.0 - exp(-totalDist * 0.15);
  vec3 fogColor = mix(bgCol, bioGlow * 0.04, 0.3 + vocalPresence * 0.2);
  col = mix(col, fogColor, fogAmount * 0.6);

  // === Climax boost ===
  col *= 1.0 + climaxIntensity * 0.35;
  col += bioGlow * bioSat * climaxBranching * 0.04;

  // === Beat snap pulse ===
  col *= 1.0 + beatSnap * 0.08;

  // === Chorus bloom: everything blooms warmer ===
  col = mix(col, col * vec3(1.1, 1.05, 0.95), sChorus * 0.3);

  // === Dead iconography ===
  {
    float nf = snoise(vec3(p * 2.0, uTime * 0.1));
    vec3 c1 = baseTint;
    vec3 c2 = accentTint;
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // === Vignette ===
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.008, 0.015), col, vignette);

  // === Post-processing ===
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
