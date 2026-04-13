/**
 * Void Light — raymarched 3D void with a single impossible light source.
 * Pure darkness except for one geometric light object (rotating icosahedron)
 * that casts volumetric rays into the infinite void. Dust particles catch
 * the light. The contrast between absolute darkness and pure light.
 *
 * Visual aesthetic:
 *   - Quiet: near-total darkness, faint icosahedron glow, sparse dust
 *   - Building: icosahedron brightens, light rays extend, dust density grows
 *   - Peak: blazing light source, god rays fill the void, dust swirls
 *   - Release: light contracts, rays shorten, dust settles
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           -> light intensity + ray length + dust density
 *   uBass             -> icosahedron scale pulse + low-frequency throb
 *   uMids             -> dust particle mid-field density
 *   uHighs            -> specular sharpness on icosahedron facets
 *   uOnsetSnap        -> light burst flash + sparkle triggers
 *   uBeatSnap         -> icosahedron rotation snap to beat
 *   uSlowEnergy       -> base rotation speed
 *   uClimaxPhase      -> icosahedron shatters into multiple fragments (2+)
 *   uClimaxIntensity  -> shatter spread + additional light sources
 *   uHarmonicTension  -> light color desaturation under tension
 *   uMelodicPitch     -> icosahedron vertical oscillation
 *   uSectionType      -> space=single dim point, jam=spinning fast
 *   uBeatStability    -> rotation smoothness
 *   uVocalPresence    -> warm halo color shift
 *   uCoherence        -> light stability (flicker reduction)
 *   uDynamicRange     -> contrast between lit dust and void
 *   uChromaHue        -> primary light hue
 *   uStemBass         -> deep icosahedron pulse + extra radiance
 *   uShaderHoldProgress -> light evolves: faint ember → full blaze → warm settle
 *   uSemanticPsychedelic -> light fractures into prismatic colors
 *   uSemanticCosmic   -> faint nebula blue undertone in void
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const voidLightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const vlNormalGLSL = buildRaymarchNormal("vlMap($P, icoRadius, time, rotSpeed, beatSnap, beatStability, climaxShatter)", { eps: 0.002, name: "vlNormal" });
const vlAOGLSL = buildRaymarchAO("vlMap($P, icoRadius, time, rotSpeed, beatSnap, beatStability, climaxShatter)", { steps: 5, stepBase: 0.0, stepScale: 0.06, weightDecay: 0.6, finalMult: 4.0, name: "vlAmbientOcclusion" });
const vlDepthAlpha = buildDepthAlphaOutput("marchT", "VL_MAX_DIST");

export const voidLightFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "heavy",
  bloomEnabled: true,
  bloomThresholdOffset: -0.15,
  caEnabled: true,
  halationEnabled: true,
  lensDistortionEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define VL_MAX_STEPS 80
#define VL_MAX_DIST 30.0
#define VL_SURF_DIST 0.002
#define VL_PHI 1.618033988749

// ============================================================
// Utility
// ============================================================
mat2 vlRot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float vlHash(float n) {
  return fract(sin(n) * 43758.5453123);
}

vec3 vlHash3(float n) {
  return vec3(vlHash(n), vlHash(n + 17.3), vlHash(n + 31.7));
}

// ============================================================
// SDF: icosahedron (exact — folding method)
// ============================================================
float vlIcosahedron(vec3 p, float radius) {
  // Golden ratio vertices: project onto icosahedral face normals
  float g = VL_PHI;

  // 6 face normals of the icosahedron (covering all 20 faces via abs)
  vec3 n1 = normalize(vec3(1.0, g, 0.0));
  vec3 n2 = normalize(vec3(-1.0, g, 0.0));
  vec3 n3 = normalize(vec3(0.0, 1.0, g));
  vec3 n4 = normalize(vec3(0.0, 1.0, -g));
  vec3 n5 = normalize(vec3(g, 0.0, 1.0));
  vec3 n6 = normalize(vec3(-g, 0.0, 1.0));

  vec3 ap = abs(p);
  float d = dot(ap, n1);
  d = max(d, dot(ap, n2));
  d = max(d, dot(ap, n3));
  d = max(d, dot(ap, n4));
  d = max(d, dot(ap, n5));
  d = max(d, dot(ap, n6));

  return d - radius;
}

// ============================================================
// SDF: icosahedron with rotation
// ============================================================
float vlRotatedIcosahedron(vec3 p, float radius, float time, float rotSpeed,
                            float beatSnap, float stability) {
  // Multi-axis rotation
  float smoothRot = time * rotSpeed;
  // Beat snap: quantize rotation to beat grid
  float snapAmount = beatSnap * 0.3;
  smoothRot += snapAmount * floor(smoothRot / (PI * 0.5)) * 0.1;

  // Stability: jitter when unstable
  float jitter = (1.0 - stability) * 0.1 * sin(time * 13.0);

  p.xy *= vlRot2(smoothRot + jitter);
  p.yz *= vlRot2(smoothRot * 0.7 + 1.0 + jitter * 0.5);
  p.xz *= vlRot2(smoothRot * 0.3 + 2.0);

  return vlIcosahedron(p, radius);
}

// ============================================================
// Scene SDF: icosahedron (+ fragments at climax)
// ============================================================
float vlMap(vec3 p, float radius, float time, float rotSpeed,
            float beatSnap, float stability, float climaxShatter) {
  float minDist = VL_MAX_DIST;

  // Vertical oscillation from melodic pitch
  float yOff = sin(time * 0.3) * clamp(uMelodicPitch, 0.0, 1.0) * 1.5;

  if (climaxShatter < 0.01) {
    // Single icosahedron
    vec3 icoP = p - vec3(0.0, yOff, 0.0);
    float ico = vlRotatedIcosahedron(icoP, radius, time, rotSpeed, beatSnap, stability);
    minDist = min(minDist, ico);
  } else {
    // Shattered into fragments at Fibonacci-distributed positions
    int fragCount = 3 + int(climaxShatter * 8.0);
    for (int i = 0; i < 12; i++) {
      if (i >= fragCount) break;
      float fi = float(i);
      float seed = fi * 7.31;

      // Fibonacci-distributed outward positions
      float phi = acos(1.0 - 2.0 * (fi + 0.5) / float(fragCount));
      float theta = PI * (1.0 + sqrt(5.0)) * fi;

      vec3 fragPos = vec3(
        sin(phi) * cos(theta),
        sin(phi) * sin(theta),
        cos(phi)
      ) * climaxShatter * 3.0;
      fragPos.y += yOff;

      // Fragment size: smaller than original
      float fragR = radius * mix(0.6, 0.2, climaxShatter) * (0.5 + vlHash(seed) * 0.5);

      vec3 fragP = p - fragPos;
      float frag = vlRotatedIcosahedron(fragP, fragR, time + fi * 0.5, rotSpeed * 1.5, 0.0, 0.5);
      minDist = min(minDist, frag);
    }
  }

  return minDist;
}

${vlNormalGLSL}
${vlAOGLSL}

// ============================================================
// Volumetric god rays from icosahedron
// ============================================================
vec3 vlGodRays(vec3 ro, vec3 rd, float maxT, float lightIntensity,
               vec3 lightColor, float dustDensity, float time,
               float climaxShatter, float dynamicRange) {
  vec3 rays = vec3(0.0);
  vec3 lightPos = vec3(0.0, sin(time * 0.3) * clamp(uMelodicPitch, 0.0, 1.0) * 1.5, 0.0);

  int raySteps = 48;
  float stepSize = min(maxT, 20.0) / float(raySteps);

  for (int i = 0; i < 48; i++) {
    float fi = float(i);
    float marchT = fi * stepSize + 0.1;
    vec3 pos = ro + rd * marchT;

    // Distance from light source
    vec3 toLight = pos - lightPos;
    float distToLight = length(toLight);

    // Radial falloff: inverse square
    float radialFalloff = 1.0 / (1.0 + distToLight * distToLight * 0.15);

    // Directional bias: rays radiate outward from light
    vec3 rayDir = normalize(toLight);
    float dirBias = 1.0 - abs(dot(rd, rayDir)) * 0.3; // slightly favor perpendicular viewing

    // Dust density: noise-based particles in the void
    float dust = fbm3(vec3(pos * 0.8 + time * vec3(0.02, 0.03, 0.01)));
    dust = dust * 0.5 + 0.5;
    dust *= dustDensity;

    // Additional dust swirls at higher energy
    float swirl = snoise(vec3(pos * 2.0 + time * 0.15));
    dust += max(0.0, swirl) * dustDensity * 0.5;

    // Dynamic range sharpens the dust visibility
    dust = mix(dust, pow(dust, 1.5), dynamicRange * 0.5);

    // Depth attenuation
    float depthAtten = exp(-marchT * 0.04);

    // Accumulate
    rays += lightColor * radialFalloff * dust * dirBias * lightIntensity * depthAtten * 0.008;

    // Climax: additional scattered light from fragments
    if (climaxShatter > 0.01) {
      int fragCount = 3 + int(climaxShatter * 8.0);
      for (int f = 0; f < 4; f++) {
        if (f >= fragCount) break;
        float ff = float(f);
        float phi = acos(1.0 - 2.0 * (ff + 0.5) / float(fragCount));
        float theta = PI * (1.0 + sqrt(5.0)) * ff;
        vec3 fragPos = vec3(sin(phi) * cos(theta), sin(phi) * sin(theta), cos(phi)) * climaxShatter * 3.0;
        float fragDist = length(pos - fragPos);
        float fragGlow = climaxShatter / (1.0 + fragDist * fragDist * 0.5);
        rays += lightColor * fragGlow * dust * depthAtten * 0.003;
      }
    }
  }

  return rays;
}

// ============================================================
// Dust mote particles (discrete bright points)
// ============================================================
vec3 vlDustMotes(vec3 ro, vec3 rd, float maxT, float energy,
                  float time, vec3 lightPos, vec3 lightColor) {
  vec3 dust = vec3(0.0);

  for (int i = 0; i < 20; i++) {
    float fi = float(i);
    float seed = fi * 11.37 + 5.71;

    // Mote position: slow 3D brownian drift
    vec3 motePos = vec3(
      sin(seed * 1.3 + time * 0.06) * 6.0,
      cos(seed * 2.7 + time * 0.04) * 4.0,
      sin(seed * 0.7 + time * 0.05) * 6.0
    );

    // Distance from light: motes only visible when lit
    float distFromLight = length(motePos - lightPos);
    float lit = 1.0 / (1.0 + distFromLight * distFromLight * 0.2);

    // Distance from ray
    vec3 toRo = motePos - ro;
    float proj = dot(toRo, rd);
    if (proj < 0.0 || proj > maxT) continue;
    vec3 closest = ro + rd * proj;
    float moteDist = length(closest - motePos);

    // Point glow: very tight falloff
    float moteGlow = lit * energy * exp(-moteDist * moteDist * 300.0);

    // Twinkle: slight flicker per mote
    float twinkle = 0.7 + 0.3 * sin(time * 5.0 + seed * 3.0);
    moteGlow *= twinkle;

    dust += lightColor * moteGlow * 0.5;
  }

  return dust;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float coherence = clamp(uCoherence, 0.0, 2.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float sectionT = uSectionType;

  // === SECTION-TYPE MODULATION ===
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float time = uDynamicTime * 0.2;

  // Hold progress: light evolves from faint ember → full blaze → settling warmth
  float holdBlaze = smoothstep(0.0, 0.5, holdP) * (1.0 - smoothstep(0.85, 1.0, holdP) * 0.3);

  // Icosahedron parameters — stem bass adds deep pulsing throb
  float icoRadius = 0.6 + bass * 0.3 + stemBass * 0.15 + beatPulse(uMusicalTime) * 0.1;
  icoRadius *= 0.8 + holdBlaze * 0.2; // grows over hold
  float rotSpeed = (0.3 + slowEnergy * 0.3) * mix(1.0, 2.0, sJam) * mix(1.0, 0.2, sSpace);
  float climaxShatter = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * uClimaxIntensity;

  // Light intensity — evolves with hold, stem bass adds deep radiance
  float lightIntensity = energy * 3.0 * mix(1.0, 1.3, sChorus) * mix(1.0, 0.3, sSpace);
  lightIntensity *= 0.6 + holdBlaze * 0.4; // hold makes light grow
  lightIntensity += stemBass * 0.5; // deep bass radiates extra light
  lightIntensity *= 0.5 + coherence * 0.5; // flicker when incoherent
  lightIntensity += onset * 2.0; // burst on onset

  // Dust density
  float dustDensity = 0.3 + energy * 0.7 + mids * 0.3;
  dustDensity *= mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);

  // === PALETTE ===
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1;
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  vec3 palColor1 = paletteHueColor(hue1, 0.85, 0.95);
  vec3 palColor2 = paletteHueColor(hue2, 0.85, 0.95);

  // Light color: palette-driven, vocal shifts warm
  vec3 lightColor = mix(palColor1, vec3(1.0, 0.95, 0.85), 0.3);
  lightColor = mix(lightColor, lightColor * vec3(1.1, 0.95, 0.8), vocalPresence * 0.3);
  // Tension desaturates
  float lightLuma = dot(lightColor, vec3(0.299, 0.587, 0.114));
  lightColor = mix(lightColor, vec3(lightLuma), tension * 0.3);

  // === RAY SETUP — cinematic camera choreography ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Hold progress: darkness → ember discovery → full blaze orbit → settle
  // Phase 1 (0.0-0.2): Static, distant — single point of light in void
  // Phase 2 (0.2-0.5): Slow push-in — discovering the light source
  // Phase 3 (0.5-0.8): Orbit around the icosahedron — full exploration
  // Phase 4 (0.8-1.0): Settle into contemplative angle
  float holdPhase1 = smoothstep(0.0, 0.2, holdP);
  float holdPhase2 = smoothstep(0.2, 0.5, holdP);
  float holdPhase3 = smoothstep(0.5, 0.8, holdP);
  float holdPhase4 = smoothstep(0.8, 1.0, holdP);

  float camTime = time * (0.3 + energy * 0.3);
  float camTimeMul = mix(1.0, 1.8, sJam) * mix(1.0, 0.15, sSpace);
  camTime *= camTimeMul;

  // Distance: far → push in → orbit distance → settle close
  float camDist = mix(6.0, 3.5, holdPhase1);
  camDist = mix(camDist, 2.2, holdPhase2);
  camDist = mix(camDist, 2.8, holdPhase3 * (1.0 - holdPhase4));
  camDist += sSpace * 1.5; // space: pull back into void
  camDist -= sJam * 0.5;   // jam: closer engagement

  // Orbit: no orbit initially, then full orbit, then settle
  float orbitActive = holdPhase2 * (1.0 - holdPhase4 * 0.7);
  float orbitAngle = camTime * orbitActive;
  float orbitY = sin(camTime * 0.6) * 0.8 * orbitActive;

  // Elevation: low initially, rises with exploration
  float camElev = mix(0.0, 0.5, holdPhase1) + orbitY;
  camElev += holdPhase4 * 0.3; // settle slightly above

  ro = vec3(
    cos(orbitAngle) * camDist,
    camElev,
    sin(orbitAngle) * camDist
  );

  // Look at the light source with slight breathing
  float yOff = sin(time * 0.3) * melodicPitch * 1.5;
  vec3 lightPos = vec3(0.0, yOff, 0.0);
  vec3 lookTarget = lightPos + vec3(
    sin(camTime * 0.3) * 0.1 * (1.0 - sSpace * 0.9),
    0.0,
    cos(camTime * 0.25) * 0.08
  );
  vec3 camFwd = normalize(lookTarget - ro);
  vec3 camRt = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camUpVec = cross(camRt, camFwd);
  float camFov = mix(0.7, 0.9, energy) + holdPhase3 * 0.1;
  vec2 sp = (uv - 0.5) * aspect;
  rd = normalize(camFwd * camFov + camRt * sp.x + camUpVec * sp.y);

  // === RAYMARCH ===
  float marchT = 0.0;
  bool marchHit = false;
  vec3 marchPos = ro;

  for (int i = 0; i < VL_MAX_STEPS; i++) {
    marchPos = ro + rd * marchT;
    float d = vlMap(marchPos, icoRadius, time, rotSpeed, beatSnap, beatStability, climaxShatter);
    if (d < VL_SURF_DIST) {
      marchHit = true;
      break;
    }
    if (marchT > VL_MAX_DIST) break;
    marchT += d * 0.9;
  }

  // === SHADING ===
  vec3 col = vec3(0.0);

  // Background: absolute void
  vec3 bgCol = vec3(0.005, 0.004, 0.008);

  if (marchHit) {
    vec3 pos = marchPos;
    vec3 norm = vlNormal(pos);

    vec3 viewDir = normalize(ro - pos);
    vec3 lightDir = normalize(lightPos - pos);
    vec3 halfVec = normalize(lightDir + viewDir);

    // === DIFFUSE — blend shared lighting for crossfade continuity ===
    float localDiff = max(dot(norm, lightDir), 0.0);
    vec3 sharedLight = sharedDiffuse(norm);
    float diff = mix(localDiff, dot(sharedLight, vec3(0.333)), 0.3);

    // === SPECULAR (sharp facets) — blend shared specular ===
    float specPow = 64.0 + highs * 256.0;
    float localSpec = pow(max(dot(norm, halfVec), 0.0), specPow);
    vec3 sharedSpec = sharedSpecular(norm, viewDir, specPow);
    float spec = mix(localSpec, dot(sharedSpec, vec3(0.333)), 0.3);

    // === FRESNEL ===
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);

    // === AO ===
    float occl = vlAmbientOcclusion(pos, norm);

    // === MATERIAL: luminous crystal ===
    // The icosahedron IS the light source — it's emissive
    vec3 emissive = lightColor * lightIntensity * 0.5;

    // Facet-dependent color variation via normal direction
    float facetVar = abs(dot(norm, vec3(0.577, 0.577, 0.577)));
    emissive = mix(emissive, emissive * palColor2 * 2.0, facetVar * 0.3);

    // Surface lighting (self-illuminated + external reflection)
    vec3 diffLight = lightColor * diff * 0.3;
    vec3 specLight = vec3(1.0) * spec * 1.5; // bright white specular
    vec3 fresnelLight = palColor2 * fresnel * 0.4;

    col = (emissive + diffLight + specLight + fresnelLight) * occl;

    // Onset: bright flash
    col += lightColor * onset * 3.0;
  } else {
    col = bgCol;
  }

  // === VOLUMETRIC GOD RAYS ===
  col += vlGodRays(ro, rd, min(marchT, VL_MAX_DIST), lightIntensity,
                    lightColor, dustDensity, time, climaxShatter, dynamicRange);

  // === DUST MOTES ===
  col += vlDustMotes(ro, rd, min(marchT, VL_MAX_DIST), energy,
                      time, lightPos, lightColor);

  // === ONSET SPARKLES: brief secondary light points ===
  if (onset > 0.2) {
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float sparkleAngle = fi * VL_PHI * TAU + uMusicalTime * 0.5;
      float sparkleR = 1.0 + fi * 0.5;
      vec3 sparklePos = lightPos + vec3(
        cos(sparkleAngle) * sparkleR,
        sin(sparkleAngle * 0.7) * sparkleR * 0.5,
        sin(sparkleAngle) * sparkleR
      );

      vec3 toSpark = sparklePos - ro;
      float sparkProj = dot(toSpark, rd);
      if (sparkProj < 0.0) continue;
      vec3 sparkClosest = ro + rd * sparkProj;
      float sparkDist = length(sparkClosest - sparklePos);
      float sparkGlow = onset * 0.8 / (1.0 + sparkDist * sparkDist * 150.0);
      col += palColor2 * sparkGlow;
    }
  }

  // === CLIMAX: additional ambient glow when shattered ===
  if (climaxShatter > 0.01) {
    float voidGlow = climaxShatter * energy * 0.20;
    col += lightColor * voidGlow;
  }

  // === SEMANTIC MODULATION ===
  // Psychedelic: light fractures into prismatic colors
  col = mix(col, col * vec3(1.15, 0.9, 1.1), psyche * 0.35);
  // Cosmic: deep void gains faint nebula blue undertone
  col += vec3(0.003, 0.005, 0.015) * cosmic * 0.5;

  // === TONE MAPPING (keep void truly dark) ===
  col = max(col, vec3(0.0));

  // === SDF ICON EMERGENCE ===
  {
    float nf = snoise(vec3(screenP * 2.0, uTime * 0.1));
    col += iconEmergence(screenP, uTime, energy, bass, lightColor, palColor2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, lightColor, palColor2, nf, uSectionIndex);
  }

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, screenP);
  gl_FragColor = vec4(col, 1.0);
  ${vlDepthAlpha}
}
`;
