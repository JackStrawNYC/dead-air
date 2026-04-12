/**
 * Forest — deep forest with tree trunks, canopy, god rays, forest floor.
 * Light filtering through canopy, dappled shadows, atmospheric depth.
 * FullscreenQuad GLSL replacement for the R3F geometry version.
 *
 * Audio reactivity:
 *   uEnergy        → god ray intensity, canopy movement
 *   uBass          → trunk sway, deep shadow pulse
 *   uOnsetSnap     → light flicker through leaves
 *   uVocalEnergy   → mist density
 *   uChromaHue     → foliage color shift (green→autumn)
 *   uSlowEnergy    → ambient light level
 *   uMelodicPitch  → canopy density (open→dense)
 *   uSectionType   → jam=wind through trees, space=still, chorus=sun breaks
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const forestGlslVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const forestGlslFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  grainStrength: "light",
  stageFloodEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265

// --- Tree trunk ---
float treeTrunk(vec2 uv, float xPos, float width, float bass, float time) {
  float sway = sin(time * 0.3 + xPos * 5.0) * bass * 0.008;
  float dx = abs(uv.x - xPos - sway * uv.y) / width;
  // Taper: wider at base
  float taper = mix(1.0, 0.6, uv.y);
  return smoothstep(taper, taper - 0.3, dx) * step(0.0, uv.y);
}

// --- Canopy (fractal leaf clusters) ---
float canopyLayer(vec2 uv, float time, float yOffset, float density) {
  vec2 p = vec2(uv.x * 6.0, (uv.y - yOffset) * 4.0);
  float n1 = snoise(vec3(p, time * 0.1)) * 0.5 + 0.5;
  float n2 = snoise(vec3(p * 2.3, time * 0.15 + 3.0)) * 0.5 + 0.5;
  float n3 = snoise(vec3(p * 5.0, time * 0.08 + 7.0)) * 0.5 + 0.5;
  float leaves = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;
  return smoothstep(1.0 - density, 1.0 - density + 0.15, leaves);
}

// --- God ray ---
float godRay(vec2 uv, float xPos, float width, float time, float energy) {
  float dx = abs(uv.x - xPos);
  // Beam shape: wider at bottom, narrow at top
  float beamWidth = width * mix(2.0, 0.5, uv.y);
  float beam = smoothstep(beamWidth, beamWidth * 0.3, dx);
  // Flicker
  float flicker = 0.7 + 0.3 * sin(time * 2.0 + xPos * 10.0);
  // Stronger at top (light source), fading toward floor
  float yFade = smoothstep(0.0, 0.8, uv.y);
  return beam * flicker * yFade * energy;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float vocal = clamp(uVocalEnergy, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float hueShift = uChromaHue;
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float t = uDynamicTime;

  float sType = uSectionType;
  float jamMod = smoothstep(4.5, 5.5, sType);
  float spaceMod = smoothstep(6.5, 7.5, sType);
  float chorusMod = smoothstep(1.5, 2.5, sType) * (1.0 - smoothstep(2.5, 3.5, sType));

  float windStrength = energy * (1.0 + jamMod * 0.4) * (1.0 - spaceMod * 0.7);
  float lightLevel = slowE * 0.6 + 0.2 + chorusMod * 0.2;
  float canopyDensity = 0.5 + pitch * 0.3;

  // --- Base forest ambient (deep green-brown dark) ---
  vec3 ambient = vec3(0.03, 0.05, 0.03) * (0.5 + lightLevel);

  // --- Sky visible through canopy gaps ---
  vec3 skyColor = mix(
    vec3(0.4, 0.55, 0.3),  // green-filtered
    vec3(0.6, 0.55, 0.35), // warm golden
    slowE
  );

  // --- Canopy ---
  float canopy1 = canopyLayer(uv, t * (0.5 + windStrength * 0.5), 0.65, canopyDensity);
  float canopy2 = canopyLayer(uv + vec2(0.3, 0.1), t * 0.4, 0.55, canopyDensity * 0.8);
  float canopy = max(canopy1, canopy2);

  // Canopy color (green → autumn based on hueShift)
  float leafHue = mix(0.28, 0.12, hueShift); // green → orange
  float leafSat = mix(0.7, 0.85, hueShift);
  float leafVal = mix(0.15, 0.25, lightLevel);
  vec3 leafColor = hsv2rgb(vec3(leafHue, leafSat, leafVal));

  // Backlit leaves are brighter
  float backlit = (1.0 - canopy1) * canopy2 * lightLevel * 0.5;
  leafColor += vec3(0.1, 0.15, 0.03) * backlit;

  // Start with sky in gaps, canopy over it
  vec3 col = mix(skyColor * lightLevel, leafColor, canopy * step(0.5, uv.y));

  // Below canopy: forest interior
  float interiorMask = step(uv.y, 0.65);
  vec3 interior = ambient;

  // --- Forest floor ---
  float floorY = 0.08;
  float floorMask = smoothstep(floorY + 0.02, floorY - 0.02, uv.y);
  float floorNoise = snoise(vec3(uv.x * 15.0, uv.y * 5.0, 0.5)) * 0.03;
  vec3 floorColor = vec3(0.06, 0.04, 0.02) + floorNoise;
  // Dappled light on floor
  float dapple = canopyLayer(uv * 3.0, t * 0.3, 0.0, 0.4);
  floorColor += vec3(0.1, 0.12, 0.04) * (1.0 - dapple) * lightLevel * 0.5;

  interior = mix(interior, floorColor, floorMask);

  // --- Tree trunks ---
  float trunk1 = treeTrunk(uv, 0.15, 0.025, bass, t);
  float trunk2 = treeTrunk(uv, 0.38, 0.03, bass, t);
  float trunk3 = treeTrunk(uv, 0.62, 0.022, bass, t);
  float trunk4 = treeTrunk(uv, 0.85, 0.028, bass, t);
  float trunk5 = treeTrunk(uv, 0.05, 0.02, bass, t);
  float trunk6 = treeTrunk(uv, 0.95, 0.025, bass, t);
  float trunks = max(max(max(trunk1, trunk2), max(trunk3, trunk4)), max(trunk5, trunk6));

  vec3 barkColor = vec3(0.08, 0.05, 0.03);
  // Slight moss on trunks
  float moss = snoise(vec3(uv.x * 30.0, uv.y * 10.0, 2.0)) * 0.5 + 0.5;
  barkColor = mix(barkColor, vec3(0.05, 0.08, 0.03), moss * 0.3);

  interior = mix(interior, barkColor, trunks * step(uv.y, 0.7));

  // Blend interior with canopy layer
  col = mix(interior, col, smoothstep(0.5, 0.7, uv.y));

  // --- God rays ---
  float ray1 = godRay(uv, 0.3, 0.02, t, lightLevel);
  float ray2 = godRay(uv, 0.55, 0.025, t, lightLevel);
  float ray3 = godRay(uv, 0.75, 0.018, t, lightLevel);
  float rays = (ray1 + ray2 + ray3);

  // Rays blocked by canopy (partially)
  rays *= (1.0 - canopy * 0.6);
  // Rays blocked by trunks
  rays *= (1.0 - trunks * 0.8);

  // Ray color (golden-green filtered light)
  vec3 rayColor = mix(vec3(0.4, 0.5, 0.2), vec3(0.6, 0.5, 0.25), slowE);
  col += rayColor * rays * (0.15 + energy * 0.15 + chorusMod * 0.15);

  // Onset flicker: extra light pulse through canopy
  float flickerPulse = onset * 0.2 * (1.0 - canopy * 0.5);
  col += rayColor * flickerPulse;

  // --- Mist / atmospheric haze ---
  float mistHeight = smoothstep(0.0, 0.3, uv.y) * smoothstep(0.5, 0.15, uv.y);
  float mistNoise = fbm(vec3(p.x * 2.0 + t * 0.05, uv.y * 3.0, t * 0.1));
  float mist = mistHeight * mistNoise * (vocal * 0.3 + 0.08);
  col = mix(col, vec3(0.3, 0.35, 0.28) * lightLevel, mist * 0.4);

  // --- Depth fog (distance fade) ---
  float depthFog = smoothstep(0.3, 0.55, uv.y) * 0.15;
  col = mix(col, vec3(0.2, 0.25, 0.18) * lightLevel, depthFog);

  col = applyTemperature(col);
  vec2 pp = uv * 2.0 - 1.0; col = applyPostProcess(col, uv, pp);
  gl_FragColor = vec4(col, 1.0);
}
`;
