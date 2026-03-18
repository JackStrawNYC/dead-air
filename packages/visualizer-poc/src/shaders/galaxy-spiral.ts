/**
 * Galaxy Spiral — overhead spiral galaxy with logarithmic arms, dust lanes,
 * nebula emission, and star density modulation.
 *
 * Visual aesthetic:
 *   - Quiet: gentle rotation, sparse stars, faint dust lanes visible
 *   - Building: arms tighten, star density increases, nebula emission brightens
 *   - Peak: full luminosity, central bulge blazes, arm structure becomes vivid
 *   - Release: rotation slows, arms loosen, dust lanes absorb light
 *
 * Audio reactivity:
 *   uTempo          -> rotation speed
 *   uBass           -> central bulge luminosity
 *   uMids           -> arm definition (tight vs diffuse)
 *   uChromaHue      -> nebula color hue modulation
 *   uMelodicPitch   -> star color temperature (cool blue to warm orange)
 *   uSectionType    -> arm count (verse=2, chorus=4, bridge=3, etc.)
 *   uBeatStability  -> arm regularity (stable=clean grand design, unstable=flocculent)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const galaxySpiralVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const galaxySpiralFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ bloomEnabled: true, halationEnabled: true, grainStrength: "light" })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Hash for star positions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Logarithmic spiral distance: r = a * e^(b * theta)
// Returns how close a point is to the nearest arm
float spiralArm(vec2 p, float armCount, float tightness, float rotation) {
  float r = length(p);
  float theta = atan(p.y, p.x);

  // Logarithmic spiral: theta_arm = ln(r / a) / b
  // We check proximity to the nearest arm for each of armCount arms
  float closestDist = 1.0;

  for (int i = 0; i < 8; i++) {
    if (float(i) >= armCount) break;
    float armOffset = float(i) * TAU / armCount + rotation;

    // Expected angle for this radius on this arm
    float expectedTheta = log(max(r, 0.01) / 0.05) / tightness + armOffset;

    // Angular distance to nearest arm wrap
    float angleDiff = theta - expectedTheta;
    angleDiff = mod(angleDiff + PI, TAU) - PI; // wrap to [-PI, PI]

    // Convert angular distance to spatial distance at this radius
    float dist = abs(angleDiff) * r;
    closestDist = min(closestDist, dist);
  }
  return closestDist;
}

// Star field with density modulation
float starField(vec2 uv, float scale, float densityMask) {
  vec2 id = floor(uv * scale);
  vec2 f = fract(uv * scale) - 0.5;

  float stars = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = id + neighbor;
      float h = hash(cellId);
      // Density threshold modulated by arm proximity
      float threshold = 0.88 - densityMask * 0.25;
      if (h > threshold) {
        vec2 starPos = neighbor + vec2(hash(cellId + 0.1), hash(cellId + 0.2)) - 0.5 - f;
        float d = length(starPos);
        float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + h * 4.0) + h * 200.0);
        float star = smoothstep(0.06, 0.0, d) * twinkle;
        stars += star * (0.3 + h * 0.7);
      }
    }
  }
  return stars;
}

// Dust lane: dark absorption between arms
float dustLane(vec2 p, float armDist, float r) {
  // Dust is strongest between arms at intermediate radii
  float radialMask = smoothstep(0.05, 0.15, r) * smoothstep(0.8, 0.4, r);
  float laneDensity = smoothstep(0.02, 0.08, armDist) * smoothstep(0.2, 0.1, armDist);
  return laneDensity * radialMask;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // Clamp audio inputs
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float sectionType = clamp(uSectionType, 0.0, 7.0);

  float slowTime = uDynamicTime * 0.05;

  // Phase 1 uniform integrations
  float chromaHueMod = uChromaHue * 0.2;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float directionDrift = uMelodicDirection * 0.015;

  // --- Galaxy parameters ---
  // Rotation speed from tempo
  float rotSpeed = uTempo / 120.0 * 0.03;
  float rotation = uDynamicTime * rotSpeed;

  // Arm count from section type (2-6 arms depending on section)
  float armCount = 2.0 + floor(mod(sectionType, 5.0));

  // Arm tightness from mids (higher mids = tighter, more defined arms)
  float tightness = mix(0.15, 0.35, mids);

  // Stability affects arm regularity
  float armNoise = (1.0 - stability) * 0.4;

  // --- Coordinate system ---
  float r = length(p);
  float theta = atan(p.y, p.x);

  // Add slight elliptical tilt for realistic galaxy shape
  vec2 tilted = p * vec2(1.0, 1.15);
  float rTilt = length(tilted);

  // --- Spiral arm density ---
  // Add noise perturbation for flocculent structure when unstable
  vec2 perturbedP = tilted;
  if (armNoise > 0.05) {
    float noiseX = snoise(vec3(tilted * 3.0, slowTime * 0.5)) * armNoise * 0.1;
    float noiseY = snoise(vec3(tilted * 3.0 + 50.0, slowTime * 0.5)) * armNoise * 0.1;
    perturbedP += vec2(noiseX, noiseY);
  }

  float armDist = spiralArm(perturbedP, armCount, tightness, rotation);

  // Arm intensity: Gaussian falloff from arm center
  float armWidth = mix(0.04, 0.08, 1.0 - mids);
  float armIntensity = exp(-armDist * armDist / (2.0 * armWidth * armWidth));

  // --- Central bulge ---
  float bulgeRadius = 0.12 + bass * 0.06;
  float bulge = exp(-rTilt * rTilt / (2.0 * bulgeRadius * bulgeRadius));
  float bulgeLuminosity = (0.6 + bass * 0.8) * bulge;

  // --- Dust lanes ---
  float dust = dustLane(tilted, armDist, rTilt);

  // --- Star layers ---
  // Stars are denser in arms
  float armDensityBoost = armIntensity * 0.8;
  float stars = 0.0;
  vec2 starUv1 = tilted + vec2(rotation * 0.3, rotation * 0.1);
  vec2 starUv2 = tilted * 1.3 + vec2(rotation * 0.2, rotation * 0.15) + 5.0;
  vec2 starUv3 = tilted * 0.7 + vec2(rotation * 0.1, rotation * 0.05) + 10.0;
  stars += starField(starUv1, 40.0, armDensityBoost) * 0.5;
  stars += starField(starUv2, 70.0, armDensityBoost * 0.6) * 0.3;
  stars += starField(starUv3, 120.0, 0.0) * 0.1; // background stars (no arm boost)

  // Star color temperature from melodic pitch (blue=hot to orange=cool)
  vec3 starColorWarm = vec3(1.0, 0.85, 0.6);
  vec3 starColorCool = vec3(0.7, 0.85, 1.0);
  vec3 starTint = mix(starColorCool, starColorWarm, melodicPitch);

  // --- Nebula emission in arms ---
  float nebulaFBM = fbm(vec3(tilted * 4.0 + rotation * 0.5, slowTime * 0.3));
  nebulaFBM = smoothstep(0.1, 0.6, nebulaFBM * 0.5 + 0.5);
  float nebulaIntensity = armIntensity * nebulaFBM * 0.6;

  // Nebula color from palette + chroma hue
  float nebHue = uPalettePrimary + chromaHueMod + chordHue;
  float nebHue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.5, 0.9, energy) * uPaletteSaturation;

  vec3 nebulaColor1 = hsv2rgb(vec3(nebHue, sat * 0.8, 0.6));
  vec3 nebulaColor2 = hsv2rgb(vec3(nebHue2, sat * 0.6, 0.4));
  vec3 nebulaMix = mix(nebulaColor1, nebulaColor2, nebulaFBM);

  // HII regions: bright emission knots in arms
  float hiiNoise = snoise(vec3(tilted * 15.0, slowTime * 0.2));
  float hiiRegions = smoothstep(0.6, 0.8, hiiNoise) * armIntensity;
  vec3 hiiColor = hsv2rgb(vec3(nebHue + 0.05, sat, 1.0));

  // --- Background: deep space ---
  float bgGrad = smoothstep(1.5, 0.0, rTilt);
  vec3 bgColor = hsv2rgb(vec3(uPalettePrimary + 0.15, 0.2, 0.015)) * bgGrad;

  // --- Compose galaxy ---
  vec3 col = bgColor;

  // Arm light (diffuse glow along spiral)
  vec3 armColor = mix(nebulaColor2 * 0.3, nebulaColor1 * 0.5, armIntensity);
  col += armColor * armIntensity * (0.4 + energy * 0.3);

  // Nebula emission
  col += nebulaMix * nebulaIntensity * (0.5 + energy * 0.3);

  // HII regions
  col += hiiColor * hiiRegions * 0.4;

  // Dust absorption (darkens between arms)
  col *= 1.0 - dust * 0.5;

  // Stars (additive)
  col += starTint * stars * (0.6 + energy * 0.4);

  // Central bulge (warm yellow-white core)
  vec3 bulgeColor = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.95, 0.85), bulge);
  col += bulgeColor * bulgeLuminosity;

  // --- Onset: supernova flash in random arm position ---
  float shootAngle = uTime * 0.3 + uSectionIndex * 3.7;
  vec2 novaPos = vec2(cos(shootAngle), sin(shootAngle)) * 0.25;
  float novaDist = length(p - novaPos);
  float nova = exp(-novaDist * novaDist * 80.0) * uOnsetSnap * 1.5;
  col += vec3(1.0, 0.95, 0.9) * nova;

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(nebHue, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(nebHue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.003, 0.01), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;
