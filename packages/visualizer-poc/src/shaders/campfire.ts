/**
 * Campfire particle shaders — vertex/fragment for fire and ember Points geometry.
 *
 * Used by the 3D CampfireScene (React Three Fiber geometry-based).
 * Fire particles: color gradient from base to tip, size pulsing with beat.
 * Ember particles: small bright dots with fade-out lifetime.
 * Smoke particles: soft gray-white puffs.
 */

// --- Fire particle vertex shader ---
export const fireParticleVert = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uBeat;
uniform float uBass;
uniform float uChromaHue;
uniform float uSectionType;

attribute float aLifetime;
attribute float aSeed;
attribute float aPhase;

varying float vLifeFrac;
varying float vSeed;
varying float vHeight;

void main() {
  // Section-type modulation
  float sType = uSectionType;
  float jamBoost = smoothstep(4.5, 5.5, sType);      // jam=5: faster sparks, wider flame
  float spaceHush = smoothstep(6.5, 7.5, sType);      // space=7: still embers, dim
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType)); // chorus=3: bright/dancing
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));  // solo=4: tall focused

  // Lifetime fraction: 0 = just spawned, 1 = expired
  float speedMod = 1.0 + jamBoost * 0.5 - spaceHush * 0.4;
  float life = mod(uTime * (0.4 + aSeed * 0.3) * speedMod + aPhase, 1.0);
  vLifeFrac = life;
  vSeed = aSeed;

  // Fire height scales with energy — solo=tall, jam=wide, space=short
  float heightMod = 1.0 + soloFocus * 0.4 + jamBoost * 0.15 - spaceHush * 0.5;
  float maxHeight = mix(1.5, 5.0, uEnergy) * heightMod;

  // Particle rises from base
  vec3 pos = position;
  pos.y += life * maxHeight;

  // Drift sideways with noise-like wobble — jam=wider, solo=narrow
  float widthMod = 1.0 + jamBoost * 0.6 - soloFocus * 0.4;
  float wobbleX = sin(life * 6.28 + aSeed * 43.7 + uTime * 2.0) * 0.3 * (0.5 + aSeed) * widthMod;
  float wobbleZ = cos(life * 5.13 + aSeed * 17.3 + uTime * 1.7) * 0.3 * (0.5 + aSeed) * widthMod;
  pos.x += wobbleX * life;
  pos.z += wobbleZ * life;

  // Bass sway
  pos.x += sin(uTime * 3.0 + pos.y * 0.5) * uBass * 0.4;

  vHeight = pos.y;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

  // Size: larger at base, smaller at top; pulse with beat
  // Chorus=dancing bigger particles, space=smaller embers
  float sizeMod = 1.0 + chorusVibe * 0.3 - spaceHush * 0.3;
  float baseSize = mix(8.0, 20.0, uEnergy) * (1.0 - life * 0.7) * sizeMod;
  float beatPulse = 1.0 + uBeat * 0.4;
  gl_PointSize = baseSize * beatPulse * (300.0 / -mvPos.z);

  gl_Position = projectionMatrix * mvPos;
}
`;

// --- Fire particle fragment shader — rich ember glow with heat distortion ---
export const fireParticleFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uChromaHue;
uniform float uSectionType;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;

varying float vLifeFrac;
varying float vSeed;
varying float vHeight;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  float energyFreq = 1.0 + energy * 0.5;

  // Section-type modulation
  float sType = uSectionType;
  float jamBoost = smoothstep(4.5, 5.5, sType);
  float spaceHush = smoothstep(6.5, 7.5, sType);
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType));
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));

  // Circular point with energy-responsive detail
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  if (dist > 0.5) discard;

  float alpha = smoothstep(0.5, 0.1, dist);

  // Internal ember texture — simulated heat turbulence
  float angle = atan(center.y, center.x);
  float internalFlicker = sin(angle * 3.0 * energyFreq + vSeed * 20.0 + uDynamicTime * 5.0) * 0.1;
  internalFlicker += sin(angle * 7.0 + vSeed * 50.0 - uDynamicTime * 3.0) * 0.05;
  alpha *= 0.9 + internalFlicker;

  // Color gradient: deep red at base -> orange -> yellow -> white at tip
  vec3 deepRed = vec3(0.8, 0.1, 0.0);
  vec3 orange = vec3(1.0, 0.45, 0.05);
  vec3 yellow = vec3(1.0, 0.85, 0.2);
  vec3 white = vec3(1.0, 0.95, 0.7);

  float t = vLifeFrac;
  vec3 col = mix(deepRed, orange, smoothstep(0.0, 0.25, t));
  col = mix(col, yellow, smoothstep(0.2, 0.5, t));
  col = mix(col, white, smoothstep(0.4, 0.8, t));

  // Palette color influence for show variety
  vec3 palPrimary = hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.5, 1.0));
  vec3 palSecondary = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.4, 0.9));
  col = mix(col, col * palPrimary, 0.1);

  // Slight chroma hue accent
  col.r += uChromaHue * 0.05;
  col.g += (1.0 - uChromaHue) * 0.03;

  // Fade out near end of life
  alpha *= smoothstep(1.0, 0.7, vLifeFrac);
  // Fade in at start
  alpha *= smoothstep(0.0, 0.05, vLifeFrac);

  // Intensity boost with energy
  float intensityMod = 1.0 + chorusVibe * 0.4 + jamBoost * 0.2 - spaceHush * 0.5;
  col *= mix(0.6, 2.0, energy) * intensityMod;

  // === EMBER GLOW: secondary radial warmth layer (30% blend) ===
  float glowDist = smoothstep(0.5, 0.0, dist);
  vec3 emberGlow = mix(palSecondary, vec3(1.0, 0.6, 0.15), glowDist);
  emberGlow *= pow(glowDist, 1.5) * energy * 0.6;
  col += emberGlow * 0.3;

  // Hot core intensification
  float coreBrightness = pow(smoothstep(0.2, 0.0, dist), 2.0);
  col += vec3(1.0, 0.95, 0.8) * coreBrightness * 0.25 * energy;

  // Space: dim to ember glow, Solo: focused warm core
  alpha *= 1.0 - spaceHush * 0.4;
  col += vec3(0.1, 0.05, 0.0) * soloFocus * 0.3;

  gl_FragColor = vec4(col, alpha * 0.85);
}
`;

// --- Ember particle vertex shader ---
export const emberParticleVert = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uBeat;
uniform float uOnset;

attribute float aLifetime;
attribute float aSeed;
attribute float aPhase;

varying float vLifeFrac;
varying float vSeed;

void main() {
  // Embers have longer drift time
  float life = mod(uTime * (0.15 + aSeed * 0.2) + aPhase, 1.0);
  vLifeFrac = life;
  vSeed = aSeed;

  vec3 pos = position;

  // Rise from fire center area
  float riseSpeed = mix(2.0, 6.0, aSeed);
  pos.y += life * riseSpeed;

  // Wind drift
  float windX = sin(aSeed * 100.0 + uTime * 0.5) * 2.0 * life;
  float windZ = cos(aSeed * 77.0 + uTime * 0.3) * 1.5 * life;
  pos.x += windX;
  pos.z += windZ;

  // Onset burst: extra upward kick
  pos.y += uOnset * 1.5 * (1.0 - life);

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

  // Small bright dots
  float sz = mix(2.0, 5.0, aSeed) * (1.0 - life * 0.6);
  sz *= 1.0 + uBeat * 0.3;
  gl_PointSize = sz * (200.0 / -mvPos.z);

  gl_Position = projectionMatrix * mvPos;
}
`;

// --- Ember particle fragment shader — pulsing heat glow ---
export const emberParticleFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uPalettePrimary;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;

varying float vLifeFrac;
varying float vSeed;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  if (dist > 0.5) discard;

  float alpha = smoothstep(0.5, 0.0, dist);

  // Bright orange-yellow ember with palette influence
  vec3 warmEmber = mix(vec3(1.0, 0.6, 0.1), vec3(1.0, 0.9, 0.3), vSeed);
  vec3 palTint = hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.3, 1.0));
  vec3 col = mix(warmEmber, palTint, 0.1);

  // Pulsing glow — embers throb with inner heat
  float pulse = 0.85 + 0.15 * sin(uDynamicTime * 4.0 + vSeed * 30.0);
  col *= pulse;

  // Hot white-hot core at center
  float coreBright = smoothstep(0.2, 0.0, dist);
  col += vec3(1.0, 0.95, 0.85) * coreBright * 0.3 * energy;

  // Secondary warmth halo (30% blend)
  vec3 haloColor = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.4, 0.8));
  float halo = smoothstep(0.5, 0.15, dist) * (1.0 - smoothstep(0.15, 0.0, dist));
  col += haloColor * halo * 0.3;

  // Fade over lifetime
  alpha *= smoothstep(1.0, 0.5, vLifeFrac);
  alpha *= smoothstep(0.0, 0.1, vLifeFrac);

  gl_FragColor = vec4(col, alpha * 0.9);
}
`;

// --- Smoke particle vertex shader ---
export const smokeParticleVert = /* glsl */ `
uniform float uTime;
uniform float uEnergy;
uniform float uFlatness;

attribute float aLifetime;
attribute float aSeed;
attribute float aPhase;

varying float vLifeFrac;
varying float vAlpha;

void main() {
  float life = mod(uTime * (0.08 + aSeed * 0.08) + aPhase, 1.0);
  vLifeFrac = life;

  vec3 pos = position;

  // Smoke rises slowly from above fire
  pos.y += life * 8.0;

  // Spread outward as it rises
  float spread = life * 3.0;
  pos.x += sin(aSeed * 50.0 + uTime * 0.2) * spread;
  pos.z += cos(aSeed * 37.0 + uTime * 0.15) * spread;

  // Density from flatness
  float density = uFlatness * 0.6 + 0.15;
  vAlpha = density * smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.4, life);

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);

  // Larger particles for smoke puffs
  float sz = mix(15.0, 40.0, aSeed) * (0.5 + life * 1.5);
  gl_PointSize = sz * (200.0 / -mvPos.z);

  gl_Position = projectionMatrix * mvPos;
}
`;

// --- Smoke particle fragment shader — volumetric wispy smoke ---
export const smokeParticleFrag = /* glsl */ `
precision highp float;

uniform float uDynamicTime;
uniform float uEnergy;
uniform float uPaletteSecondary;
uniform float uPaletteSaturation;

varying float vLifeFrac;
varying float vAlpha;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float energy = clamp(uEnergy, 0.0, 1.0);
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  if (dist > 0.5) discard;

  // Soft circular falloff with wispy edge detail
  float angle = atan(center.y, center.x);
  float edgeWisp = sin(angle * 5.0 + vLifeFrac * 10.0 + uDynamicTime * 0.5) * 0.04;
  float adjustedDist = dist + edgeWisp;
  float alpha = smoothstep(0.5, 0.1, adjustedDist) * vAlpha;

  // Gray-white smoke with subtle warm undertone from fire below
  vec3 col = mix(vec3(0.3, 0.28, 0.25), vec3(0.5, 0.48, 0.45), vLifeFrac);
  // Fire-lit underside: warm glow at base, cool gray at top
  vec3 fireUnderglow = vec3(0.25, 0.12, 0.04) * (1.0 - vLifeFrac) * energy;
  col += fireUnderglow * 0.3;

  // Palette tint for variety
  vec3 palTint = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.08, 0.4));
  col = mix(col, palTint, 0.1 * vLifeFrac);

  gl_FragColor = vec4(col, alpha * 0.25);
}
`;

// Keep legacy exports for backward compatibility (now unused by CampfireScene)
export const campfireVert = fireParticleVert;
export const campfireFrag = fireParticleFrag;
