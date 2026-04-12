/**
 * Galaxy Spiral — raymarched 3D volumetric spiral galaxy.
 *
 * Camera orbits a massive spiral galaxy with dust lanes, star clusters,
 * central bulge glow, and logarithmic spiral arm structure. Full volumetric
 * emission rendering with depth, absorption, and self-illumination.
 *
 * Visual aesthetic:
 *   - Quiet: slow orbit, faint arms, gentle bulge glow, sparse stars
 *   - Building: arms sharpen, star clusters brighten, rotation picks up
 *   - Peak: blazing core, vivid dust lanes, supernova flashes in arms
 *   - Release: arms diffuse, orbit slows, deep-space silence
 *
 * Audio reactivity:
 *   uBass            → galaxy rotation speed
 *   uEnergy          → star brightness + arm definition
 *   uDrumOnset       → supernova flash within spiral arm
 *   uVocalPresence   → central bulge glow intensity
 *   uHarmonicTension → arm winding tightness (loose/open vs tight grand-design)
 *   uSectionType     → jam=rapid rotation, space=edge-on tilt, chorus=face-on detail
 *   uClimaxPhase     → galaxy collision/merger (second galaxy appears)
 *   uMelodicPitch    → star color temperature (blue-white hot to amber cool)
 *   uSlowEnergy      → drift speed for dust lane advection
 *   uPalettePrimary  → nebula emission hue in arms
 *   uPaletteSecondary→ secondary emission / star cluster tint
 *   uChromaHue       → color modulation across arms
 *   uChordIndex      → harmonic color shift
 *   uBeatStability   → arm regularity (grand-design vs flocculent)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const galaxySpiralVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.15,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  dofEnabled: true,
});

export const galaxySpiralFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ═══════════════════════════════════════════════════
// Galaxy-specific functions — all prefixed gs*
// ═══════════════════════════════════════════════════

// Hash for star positions and procedural placement
float gsHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float gsHash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// Logarithmic spiral arm distance field.
// Returns proximity (0 = on arm, 1 = far from arm) for a point in the galaxy plane.
// armCount: number of spiral arms, tightness: winding parameter, rotation: angular offset
float gsArm(vec2 planePos, float armCount, float tightness, float rotation) {
  float radius = length(planePos);
  float theta = atan(planePos.y, planePos.x);

  float closestDist = 1.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= armCount) break;
    float armOffset = float(i) * TAU / armCount + rotation;
    // Logarithmic spiral: theta_arm = ln(r / a) / b + offset
    float expectedTheta = log(max(radius, 0.01) / 0.05) / tightness + armOffset;
    float angleDiff = mod(theta - expectedTheta + PI, TAU) - PI;
    float dist = abs(angleDiff) * radius;
    closestDist = min(closestDist, dist);
  }
  return closestDist;
}

// Galaxy plane density — samples the spiral structure at a 3D point
// projected onto the galactic plane with vertical falloff.
// Returns density in [0, 1] range.
float gsDensity(vec3 pos, float armCount, float tightness, float rotation,
                float armNoise, float flowTime) {
  // Vertical (Y-axis) density falloff — galaxy is a thin disk
  float diskThickness = 0.15;
  float verticalFalloff = exp(-pos.y * pos.y / (2.0 * diskThickness * diskThickness));

  // Project to galactic plane for arm structure
  vec2 planePos = pos.xz;

  // Flocculent perturbation when beat stability is low
  if (armNoise > 0.05) {
    float nx = snoise(vec3(planePos * 2.5, flowTime * 0.3)) * armNoise * 0.12;
    float ny = snoise(vec3(planePos * 2.5 + 50.0, flowTime * 0.3)) * armNoise * 0.12;
    planePos += vec2(nx, ny);
  }

  float armDist = gsArm(planePos, armCount, tightness, rotation);

  // Gaussian arm profile
  float armWidth = 0.08;
  float armIntensity = exp(-armDist * armDist / (2.0 * armWidth * armWidth));

  // Inter-arm FBM detail (nebula clumps within arms)
  float detail = fbm3(vec3(planePos * 6.0, flowTime * 0.1)) * 0.5 + 0.5;
  detail = smoothstep(0.2, 0.7, detail);

  float density = armIntensity * detail * verticalFalloff;

  // Central bulge (3D Gaussian centered at origin)
  float bulgeRadius = length(pos);
  float bulge = exp(-bulgeRadius * bulgeRadius / (2.0 * 0.25 * 0.25));
  density += bulge * 0.6;

  return clamp(density, 0.0, 1.0);
}

// Dust lane absorption — dark bands between and along spiral arms.
// Returns absorption factor (0 = no dust, 1 = fully absorbed).
float gsDust(vec3 pos, float armCount, float tightness, float rotation, float flowTime) {
  vec2 planePos = pos.xz;
  float radius = length(planePos);
  float armDist = gsArm(planePos, armCount, tightness, rotation);

  // Dust lives between arms at intermediate radii
  float radialMask = smoothstep(0.1, 0.3, radius) * smoothstep(2.0, 1.0, radius);
  float laneDensity = smoothstep(0.03, 0.1, armDist) * smoothstep(0.25, 0.12, armDist);

  // Vertical confinement — dust disk is thinner than star disk
  float dustVertical = exp(-pos.y * pos.y / (2.0 * 0.06 * 0.06));

  // FBM modulation for filamentary dust structure
  float dustNoise = fbm3(vec3(planePos * 4.0 + flowTime * 0.05, pos.y * 2.0)) * 0.5 + 0.5;

  return laneDensity * radialMask * dustVertical * dustNoise;
}

// Star cluster field — returns brightness of stars at a 3D position.
// Stars are denser in arms and in the bulge.
float gsStarCluster(vec3 pos, float armDensity) {
  vec3 cellCoord = floor(pos * 12.0);
  vec3 cellFrac = fract(pos * 12.0) - 0.5;
  float cellHash = gsHash3(cellCoord);

  // Density threshold: lower in arms (more stars), higher between arms
  float threshold = 0.92 - armDensity * 0.2;
  if (cellHash < threshold) return 0.0;

  // Star position within cell
  vec3 starOffset = vec3(
    gsHash3(cellCoord + 0.1),
    gsHash3(cellCoord + 0.2),
    gsHash3(cellCoord + 0.3)
  ) - 0.5;
  float dist = length(cellFrac - starOffset * 0.4);

  // Point-like brightness with size variation
  float size = 0.02 + cellHash * 0.03;
  float brightness = smoothstep(size, 0.0, dist) * (0.4 + cellHash * 0.6);

  return brightness;
}

// Supernova flash — bright emission event at a specific arm location
vec3 gsSupernova(vec3 pos, float onset, float time, float sectionIdx) {
  if (onset < 0.01) return vec3(0.0);

  // Position the nova within an arm using time + section as seed
  float novaAngle = time * 0.2 + sectionIdx * 3.7;
  float novaRadius = 0.5 + sin(sectionIdx * 7.3) * 0.3;
  vec3 novaCenter = vec3(cos(novaAngle) * novaRadius, 0.0, sin(novaAngle) * novaRadius);

  float dist = length(pos - novaCenter);
  float flash = exp(-dist * dist * 15.0) * onset;

  // White-hot core with warm falloff
  vec3 novaColor = mix(vec3(1.0, 0.7, 0.3), vec3(1.0, 0.98, 0.95), exp(-dist * 8.0));
  return novaColor * flash * 2.0;
}

// Galaxy collision/merger — second galaxy appears during climax.
// Returns emission from the merging galaxy volume.
vec3 gsMerger(vec3 pos, float mergerProgress, float flowTime, vec3 tintColor) {
  if (mergerProgress < 0.01) return vec3(0.0);

  // Second galaxy approaches from upper-right, tilted
  float approach = mix(4.0, 0.8, mergerProgress);
  vec3 offset = vec3(approach, approach * 0.3, approach * 0.5);
  vec3 mergerPos = pos - offset;

  // Rotate the merger galaxy 40 degrees around Y
  float cAngle = 0.766; // cos(40 deg)
  float sAngle = 0.643; // sin(40 deg)
  mergerPos = vec3(
    mergerPos.x * cAngle - mergerPos.z * sAngle,
    mergerPos.y,
    mergerPos.x * sAngle + mergerPos.z * cAngle
  );

  // Simplified density for merger (fewer arms, less detail)
  float diskFalloff = exp(-mergerPos.y * mergerPos.y / (2.0 * 0.12 * 0.12));
  float radius = length(mergerPos.xz);
  float mergerArm = gsArm(mergerPos.xz, 2.0, 0.25, flowTime * 0.04);
  float armGlow = exp(-mergerArm * mergerArm / (2.0 * 0.1 * 0.1));

  float mergerBulge = exp(-length(mergerPos) * length(mergerPos) / (2.0 * 0.2 * 0.2));

  float density = (armGlow * 0.5 + mergerBulge * 0.8) * diskFalloff;
  density *= smoothstep(2.5, 0.0, radius); // fade at edge

  // Tidal streams: stretched material between galaxies
  vec3 bridgePos = pos - offset * 0.5;
  float bridgeDist = length(bridgePos.xz);
  float bridge = exp(-bridgeDist * bridgeDist * 2.0) * exp(-bridgePos.y * bridgePos.y * 8.0);
  float bridgeNoise = fbm3(vec3(bridgePos * 3.0 + flowTime * 0.1));
  bridge *= smoothstep(-0.2, 0.3, bridgeNoise);

  vec3 emission = tintColor * density * mergerProgress * 0.6;
  emission += tintColor * vec3(0.8, 0.6, 1.0) * bridge * mergerProgress * 0.3;

  return emission;
}

// Camera orbit for the galaxy — determines view angle based on audio
void gsCamera(float time, float bassVal, float sJam, float sSpace, float sChorus,
              float climaxMerge, out vec3 camOrigin, out vec3 camLookAt) {

  // Base orbit: slow rotation around the galaxy
  float orbitSpeed = 0.02 + bassVal * 0.03 + sJam * 0.04;
  float orbitAngle = time * orbitSpeed;

  // Orbit radius: pull back during merger for wider view
  float orbitRadius = mix(3.0, 4.5, climaxMerge);

  // Elevation angle: face-on for chorus, edge-on for space, 45deg default
  float elevation = mix(0.6, 1.2, sChorus);         // chorus: high overhead
  elevation = mix(elevation, 0.1, sSpace);           // space: nearly edge-on
  elevation = mix(elevation, 0.8, sJam * 0.5);       // jam: moderately high

  camOrigin = vec3(
    cos(orbitAngle) * orbitRadius * cos(elevation),
    sin(elevation) * orbitRadius,
    sin(orbitAngle) * orbitRadius * cos(elevation)
  );

  // Look at galactic center (with slight offset during merger)
  camLookAt = vec3(0.0, 0.0, 0.0) + vec3(0.3, 0.1, 0.2) * climaxMerge;
}

// Emission color for spiral arm material at a given position
vec3 gsArmEmission(vec3 pos, float armDensity, float flowTime,
                   vec3 primaryTint, vec3 secondaryTint, float energyVal) {
  // HII regions: bright emission knots scattered through arms
  float hiiNoise = snoise(vec3(pos.xz * 12.0, flowTime * 0.15));
  float hiiRegion = smoothstep(0.55, 0.8, hiiNoise) * armDensity;

  // Base arm color: blend primary and secondary by FBM
  float colorMix = fbm3(vec3(pos.xz * 3.0, flowTime * 0.08)) * 0.5 + 0.5;
  vec3 armColor = mix(primaryTint * 0.6, secondaryTint * 0.8, colorMix);

  // HII emission: brighter, more saturated
  vec3 hiiColor = primaryTint * 1.4;
  armColor = mix(armColor, hiiColor, hiiRegion);

  // Self-illumination: denser regions glow more
  armColor *= 0.4 + armDensity * 0.8 + energyVal * 0.4;

  return armColor;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ═══════════════════════════════════════════════════
  // Audio clamping
  // ═══════════════════════════════════════════════════
  float energyVal = clamp(uEnergy, 0.0, 1.0);
  float bassVal = clamp(uBass, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float harmonicTension = clamp(uHarmonicTension, 0.0, 1.0);
  float sectionType = clamp(uSectionType, 0.0, 7.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.15;
  float chordHueShift = float(int(uChordIndex)) / 24.0 * 0.1;

  float flowTime = uDynamicTime * (0.03 + slowEnergy * 0.02);

  // ═══════════════════════════════════════════════════
  // Section-type gates
  // ═══════════════════════════════════════════════════
  float sJam = smoothstep(4.5, 5.5, sectionType) * (1.0 - step(5.5, sectionType));
  float sSpace = smoothstep(6.5, 7.5, sectionType);
  float sChorus = smoothstep(1.5, 2.5, sectionType) * (1.0 - step(2.5, sectionType));
  float sSolo = smoothstep(3.5, 4.5, sectionType) * (1.0 - step(4.5, sectionType));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // ═══════════════════════════════════════════════════
  // Galaxy parameters
  // ═══════════════════════════════════════════════════

  // Rotation speed: bass-driven + section modulation
  float rotSpeed = 0.02 + bassVal * 0.04 + sJam * 0.06;
  float rotation = uDynamicTime * rotSpeed;

  // Arm count: 2 primary + section variation
  float armCount = 2.0 + sChorus * 2.0 + sSolo * 1.0;

  // Arm winding tightness: harmonic tension drives it
  float tightness = mix(0.18, 0.40, harmonicTension);

  // Arm noise (flocculent structure) from beat instability
  float armNoise = (1.0 - stability) * 0.5;

  // ═══════════════════════════════════════════════════
  // Palette
  // ═══════════════════════════════════════════════════
  float hue1 = uPalettePrimary + chromaHueMod + chordHueShift;
  vec3 primaryTint = paletteHueColor(hue1, 0.85, 0.95);

  float hue2 = uPaletteSecondary + chordHueShift * 0.5;
  vec3 secondaryTint = paletteHueColor(hue2, 0.85, 0.95);

  // ═══════════════════════════════════════════════════
  // Camera setup — custom orbit, not using setupCameraRay
  // because we need section-aware viewing angles
  // ═══════════════════════════════════════════════════
  float climaxMerge = smoothstep(1.5, 3.0, uClimaxPhase) * clamp(uClimaxIntensity, 0.0, 1.0);

  vec3 camOrigin, camLookAt;
  gsCamera(uDynamicTime, bassVal, sJam, sSpace, sChorus, climaxMerge, camOrigin, camLookAt);

  // Build ray from camera
  vec3 camForward = normalize(camLookAt - camOrigin);
  vec3 camSide = normalize(cross(camForward, vec3(0.0, 1.0, 0.0)));
  vec3 camUp = cross(camSide, camForward);
  float fovScale = tan(radians(mix(40.0, 55.0, climaxMerge)) * 0.5);
  vec2 screenCoord = (uv - 0.5) * aspect;
  vec3 rayDir = normalize(camForward + camSide * screenCoord.x * fovScale + camUp * screenCoord.y * fovScale);
  vec3 rayOrigin = camOrigin;

  // ═══════════════════════════════════════════════════
  // Volumetric raymarch — emission + absorption model
  // ═══════════════════════════════════════════════════
  int stepCount = int(mix(32.0, 96.0, smoothstep(0.2, 0.6, energyVal)));
  float stepSize = 0.1;
  float maxDist = 8.0;

  vec3 galaxyAccum = vec3(0.0);
  float galaxyAlpha = 0.0;
  float totalStars = 0.0;

  for (int stepIdx = 0; stepIdx < 80; stepIdx++) {
    if (stepIdx >= stepCount) break;
    if (galaxyAlpha > 0.96) break;

    float marchT = 0.3 + float(stepIdx) * stepSize;
    if (marchT > maxDist) break;
    vec3 samplePos = rayOrigin + rayDir * marchT;

    // ─── Galaxy density ───
    float density = gsDensity(samplePos, armCount, tightness, rotation,
                              armNoise, flowTime);

    // Energy boosts overall brightness
    density *= 0.8 + energyVal * 0.5;

    // ─── Dust absorption ───
    float dustAbsorb = gsDust(samplePos, armCount, tightness, rotation, flowTime);
    float transmittance = 1.0 - dustAbsorb * 0.6;

    // ─── Star clusters ───
    float starBrightness = gsStarCluster(samplePos, density);
    // Star color temperature from melodic pitch
    vec3 starWarm = vec3(1.0, 0.85, 0.6);
    vec3 starCool = vec3(0.7, 0.85, 1.0);
    vec3 starColor = mix(starCool, starWarm, melodicPitch);
    totalStars += starBrightness * (1.0 - galaxyAlpha) * transmittance;

    if (density > 0.001) {
      float sampleAlpha = density * stepSize * 2.0 * (1.0 - galaxyAlpha);
      sampleAlpha = min(sampleAlpha, 0.08);

      // ─── Emission color ───
      vec3 emission = gsArmEmission(samplePos, density, flowTime,
                                     primaryTint, secondaryTint, energyVal);

      // Central bulge glow — warm white, vocal-presence driven
      float bulgeDist = length(samplePos);
      float bulgeGlow = exp(-bulgeDist * bulgeDist / (2.0 * 0.2 * 0.2));
      vec3 bulgeColor = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.95, 0.85), bulgeGlow);
      float bulgeStrength = bulgeGlow * (0.5 + vocalPresence * 1.0);
      emission += bulgeColor * bulgeStrength;

      // Depth coloring: cool toward far regions
      float depthFade = float(stepIdx) / float(stepCount);
      emission = mix(emission, emission * vec3(0.7, 0.75, 1.0), depthFade * 0.3);

      // Apply dust absorption
      emission *= transmittance;

      // ─── Supernova flash ───
      emission += gsSupernova(samplePos, drumOnset, uTime, uSectionIndex);

      galaxyAccum += emission * sampleAlpha;
      galaxyAlpha += sampleAlpha;
    }

    // Stars accumulate even in low-density regions
    if (starBrightness > 0.01) {
      vec3 starContrib = starColor * starBrightness * transmittance * (1.0 - galaxyAlpha);
      galaxyAccum += starContrib * (0.4 + energyVal * 0.4) * stepSize;
    }
  }

  vec3 col = galaxyAccum;

  // ═══════════════════════════════════════════════════
  // Background: deep space + distant star field
  // ═══════════════════════════════════════════════════
  {
    // Hash-based background stars
    vec3 bgCell = floor(rayDir * 30.0);
    float bgHash = gsHash3(bgCell);
    float bgStar = step(0.96, bgHash) * smoothstep(0.04, 0.0, length(fract(rayDir * 30.0) - 0.5));
    vec3 bgStarColor = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.8), bgHash);
    float twinkle = 0.6 + 0.4 * sin(uTime * (2.0 + bgHash * 5.0) + bgHash * 100.0);
    vec3 bgColor = vec3(0.005, 0.004, 0.012);
    bgColor += bgStarColor * bgStar * twinkle * 0.3;

    // Blend background behind galaxy volume
    col = mix(bgColor, col, galaxyAlpha);
  }

  // ═══════════════════════════════════════════════════
  // Galaxy merger during climax
  // ═══════════════════════════════════════════════════
  if (climaxMerge > 0.01) {
    vec3 mergerEmission = vec3(0.0);
    float mergerSteps = 24.0;
    for (int mStep = 0; mStep < 24; mStep++) {
      float mT = 0.5 + float(mStep) * 0.2;
      vec3 mPos = rayOrigin + rayDir * mT;
      mergerEmission += gsMerger(mPos, climaxMerge, flowTime, secondaryTint) * 0.04;
    }
    col += mergerEmission;
  }

  // ═══════════════════════════════════════════════════
  // Climax + beat accents
  // ═══════════════════════════════════════════════════
  col *= 1.0 + climaxIntensity * 0.3;
  col *= 1.0 + uBeatSnap * 0.08 * (1.0 + climaxIntensity * 0.2);

  // Semantic: cosmic amplification
  col *= 1.0 + uSemanticCosmic * 0.15;
  // Semantic: psychedelic hue shift
  if (uSemanticPsychedelic > 0.2) {
    vec3 shifted = col.gbr * 0.3 + col * 0.7;
    col = mix(col, shifted, (uSemanticPsychedelic - 0.2) * 0.3);
  }

  // ═══════════════════════════════════════════════════
  // SDF icon emergence
  // ═══════════════════════════════════════════════════
  {
    float nf = snoise(vec3(screenP * 2.0, uTime * 0.1));
    col += iconEmergence(screenP, uTime, energyVal, bassVal,
                         primaryTint, secondaryTint, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energyVal, bassVal,
                             primaryTint, secondaryTint, nf, uSectionIndex);
  }

  // ═══════════════════════════════════════════════════
  // Post-processing
  // ═══════════════════════════════════════════════════
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, screenP);
  gl_FragColor = vec4(col, 1.0);
}
`;
