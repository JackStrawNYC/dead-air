/**
 * Mountain Fire 3D — GLSL shaders for React Three Fiber 3D mountain fire scene.
 *
 * Exports separate vertex/fragment pairs for each mesh:
 *   - Mountain silhouettes (3 layered displaced planes)
 *   - Fire particles (Points system behind mountains)
 *   - Ember particles (small bright dots rising on beat)
 *   - Smoke particles (gray translucent rising from fire)
 *   - Sky background (gradient quad)
 *
 * Audio mapping:
 *   uEnergy       → fire height (campfire → inferno)
 *   uBass         → fire pulse / sway
 *   uOnsetSnap    → ember burst trigger
 *   uFlatness     → smoke density
 *   uMelodicPitch → mountain height shift
 *   uChromaHue    → fire color (orange → crimson → magenta)
 *   uSlowEnergy   → sky color (blue/purple → red/orange)
 */

// ═══════════════════════════════════════════════════
// MOUNTAIN SILHOUETTES — displaced PlaneGeometry
// ═══════════════════════════════════════════════════

export const mountainSilhouetteVert = /* glsl */ `
uniform float uMelodicPitch;
uniform float uLayerSeed;
uniform float uLayerScale;
uniform float uLayerHeight;

varying vec2 vUv;
varying float vEdgeDist;

// Simple 3D noise for mountain profile
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise2d(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float mountainProfile(float x, float seed, float scale, float height) {
  float n1 = snoise2d(vec2(x * 3.0 * scale + seed, seed * 0.7)) * 0.5;
  float n2 = snoise2d(vec2(x * 7.0 * scale + seed + 10.0, seed * 1.3)) * 0.25;
  float n3 = snoise2d(vec2(x * 15.0 * scale + seed + 30.0, seed * 2.1)) * 0.12;
  float n4 = snoise2d(vec2(x * 30.0 * scale + seed + 50.0, seed * 3.0)) * 0.06;
  return (n1 + n2 + n3 + n4) * height + height * 0.5;
}

void main() {
  vUv = uv;

  float pitchShift = (clamp(uMelodicPitch, 0.0, 1.0) - 0.5) * 0.3;
  float heightVal = uLayerHeight + pitchShift;

  vec3 pos = position;

  // Displace Y based on mountain noise profile using X position
  float normalizedX = pos.x / 10.0; // plane is 20 wide, so -10 to 10 → -1 to 1
  float mtH = mountainProfile(normalizedX, uLayerSeed, uLayerScale, heightVal);

  // Only displace vertices above the base — the mountain ridge
  // Map from flat plane to silhouette shape: vertices near top of plane become ridge
  float verticalT = (pos.y + 3.0) / 6.0; // plane height 6, centered → 0..1
  pos.y = mix(-3.0, mtH * 6.0, verticalT);

  // Edge distance for rim lighting
  vEdgeDist = smoothstep(0.0, 0.15, abs(verticalT - 1.0));

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const mountainSilhouetteFrag = /* glsl */ `
precision highp float;

uniform float uEnergy;
uniform vec3 uFireColor;
uniform float uLayerDepth; // 0 = nearest (darkest), 1 = farthest (lighter)
uniform float uSectionType;

varying vec2 vUv;
varying float vEdgeDist;

void main() {
  // Section-type modulation
  float sType = uSectionType;
  float jamBoost = smoothstep(4.5, 5.5, sType);      // jam=5: eruption intensity
  float spaceHush = smoothstep(6.5, 7.5, sType);      // space=7: smoldering embers
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType)); // chorus=3: full blaze
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));  // solo=4: lava river focus

  float energy = clamp(uEnergy, 0.0, 1.0);
  float fireIntensityMod = 1.0 + jamBoost * 0.5 + chorusVibe * 0.3 - spaceHush * 0.6;

  float energyFreq = 1.0 + energy * 0.5;

  // Dark silhouette colors with depth layering
  vec3 nearColor = vec3(0.005, 0.004, 0.012);
  vec3 farColor = vec3(0.015, 0.012, 0.025);
  vec3 baseColor = mix(nearColor, farColor, uLayerDepth);

  // === LAVA VEIN TEXTURE: molten cracks across mountain face ===
  float veinNoise = sin(vUv.y * 40.0 * energyFreq + vUv.x * 15.0) * 0.5 + 0.5;
  float veinFine = sin(vUv.y * 80.0 + vUv.x * 25.0 + 3.0) * 0.5 + 0.5;
  float veinMask = pow(veinNoise * veinFine, 3.0) * energy * (1.0 - uLayerDepth * 0.7);
  // Lava glow in veins: deep orange-red with palette influence
  vec3 lavaColor = uFireColor * 1.5;
  lavaColor = mix(lavaColor, vec3(1.0, 0.4, 0.05), 0.3);
  baseColor += lavaColor * veinMask * 0.2 * fireIntensityMod;

  // Fire illumination on mountain face — modulated by section type
  vec3 fireIllum = uFireColor * energy * 0.08 * fireIntensityMod;
  baseColor += fireIllum * mix(0.15, 0.5, uLayerDepth);

  // === SECONDARY DEPTH LAYER: atmospheric haze between mountain layers (30%) ===
  float hazeFactor = uLayerDepth * 0.3;
  vec3 hazeColor = uFireColor * 0.15 + vec3(0.02, 0.01, 0.03);
  baseColor = mix(baseColor, hazeColor, hazeFactor * energy);

  // Rim lighting near mountain edge (top) — jam/chorus amplify rim glow
  float rimGlow = (1.0 - vEdgeDist) * energy * fireIntensityMod;
  vec3 rimColor = uFireColor * rimGlow * 0.4;
  // Rim gets richer with a secondary hot-white edge
  rimColor += vec3(1.0, 0.85, 0.5) * pow(rimGlow, 2.0) * 0.15;

  // Solo: focused lava glow concentrated in nearest ridge
  rimColor += uFireColor * soloFocus * 0.15 * (1.0 - uLayerDepth);

  vec3 col = baseColor + rimColor;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════
// FIRE PARTICLES — Points system (1000+ particles)
// ═══════════════════════════════════════════════════

export const fireParticleVert = /* glsl */ `
uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uBass;
uniform float uBeatSnap;
uniform float uClimaxIntensity;
uniform float uSectionType;

attribute float aPhase;
attribute float aSpeed;
attribute float aSize;

varying float vLife;
varying float vHeight;
varying float vAlpha;

void main() {
  // Section-type modulation
  float sType = uSectionType;
  float jamBoost = smoothstep(4.5, 5.5, sType);      // jam=5: eruption intensity
  float spaceHush = smoothstep(6.5, 7.5, sType);      // space=7: smoldering embers
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType)); // chorus=3: full blaze
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));  // solo=4: lava river focus

  vec3 pos = position;

  float energy = clamp(uEnergy, 0.0, 1.0);
  // Jam=inferno height, chorus=full blaze, space=smoldering, solo=concentrated
  float heightMod = 1.0 + jamBoost * 0.5 + chorusVibe * 0.3 - spaceHush * 0.5 + soloFocus * 0.2;
  float fireHeight = mix(1.0, 12.0, energy) * heightMod;
  float fireWidth = mix(2.0, 6.0, energy) * (1.0 + jamBoost * 0.3 - soloFocus * 0.3);

  // Life cycle: particles rise and respawn — jam=faster cycling
  float speedMod = 1.0 + jamBoost * 0.3 - spaceHush * 0.4;
  float life = fract(aPhase + uDynamicTime * aSpeed * 0.15 * speedMod);
  vLife = life;

  // Rise from base
  pos.y += life * fireHeight;
  vHeight = life;

  // Horizontal sway with bass
  float sway = sin(uDynamicTime * 2.0 + aPhase * 20.0) * (0.3 + uBass * 0.5);
  pos.x += sway * (1.0 - life * 0.5);

  // Column width narrows toward top
  float widthFactor = mix(1.0, 0.2, life);
  pos.x *= widthFactor * fireWidth / 4.0;
  pos.z *= widthFactor;

  // Beat pulse pushes particles outward
  pos.y += uBeatSnap * 0.3;
  pos.x += uBeatSnap * sin(aPhase * 30.0) * 0.2;

  // Fade over lifetime — space dims, chorus brightens
  vAlpha = (1.0 - life) * (1.0 - life * 0.5);
  vAlpha *= energy;
  vAlpha *= 1.0 + uClimaxIntensity * 0.4;
  vAlpha *= 1.0 + chorusVibe * 0.3 - spaceHush * 0.4;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  float baseSize = aSize * (4.0 + energy * 8.0);
  gl_PointSize = max(1.0, baseSize * (300.0 / -mvPos.z));
  gl_Position = projectionMatrix * mvPos;
}
`;

export const fireParticleFrag = /* glsl */ `
precision highp float;

uniform float uChromaHue;
uniform float uPalettePrimary;
uniform float uPaletteSaturation;
uniform float uSectionType;

varying float vLife;
varying float vHeight;
varying float vAlpha;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  // Section-type modulation
  float sType = uSectionType;
  float jamBoost = smoothstep(4.5, 5.5, sType);      // jam=5: eruption intensity
  float spaceHush = smoothstep(6.5, 7.5, sType);      // space=7: smoldering embers
  float chorusVibe = smoothstep(2.5, 3.5, sType) * (1.0 - smoothstep(3.5, 4.5, sType)); // chorus=3: full blaze
  float soloFocus = smoothstep(3.5, 4.5, sType) * (1.0 - smoothstep(4.5, 5.5, sType));  // solo=4: lava river focus

  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.05, dist) * vAlpha;

  float chromaH = clamp(uChromaHue, 0.0, 1.0);

  // Fire color gradient: deep red at base → orange → yellow tips
  float fireHue = 0.05 + chromaH * 0.08;
  float fireHue2 = 0.0 + chromaH * 0.05;
  float tipHue = 0.12 + chromaH * 0.03;

  vec3 baseCol = hsv2rgb(vec3(fireHue2, 0.9, 0.85));
  vec3 midCol = hsv2rgb(vec3(fireHue, 0.95, 1.0));
  vec3 tipCol = hsv2rgb(vec3(tipHue, 0.6, 1.0));

  // Palette influence
  vec3 palCol = hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.8, 1.0));
  midCol = mix(midCol, palCol, 0.15);

  // Mix based on height
  vec3 col = mix(baseCol, midCol, smoothstep(0.0, 0.4, vHeight));
  col = mix(col, tipCol, smoothstep(0.4, 0.9, vHeight));

  // Hot core glow
  float coreDist = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.3, 0.0, coreDist);
  col += vec3(1.0, 0.9, 0.5) * core * 0.3;

  // Section modulation on fire color intensity
  // Jam: eruption white-hot, Chorus: vibrant full blaze
  col *= 1.0 + jamBoost * 0.3 + chorusVibe * 0.2;
  // Space: dim smoldering, desaturated toward deep red
  col = mix(col, baseCol * 0.4, spaceHush * 0.5);
  // Solo: focused lava glow — warm concentrated core
  col += vec3(0.15, 0.05, 0.0) * soloFocus * core * 0.5;

  gl_FragColor = vec4(col, alpha);
}
`;

// ═══════════════════════════════════════════════════
// EMBER PARTICLES — small bright dots rising on beat
// ═══════════════════════════════════════════════════

export const emberVert = /* glsl */ `
uniform float uTime;
uniform float uDynamicTime;
uniform float uEnergy;
uniform float uOnsetSnap;
uniform float uBeatSnap;

attribute float aPhase;
attribute float aSpeed;

varying float vAlpha;

void main() {
  vec3 pos = position;

  float energy = clamp(uEnergy, 0.0, 1.0);

  // Longer lifecycle — embers drift slowly
  float life = fract(aPhase + uDynamicTime * aSpeed * 0.08);

  // Rise slowly with wind drift
  pos.y += life * (3.0 + energy * 5.0);
  float windX = sin(uDynamicTime * 0.5 + aPhase * 15.0) * (0.5 + life);
  float windZ = cos(uDynamicTime * 0.3 + aPhase * 12.0) * 0.3;
  pos.x += windX;
  pos.z += windZ;

  // Beat burst: onset pushes embers up and out
  float burst = uOnsetSnap * 2.0;
  pos.y += burst * (1.0 - life) * 0.5;
  pos.x += burst * sin(aPhase * 40.0) * 0.3;

  // Fade over lifetime
  vAlpha = (1.0 - life) * (1.0 - life);
  vAlpha *= energy * 0.8;
  vAlpha *= 1.0 + uBeatSnap * 0.5;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = max(1.0, (1.5 + energy * 2.0) * (200.0 / -mvPos.z));
  gl_Position = projectionMatrix * mvPos;
}
`;

export const emberFrag = /* glsl */ `
precision highp float;

uniform float uChromaHue;

varying float vAlpha;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;

  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  // Bright orange-yellow embers
  vec3 col = hsv2rgb(vec3(0.08 + chromaH * 0.05, 0.8, 1.0));
  col *= 1.5; // hot bright spots

  gl_FragColor = vec4(col, alpha);
}
`;

// ═══════════════════════════════════════════════════
// SMOKE PARTICLES — gray translucent, slowly rising
// ═══════════════════════════════════════════════════

export const smokeVert = /* glsl */ `
uniform float uTime;
uniform float uDynamicTime;
uniform float uFlatness;
uniform float uEnergy;

attribute float aPhase;
attribute float aSpeed;

varying float vAlpha;

void main() {
  vec3 pos = position;

  float flatness = clamp(uFlatness, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);
  float smokeDensity = flatness * 0.6 + energy * 0.2;

  // Very slow rise
  float life = fract(aPhase + uDynamicTime * aSpeed * 0.04);
  pos.y += life * 6.0;

  // Wider spread than fire
  pos.x += sin(uDynamicTime * 0.2 + aPhase * 8.0) * (1.0 + life * 2.0);
  pos.z += cos(uDynamicTime * 0.15 + aPhase * 6.0) * 0.5;

  // Fade: appears, expands, dissipates
  float fadeIn = smoothstep(0.0, 0.1, life);
  float fadeOut = 1.0 - smoothstep(0.5, 1.0, life);
  vAlpha = fadeIn * fadeOut * smokeDensity * 0.4;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  // Smoke particles are larger
  float size = (8.0 + life * 12.0) * smokeDensity;
  gl_PointSize = max(1.0, size * (300.0 / -mvPos.z));
  gl_Position = projectionMatrix * mvPos;
}
`;

export const smokeFrag = /* glsl */ `
precision highp float;

uniform vec3 uFireColor;
uniform float uEnergy;

varying float vAlpha;

void main() {
  float dist = length(gl_PointCoord - 0.5);
  if (dist > 0.5) discard;
  // Very soft falloff for smoky look
  float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
  alpha *= alpha; // extra soft

  float energy = clamp(uEnergy, 0.0, 1.0);
  // Dark gray with warm fire tint
  vec3 col = mix(vec3(0.08, 0.06, 0.05), uFireColor * 0.3, energy * 0.3);

  gl_FragColor = vec4(col, alpha);
}
`;

// ═══════════════════════════════════════════════════
// SKY BACKGROUND — gradient quad
// ═══════════════════════════════════════════════════

export const mountainSkyVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

export const mountainSkyFrag = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uDynamicTime;
uniform float uSlowEnergy;
uniform float uEnergy;

varying vec2 vUv;

void main() {
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);

  float energyFreq = 1.0 + energy * 0.5;

  // Sky gradient: deep blue/purple at rest -> red/orange at peaks
  vec3 skyQuiet = vec3(0.01, 0.015, 0.06);
  vec3 skyMid = vec3(0.06, 0.02, 0.04);
  vec3 skyHot = vec3(0.15, 0.04, 0.02);

  float skyMix = smoothstep(0.1, 0.8, slowE);
  vec3 col = mix(skyQuiet, skyMid, skyMix);
  col = mix(col, skyHot, smoothstep(0.5, 1.0, energy));

  // === VOLCANIC ASH/SMOKE CLOUDS: secondary atmospheric layer (30%) ===
  float cloudSeed = vUv.x * 3.0 * energyFreq + slowTime * 0.08;
  float ashCloud = sin(cloudSeed) * sin(vUv.y * 4.0 + slowTime * 0.05);
  ashCloud += sin(cloudSeed * 2.3 + 5.0) * sin(vUv.y * 7.0 - slowTime * 0.03) * 0.4;
  ashCloud = smoothstep(0.1, 0.6, ashCloud * 0.5 + 0.5);
  float ashMask = smoothstep(0.0, 0.4, vUv.y) * smoothstep(0.8, 0.5, vUv.y);
  vec3 ashColor = mix(vec3(0.04, 0.02, 0.03), skyHot * 0.3, energy * 0.5);
  col = mix(col, ashColor, ashCloud * ashMask * 0.3 * energy);

  // Darker at top
  col *= mix(0.6, 1.0, smoothstep(1.0, 0.0, vUv.y));

  // === FIRE GLOW on horizon: warm underlight from eruption ===
  float horizonGlow = exp(-pow(vUv.y * 6.0, 2.0));
  col += skyHot * horizonGlow * energy * 0.15;

  // Stars visible during quiet
  float starFade = 1.0 - smoothstep(0.15, 0.6, energy);
  if (starFade > 0.01) {
    float slowTime = uDynamicTime * 0.1;
    vec2 starUv = vUv + slowTime * 0.008;
    float starH = fract(sin(dot(floor(starUv * 90.0), vec2(127.1, 311.7))) * 43758.5453);
    float starH2 = fract(sin(dot(floor(starUv * 90.0), vec2(269.5, 183.3))) * 43758.5453);
    vec2 starF = fract(starUv * 90.0);
    float starDist = length(starF - vec2(starH, starH2));
    float hasStar = step(0.72, starH);
    float twinkle = 0.7 + 0.3 * sin(uTime * 2.5 + starUv.x * 40.0);
    float star = hasStar * twinkle * smoothstep(0.025, 0.004, starDist);
    col += vec3(0.85, 0.88, 1.0) * star * 0.5 * starFade;

    // Second star layer for density
    vec2 starUv2 = vUv + slowTime * 0.004 + 7.0;
    float sh2 = fract(sin(dot(floor(starUv2 * 130.0), vec2(127.1, 311.7))) * 43758.5453);
    float sh22 = fract(sin(dot(floor(starUv2 * 130.0), vec2(269.5, 183.3))) * 43758.5453);
    vec2 sf2 = fract(starUv2 * 130.0);
    float sd2 = length(sf2 - vec2(sh2, sh22));
    float star2 = step(0.72, sh2) * twinkle * smoothstep(0.025, 0.004, sd2);
    col += vec3(0.85, 0.88, 1.0) * star2 * 0.25 * starFade;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════
// FIRE GLOW — PointLight shader (not used directly,
// but provides color calculation for the scene component)
// ═══════════════════════════════════════════════════

/** Compute fire color from chromaHue (0-1) for use in PointLight */
export function computeFireColor(chromaHue: number): [number, number, number] {
  const hue = 0.05 + chromaHue * 0.08;
  // HSV to RGB inline
  const h = hue * 6.0;
  const c = 0.95;
  const x = c * (1 - Math.abs(h % 2 - 1));
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = c; g = x; }
  else if (h < 2) { r = x; g = c; }
  else if (h < 3) { g = c; b = x; }
  else if (h < 4) { g = x; b = c; }
  else if (h < 5) { r = x; b = c; }
  else { r = c; b = x; }
  return [r, g, b];
}
