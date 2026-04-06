/**
 * Reaction-Diffusion Cavern — raymarched 3D cave system with Turing-pattern
 * relief sculpture on the walls. Bioluminescent organisms grow in the RD
 * pattern veins, creating glowing organic networks along the rock surface.
 *
 * The cave tunnel is a deformed cylinder sculpted by layered FBM. The walls
 * carry reaction-diffusion Turing patterns (spots/stripes/labyrinths) as
 * displacement relief. Bioluminescent emission lights the scene from within
 * the pattern veins — no external light source. Volumetric fog adds depth.
 *
 * Visual aesthetic:
 *   - Quiet: dim cave, dormant patterns, faint blue-green glow in deep veins
 *   - Building: patterns pulse brighter, fog rolls in, vein networks spread
 *   - Peak: full bioluminescent bloom, entire cave lit from within
 *   - Climax: patterns erupt from walls as floating luminous particles
 *
 * Audio reactivity:
 *   uBass             -> pattern pulse / cave breathing (walls contract/expand)
 *   uEnergy           -> pattern density / glow brightness
 *   uDrumOnset        -> pattern growth burst (sudden vein expansion)
 *   uVocalPresence    -> bioluminescent warmth (shifts glow toward amber)
 *   uHarmonicTension  -> pattern type (spots vs stripes vs labyrinth)
 *   uSectionType      -> jam=rapid growth, space=dormant/dim, chorus=full bloom
 *   uClimaxPhase      -> patterns erupt from walls as floating light particles
 *   uSlowEnergy       -> fog density / cave drift speed
 *   uOnsetSnap        -> ripple pulse through cave walls
 *   uBeatStability    -> pattern regularity (high=geometric, low=organic chaos)
 *   uMelodicDirection -> cave path curvature bias
 *   uMelodicPitch     -> glow color temperature shift
 *   uChordIndex       -> hue modulation of bioluminescent palette
 *   uCoherence        -> pattern lock vs organic chaos
 *   uTimbralBrightness-> specular highlight intensity on wet rock
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const reactionDiffusionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  temporalBlendEnabled: true,
});

export const reactionDiffusionFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 20.0
#define SURF_DIST 0.002

// ─── Reaction-Diffusion Pattern (Turing approximation) ───
// Produces spots, stripes, or labyrinth patterns based on feed/kill analogs.
// Three nested FBM layers at different scales approximate Gray-Scott dynamics.
float rd2Pattern(vec3 pos, float tension, float stability, float energy, float time) {
  // Feed/kill analogs control pattern morphology
  float feed = 0.03 + energy * 0.04;
  float kill = 0.05 + tension * 0.04;

  // Domain warp for organic flow
  vec3 warpedPos = pos;
  float warpAmt = 0.6 * mix(0.5, 1.0, 1.0 - stability);
  warpedPos.xy += vec2(
    fbm3(vec3(pos.xy * 1.2, time * 0.3)),
    fbm3(vec3(pos.xy * 1.2 + 5.2, time * 0.3 + 1.3))
  ) * warpAmt;

  // Layer 1: low-frequency base (spots/blobs)
  float low = fbm6(vec3(warpedPos.xy * 3.0, time * 0.15));

  // Layer 2: mid-frequency detail (connecting structures)
  float mid = fbm6(vec3(warpedPos.xy * 6.0 + 10.0, time * 0.25 + 3.7));

  // Layer 3: high-frequency micro-texture
  float hi = fbm3(vec3(warpedPos.xy * 12.0 + mid * 0.3, time * 0.4 + 7.1));

  // Combined base pattern
  float combined = low * 0.55 + mid * 0.3 + hi * 0.15;

  // Stripe tendency via directional derivative
  float dx = fbm6(vec3(warpedPos.xy * 3.0 + vec2(0.01, 0.0), time * 0.15)) - low;
  float stripePattern = sin((combined + dx * 10.0) * PI * 3.0) * 0.5 + 0.5;

  // Morph between spots and stripes via kill rate (tension)
  float pattern = mix(combined, stripePattern, clamp(kill * 8.0 - 0.4, 0.0, 1.0));

  // Threshold into distinct cell boundaries
  float threshold = 0.5 - feed * 4.0;
  float sharpness = mix(0.12, 0.03, stability);
  float cellMask = smoothstep(threshold - sharpness, threshold + sharpness, pattern);

  return cellMask;
}

// ─── Cave Tunnel SDF ───
// Infinite tube deformed by layered noise, with RD-pattern wall displacement.
float rd2Cave(vec3 pos, float bass, float energy, float tension, float stability, float time) {
  // Base tube: cylinder along Z axis
  float tubeRadius = 1.8 + bass * 0.3;

  // Large-scale cave shape deformation (stalactites, chambers)
  float largeDef = fbm3(vec3(pos.z * 0.15, pos.x * 0.2, time * 0.02)) * 0.8;
  // Medium deformation for alcoves and narrows
  float medDef = fbm3(vec3(pos.z * 0.4, pos.y * 0.3 + 20.0, time * 0.03)) * 0.35;

  // Radial distance from deformed center
  vec2 center = vec2(
    sin(pos.z * 0.12 + largeDef) * 0.6,
    cos(pos.z * 0.09 + medDef) * 0.4
  );
  float radDist = length(pos.xy - center);

  // Base cave wall
  float cave = radDist - tubeRadius - largeDef - medDef;

  // RD-pattern displacement: Turing patterns carved INTO the rock surface
  float rdScale = mix(0.08, 0.2, energy);
  float rdPat = rd2Pattern(pos * 0.8, tension, stability, energy, time);
  cave += rdPat * rdScale;

  // Rock roughness: small-scale bump for realism
  float roughness = fbm3(vec3(pos * 4.0 + 100.0)) * 0.03;
  cave += roughness;

  return -cave; // invert: inside the cave is negative
}

// ─── Bioluminescent Glow Field ───
// Returns glow intensity at a point based on RD pattern presence.
// Glow lives IN the Turing pattern veins (where cellMask is high).
float rd2Glow(vec3 pos, float energy, float tension, float stability, float time,
              float sChorus, float sSpace, float drumOnset) {
  float rdPat = rd2Pattern(pos * 0.8, tension, stability, energy, time);

  // Edge glow: brightest at pattern boundaries
  float edge = smoothstep(0.3, 0.5, rdPat) * smoothstep(0.7, 0.5, rdPat);
  // Core glow: inside the pattern veins
  float core = smoothstep(0.5, 0.7, rdPat);

  float glow = edge * 0.7 + core * 0.4;

  // Energy drives overall brightness
  glow *= mix(0.15, 1.0, energy);

  // Chorus: full bloom
  glow *= 1.0 + sChorus * 0.8;
  // Space: dormant
  glow *= mix(1.0, 0.15, sSpace);

  // Drum onset: growth burst (flash of brightness)
  glow += drumOnset * 0.5 * core;

  // Pulsing breath driven by slow time
  glow *= 0.85 + 0.15 * sin(time * 1.5 + pos.z * 0.8);

  return clamp(glow, 0.0, 2.0);
}

// ─── Floating Particle Field (Climax eruption) ───
// Particles that detach from walls during climax moments.
float rd2Particles(vec3 pos, float climaxIntensity, float time, float bass) {
  if (climaxIntensity < 0.01) return 0.0;

  float accum = 0.0;
  // 6 particle clusters erupting from walls
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = fi * 1.618;

    // Particle origin: on the cave walls, drifting inward
    vec3 particlePos = vec3(
      sin(seed * 3.7 + time * 0.3) * (1.3 - climaxIntensity * 0.5),
      cos(seed * 2.3 + time * 0.4) * (1.3 - climaxIntensity * 0.5),
      pos.z + sin(seed * 5.1 + time * 0.7) * 2.0
    );

    float dist = length(pos - particlePos);
    float particle = smoothstep(0.15 + bass * 0.05, 0.0, dist);
    accum += particle;
  }

  return accum * climaxIntensity;
}

// ─── Scene SDF (distance function for raymarcher) ───
float rd2Map(vec3 pos, float bass, float energy, float tension, float stability, float time) {
  return rd2Cave(pos, bass, energy, tension, stability, time);
}

// ─── Normal Estimation via Central Differences ───
vec3 rd2Normal(vec3 pos, float bass, float energy, float tension, float stability, float time) {
  float eps = 0.005;
  float d = rd2Map(pos, bass, energy, tension, stability, time);
  return normalize(vec3(
    rd2Map(pos + vec3(eps, 0.0, 0.0), bass, energy, tension, stability, time) - d,
    rd2Map(pos + vec3(0.0, eps, 0.0), bass, energy, tension, stability, time) - d,
    rd2Map(pos + vec3(0.0, 0.0, eps), bass, energy, tension, stability, time) - d
  ));
}

// ─── Ambient Occlusion (5-sample) ───
float rd2AmbientOcclusion(vec3 pos, vec3 norm, float bass, float energy, float tension,
                          float stability, float time) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.02 + 0.12 * float(i);
    float d = rd2Map(pos + norm * h, bass, energy, tension, stability, time);
    occ += (h - d) * sca;
    sca *= 0.65;
  }
  return clamp(1.0 - 2.5 * occ, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO PARAMETERS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float coherence = clamp(uCoherence, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxIntensity = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // === TIME ===
  float flowTime = uDynamicTime * 0.06
    * (1.0 + uPeakApproaching * 0.3)
    * mix(1.0, 1.6, sJam)
    * mix(1.0, 0.3, sSpace);

  // === PALETTE ===
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;
  float hue1 = uPalettePrimary + uChromaHue * 0.2 + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;

  // Bioluminescent base colors: blue-green shifted by palette
  vec3 glowColorPrimary = hsv2rgb(vec3(fract(hue1 + 0.5), 0.7 + energy * 0.2, 0.8 + energy * 0.2));
  vec3 glowColorSecondary = hsv2rgb(vec3(fract(hue2 + 0.55), 0.6 + energy * 0.2, 0.6 + energy * 0.3));

  // Vocal presence shifts glow toward warm amber
  vec3 warmShift = vec3(1.0, 0.7, 0.3);
  glowColorPrimary = mix(glowColorPrimary, warmShift * 0.9, vocalPresence * 0.35);
  glowColorSecondary = mix(glowColorSecondary, warmShift * 0.7, vocalPresence * 0.2);

  // Melodic pitch: higher pitch = cooler glow, lower = warmer
  float pitchTemp = melodicPitch * 0.15;
  glowColorPrimary = mix(glowColorPrimary, glowColorPrimary * vec3(0.8, 0.9, 1.2), pitchTemp);

  // Cave rock colors
  vec3 rockColorDark = hsv2rgb(vec3(fract(hue1 + 0.08), 0.2, 0.04));
  vec3 rockColorLight = hsv2rgb(vec3(fract(hue1 + 0.06), 0.3, 0.12));

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Camera travels through the cave tunnel
  float caveZ = uDynamicTime * 0.3 * mix(1.0, 1.5, sJam) * mix(1.0, 0.5, sSpace);
  ro.z += caveZ;

  // Melodic direction biases camera path curvature
  ro.x += sin(caveZ * 0.08) * 0.4 + melodicDir * 0.15;
  ro.y += cos(caveZ * 0.06) * 0.25;

  // Onset snap: camera micro-shake
  ro.xy += vec2(
    sin(uTime * 47.0) * onsetSnap * 0.04,
    cos(uTime * 53.0) * onsetSnap * 0.03
  );

  // === RAYMARCH ===
  float totalDist = 0.0;
  float marchResult = -1.0;
  vec3 marchPos = ro;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    float dist = rd2Map(marchPos, bass, energy, tension, stability, flowTime);

    if (dist < SURF_DIST) {
      marchResult = totalDist;
      break;
    }
    if (totalDist > MAX_DIST) break;

    totalDist += dist * 0.7; // relaxation factor for safety
  }

  // === SHADING ===
  vec3 col = vec3(0.0);

  if (marchResult > 0.0) {
    vec3 surfPos = ro + rd * marchResult;
    vec3 surfNorm = rd2Normal(surfPos, bass, energy, tension, stability, flowTime);

    // --- Ambient occlusion ---
    float occl = rd2AmbientOcclusion(surfPos, surfNorm, bass, energy, tension, stability, flowTime);

    // --- Bioluminescent emission ---
    float glowAmount = rd2Glow(surfPos, energy, tension, stability, flowTime, sChorus, sSpace, drumOnset);

    // Edge glow color varies along cave
    float glowMix = sin(surfPos.z * 0.3 + flowTime * 0.5) * 0.5 + 0.5;
    vec3 bioGlow = mix(glowColorPrimary, glowColorSecondary, glowMix);

    // Coherence: high = locked patterns, low = chaotic organic shifting
    if (coherence > 0.7) {
      float lockAmt = (coherence - 0.7) / 0.3;
      glowAmount = mix(glowAmount, glowAmount * 0.8, lockAmt * 0.3);
    }
    if (coherence < 0.3) {
      float chaosAmt = (0.3 - coherence) / 0.3;
      float chaosNoise = snoise(vec3(surfPos * 3.0 + flowTime * 0.5)) * 0.3;
      glowAmount += chaosNoise * chaosAmt;
      glowAmount = max(0.0, glowAmount);
    }

    // --- Base rock color ---
    float rockNoise = fbm3(vec3(surfPos * 2.5)) * 0.5 + 0.5;
    vec3 rockCol = mix(rockColorDark, rockColorLight, rockNoise);

    // Wet rock specular highlight (timbral brightness controls intensity)
    float fresnel = pow(1.0 - max(0.0, dot(-rd, surfNorm)), 3.0);
    float specularStr = timbralBright * 0.4 + energy * 0.15;
    vec3 specular = bioGlow * fresnel * specularStr;

    // --- Compose surface ---
    col = rockCol * occl * 0.3;
    // Bioluminescent emission (self-illuminating, not dependent on external light)
    col += bioGlow * glowAmount * (0.6 + energy * 0.8);
    // Ambient occlusion modulates the glow slightly
    col *= 0.7 + occl * 0.3;
    // Specular wet rock highlights
    col += specular;

    // --- Subsurface scatter approximation (glow bleeds through thin rock) ---
    float sssDist = rd2Map(surfPos + surfNorm * 0.15, bass, energy, tension, stability, flowTime);
    float sss = smoothstep(0.0, 0.15, sssDist);
    col += bioGlow * sss * 0.15 * energy;

    // --- Beat pulse on glow ---
    col += bioGlow * effectiveBeat * 0.15 * glowAmount;

    // --- Drum onset: ripple flash through patterns ---
    float rippleDist = length(surfPos.xy - ro.xy);
    float ripple = drumOnset * sin(rippleDist * 12.0 - uTime * 10.0) * exp(-rippleDist * 2.0);
    col += bioGlow * max(0.0, ripple) * 0.4;

    // --- Solo: dramatic contrast boost on glow ---
    col += bioGlow * glowAmount * sSolo * 0.3;

    // --- Depth fog ---
    float fogDist = marchResult;
    float fogDensity = mix(0.04, 0.12, slowE) * mix(1.0, 0.5, sSpace);
    float fog = 1.0 - exp(-fogDist * fogDensity);
    vec3 fogColor = mix(rockColorDark, bioGlow * 0.15, 0.3 + energy * 0.2);
    col = mix(col, fogColor, fog);
  } else {
    // === CAVE INTERIOR FOG (missed geometry = deep cave void) ===
    float depthFog = 1.0 - exp(-MAX_DIST * 0.08);
    vec3 deepFogCol = mix(rockColorDark, glowColorPrimary * 0.05, 0.2);
    col = deepFogCol * depthFog;
  }

  // === CLIMAX: Floating luminous particles erupting from walls ===
  if (climaxIntensity > 0.01) {
    float particles = rd2Particles(ro + rd * min(marchResult, 5.0), climaxIntensity, flowTime, bass);
    vec3 particleGlow = mix(glowColorPrimary, glowColorSecondary, sin(flowTime * 2.0) * 0.5 + 0.5);
    particleGlow *= 1.5; // extra bright
    col += particleGlow * particles;

    // Overall climax brightness lift
    col *= 1.0 + climaxIntensity * 0.3;
  }

  // === JAM PHASE EVOLUTION ===
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    // Exploration: subtle extra glow variation
    col *= 1.0 + jpExplore * 0.05 * sin(flowTime * 3.0);
    // Building: increasing brightness
    col *= 1.0 + jpBuild * 0.15;
    // Peak space: maximum saturation and glow
    col *= 1.0 + jpPeak * 0.25;
  }

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm3(vec3(screenP * 2.0, flowTime));
    col += iconEmergence(screenP, uTime, energy, bass, glowColorPrimary, glowColorSecondary, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, glowColorPrimary, glowColorSecondary, nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, uv, screenP);

  // === FEEDBACK TRAILS ===
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float baseDecay = mix(0.94, 0.88, energy);
  float feedbackDecay = baseDecay
    + sJam * 0.04
    + sSpace * 0.06
    - sChorus * 0.05;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.96);
  // Jam phase feedback modulation
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.96);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
