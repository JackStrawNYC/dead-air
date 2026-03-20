/**
 * Particle Swarm — Boid-like flocking particles rendered as a density field.
 * Hundreds of virtual particles with emergent swarm behavior, rendered via
 * a ray-marched density field (no actual geometry — pure fragment shader).
 *
 * Behavior:
 *   - Particles form flowing streams that coalesce and separate
 *   - Low energy: slow drift, scattered, cosmic dust feel
 *   - High energy: tight swirling flocks, trails of light
 *   - Beats trigger flock explosions (separation spike)
 *   - Vocals draw particles toward center (cohesion)
 *
 * Audio reactivity:
 *   uEnergy       → flock density, trail brightness
 *   uBass         → particle size, gravitational pull
 *   uOnsetSnap    → separation burst (particles scatter)
 *   uVocalPresence → cohesion pull toward center
 *   uHighs        → particle shimmer, tail length
 *   uDrumOnset    → directional impulse (kick the swarm)
 *   uSlowEnergy   → overall drift speed
 *   uPalettePrimary/Secondary → particle colors
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const particleSwarmVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const particleSwarmFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: "light", bloomEnabled: true, flareEnabled: false, stageFloodEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define NUM_PARTICLES 48
#define TRAIL_STEPS 6

// Hash function for particle seeding
float hash1(float n) { return fract(sin(n) * 43758.5453); }
vec2 hash2(float n) { return vec2(hash1(n), hash1(n + 17.37)); }

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.15;

  // Section-type modulation
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float separationMod = mix(1.0, 1.4, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.1, sChorus);
  float swirlMod = mix(1.0, 1.5, sJam) * mix(1.0, 0.35, sSpace) * mix(1.0, 1.15, sChorus);
  float burstMod = mix(1.0, 1.3, sJam) * mix(1.0, 0.5, sSpace) * mix(1.0, 1.2, sChorus);

  // --- Phase 1: New uniform integrations ---
  float directionFlow = uMelodicDirection * 0.05;  // melodic direction biases flow
  float stabilityFlock = uBeatStability;             // high = tight flocks, low = scattered
  float chromaHueMod = uChromaHue * 0.25;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.15;

  // Background: deep space
  vec3 bgColor = mix(
    vec3(0.01, 0.01, 0.03),
    vec3(0.03, 0.02, 0.06),
    uv.y * 0.8 + energy * 0.2
  );
  vec3 col = bgColor;

  // Palette colors
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  // Swarm parameters modulated by audio (section-modulated)
  float separation = (0.15 + onset * 0.35 + (1.0 - stabilityFlock) * 0.1) * separationMod;  // scatter on onset + low stability
  float cohesion = 0.3 + vocalP * 0.4 + stabilityFlock * 0.15;            // pull together on vocals + stability
  float driftSpeed = (0.08 + uSlowEnergy * 0.12) * swirlMod;
  float particleRadius = 0.008 + bass * 0.006;

  // Global flow direction (curl noise at macro scale)
  vec2 globalFlow = vec2(
    snoise(vec3(slowTime * 0.3, 0.0, 0.0)),
    snoise(vec3(0.0, slowTime * 0.3, 7.0))
  ) * driftSpeed;

  // Drum impulse: directional kick (section-modulated burst)
  vec2 drumKick = vec2(
    snoise(vec3(floor(uMusicalTime) * 13.7, 0.0, 0.0)),
    snoise(vec3(0.0, floor(uMusicalTime) * 7.3, 0.0))
  ) * drumOnset * 0.15 * burstMod;

  // Accumulate particle density
  float density = 0.0;
  vec3 particleColorAcc = vec3(0.0);

  for (int i = 0; i < NUM_PARTICLES; i++) {
    float fi = float(i);
    float seed = fi * 7.13;

    // Base position: seeded random
    vec2 basePos = hash2(seed) * 2.0 - 1.0;
    basePos *= aspect * 0.4;

    // Flocking motion via noise field
    float noiseScale = 1.5 + separation * 2.0;
    vec2 flowOffset = vec2(
      snoise(vec3(basePos * noiseScale + globalFlow * 10.0, slowTime + seed * 0.1)),
      snoise(vec3(basePos * noiseScale + globalFlow * 10.0 + 50.0, slowTime + seed * 0.1))
    );

    // Cohesion: pull toward center (stronger with vocals)
    vec2 toCenter = -basePos * cohesion * 0.3;

    // Final particle position
    vec2 particlePos = basePos + flowOffset * 0.3 + toCenter + globalFlow + drumKick;

    // Wrap particles within viewport
    particlePos = mod(particlePos + aspect * 0.6, aspect * 1.2) - aspect * 0.6;

    // Particle color: varies per particle across palette
    float hue = mix(hue1, hue2, hash1(seed + 3.0));
    vec3 pColor = hsv2rgb(vec3(hue, sat, 1.0));

    // Trail: render TRAIL_STEPS past positions
    for (int t = 0; t < TRAIL_STEPS; t++) {
      float ft = float(t);
      float trailTime = slowTime - ft * 0.015 * (1.0 + highs);
      vec2 trailFlow = vec2(
        snoise(vec3(basePos * noiseScale + globalFlow * 10.0, trailTime + seed * 0.1)),
        snoise(vec3(basePos * noiseScale + globalFlow * 10.0 + 50.0, trailTime + seed * 0.1))
      );
      vec2 trailPos = basePos + trailFlow * 0.3 + toCenter + globalFlow + drumKick;
      trailPos = mod(trailPos + aspect * 0.6, aspect * 1.2) - aspect * 0.6;

      float dist = length(p - trailPos);
      float trailFade = 1.0 - ft / float(TRAIL_STEPS);
      float radius = particleRadius * (1.0 + ft * 0.3);
      float d = smoothstep(radius, radius * 0.2, dist) * trailFade;

      density += d;
      particleColorAcc += pColor * d;
    }
  }

  // Normalize and apply particle color
  if (density > 0.001) {
    vec3 avgColor = particleColorAcc / density;
    float brightness = min(density, 3.0) * (0.4 + energy * 0.6);
    col += avgColor * brightness;
  }

  // Ambient noise field: subtle flowing nebula behind particles
  float nebulaVal = fbm3(vec3(p * 2.0, slowTime * 0.3));
  vec3 nebulaColor = hsv2rgb(vec3(hue1 + nebulaVal * 0.1, 0.4, 1.0));
  col += nebulaColor * max(0.0, nebulaVal) * 0.06 * energy;


  // SDF icon emergence
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 col1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 col2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, col1, col2, nf, uClimaxPhase, uSectionIndex) * 0.6;
    col += heroIconEmergence(p, uTime, energy, bass, col1, col2, nf, uSectionIndex);
  }

  // Vignette
  float vigScale = mix(0.28, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.01, 0.02), col, vignette);

  // Post-processing
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
