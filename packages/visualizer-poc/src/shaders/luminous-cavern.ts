/**
 * Luminous Cavern — A+++ raymarched bioluminescent underwater cave system.
 *
 * A submerged cathedral-scale cavern with:
 *   - Stalactite/stalagmite SDF formations with crystalline facets
 *   - Bioluminescent organisms pulsing on cave walls (vocal-reactive)
 *   - Underwater caustic light patterns dancing on stone
 *   - Volumetric god rays from a distant surface opening
 *   - Mineral deposit veins glowing with bass energy
 *   - Camera gliding slowly through connected chambers
 *   - Marine snow particles drifting in the current
 *
 * Audio reactivity (12+ uniforms):
 *   uSlowEnergy   → bioluminescent glow intensity
 *   uEnergy       → caustic brightness + crystal refraction
 *   uBass         → mineral vein pulse + stalactite vibration
 *   uDrumOnset    → bioluminescent flash burst
 *   uVocalPresence → organism pulse rate
 *   uBeatSnap     → caustic ripple trigger
 *   uStemBass     → deep structural resonance
 *   uSectionType  → jam: camera accelerates, space: camera hovers
 *   uShaderHoldProgress → cave system evolves (narrow → cathedral → grotto)
 *   uClimaxPhase  → full-chamber bioluminescent eruption
 *   uPalettePrimary/Secondary → cavern tinting
 *   uSemanticAmbient → enhances bioluminescent calm glow
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const luminousCavernVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.05, // lower threshold → more bloom from bioluminescence
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
});

const lcNormal = buildRaymarchNormal("lcMap($P, energy, bass, ft, holdP)", { eps: 0.002, name: "lcNormal" });
const lcAO = buildRaymarchAO("lcMap($P, energy, bass, ft, holdP)", { name: "lcAO" });
const lcDepth = buildDepthAlphaOutput("td", "18.0");

export const luminousCavernFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;
#define TAU 6.28318530
#define PI 3.14159265

// ─── SDF PRIMITIVES ────────────────────────────────────────────────

float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

// Smooth minimum for organic blending
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(a-b)/k, 0.0, 1.0);
  return mix(a, b, h) - k*h*(1.0-h);
}

// ─── CAVE MAP ──────────────────────────────────────────────────────

float lcMap(vec3 p, float energy, float bass, float ft, float holdP) {
  // Cave tunnel — carved from solid rock via displaced cylinder
  float caveRadius = 2.2 + holdP * 1.2; // opens up over time
  float cz = p.z;

  // Tunnel cross-section: organic, not circular
  float angle = atan(p.y, p.x);
  float wallWarp = snoise(vec3(angle * 2.0, cz * 0.15, ft * 0.02)) * 0.6
                 + snoise(vec3(angle * 5.0, cz * 0.3, ft * 0.01)) * 0.25;
  wallWarp *= (1.0 + bass * 0.3);

  float tunnel = -(length(p.xy) - caveRadius - wallWarp);

  // Floor — irregular rocky bottom
  float floorH = -1.4 - 0.3 * snoise(vec3(p.x * 0.3, p.z * 0.2, 0.0))
               - 0.15 * snoise(vec3(p.x * 0.8, p.z * 0.6, ft * 0.005));
  float floor2 = p.y - floorH;
  tunnel = max(tunnel, -floor2);

  // Ceiling detail — dripstone formations
  float ceilH = 1.6 + 0.25 * snoise(vec3(p.x * 0.4, p.z * 0.25, 1.0));
  float ceil2 = -(p.y - ceilH);
  tunnel = max(tunnel, -ceil2);

  // Stalactites — hanging from ceiling
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float sz = floor(p.z / 3.0 + fi * 0.7);
    float sh = fract(sin(sz * 127.1 + fi * 311.7) * 43758.5453);
    float sx = (sh - 0.5) * 3.0;
    float sy = ceilH - 0.1;
    vec3 sp = p - vec3(sx, sy, (sz + 0.5) * 3.0 - fi * 0.7 * 3.0);
    // Tapered cone shape
    float coneR = max(0.0, 0.15 - sp.y * 0.12) * (0.8 + sh * 0.4);
    float cone = length(sp.xz) - coneR;
    float coneH = sp.y + (0.4 + sh * 0.8 + bass * 0.15);
    float stalactite = max(cone, coneH);
    stalactite = max(stalactite, -sp.y); // only below attachment
    tunnel = smin(tunnel, stalactite, 0.15);
  }

  // Stalagmites — growing from floor
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sz = floor(p.z / 4.0 + fi * 1.3);
    float sh = fract(sin(sz * 269.5 + fi * 183.3) * 43758.5453);
    float sx = (sh - 0.5) * 2.5;
    float sy = floorH + 0.05;
    vec3 sp = p - vec3(sx, sy, (sz + 0.5) * 4.0 - fi * 1.3 * 4.0);
    // Inverted tapered cone
    float coneR = max(0.0, 0.12 + sp.y * 0.08) * (0.7 + sh * 0.5);
    float cone = length(sp.xz) - coneR;
    float coneH = -(sp.y - (0.3 + sh * 0.6));
    float stalagmite = max(cone, coneH);
    stalagmite = max(stalagmite, sp.y - (0.3 + sh * 0.6));
    tunnel = smin(tunnel, stalagmite, 0.12);
  }

  // Crystal formations — faceted hexagonal prisms jutting from walls
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cSeed = fract(sin(fi * 73.1 + floor(p.z / 5.0) * 91.3) * 43758.5453);
    if (cSeed > 0.6) continue; // sparse placement
    float cAngle = cSeed * TAU;
    float cR = caveRadius * 0.85;
    vec3 crystalPos = vec3(cos(cAngle) * cR, sin(cAngle) * cR, mod(p.z + fi * 1.7, 5.0) - 2.5);
    vec3 cp = p - crystalPos;
    // Rotate crystal to point inward
    float ca = -cAngle - PI * 0.5;
    float cc = cos(ca), cs = sin(ca);
    cp.xy = mat2(cc, cs, -cs, cc) * cp.xy;
    // Hexagonal cross-section
    vec3 ap = abs(cp);
    float hex = max(ap.x, ap.x * 0.5 + ap.z * 0.866);
    float crystal = max(hex - (0.06 + energy * 0.04), ap.y - (0.3 + cSeed * 0.4));
    tunnel = smin(tunnel, crystal, 0.05);
  }

  return tunnel;
}

${lcNormal}
${lcAO}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // Audio drives
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float ambient = clamp(uSemanticAmbient, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float ft = uDynamicTime * (0.02 + slowE * 0.06) * (1.0 + sJam * 0.5 - sSpace * 0.6);

  // ─── PALETTE ────────────────────────────────────────────────────
  vec3 caveTint = paletteHueColor(uPalettePrimary, 0.3, 0.5);
  vec3 bioGlow = paletteHueColor(uPaletteSecondary, 0.9, 0.8);
  vec3 causticCol = mix(vec3(0.4, 0.7, 1.0), bioGlow, 0.3);
  vec3 crystalCol = mix(vec3(0.6, 0.8, 1.0), paletteHueColor(uPalettePrimary, 0.7, 0.9), 0.5);

  // ─── CAMERA — glides through cave system ────────────────────────
  // Hold progress evolves the journey: entrance → main chamber → deep grotto
  float fwd = ft * 2.5;
  float camSway = sin(ft * 0.07) * 0.3 * (1.0 - sSpace * 0.7); // less sway in space
  float camBob = cos(ft * 0.05) * 0.15;
  vec3 ro = vec3(camSway, camBob - 0.3, fwd);
  vec3 target = ro + vec3(sin(ft * 0.04) * 0.15, cos(ft * 0.03) * 0.1, 3.0);

  // Camera system
  vec3 fw = normalize(target - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up2 = cross(fw, ri);
  float fov = 0.75 + energy * 0.15 + holdP * 0.1;
  vec3 rd = normalize(p.x * ri + p.y * up2 + fov * fw);

  // ─── RAYMARCH ───────────────────────────────────────────────────
  float td = 0.0;
  vec3 hp = ro;
  bool hit = false;
  int maxSteps = int(mix(48.0, 96.0, energy));

  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * td;
    float d = lcMap(ps, energy, bass, ft, holdP);
    if (d < 0.002) {
      hp = ps;
      hit = true;
      break;
    }
    if (td > 18.0) break;
    td += d * 0.65; // smaller steps for precision in detailed cave
  }

  // ─── SHADING ────────────────────────────────────────────────────
  vec3 col = vec3(0.0);

  if (hit) {
    vec3 n = lcNormal(hp);
    float ao = lcAO(hp, n);

    // Key light from above (distant surface opening)
    vec3 lightDir = normalize(vec3(0.2, 0.9, 0.3 + sin(ft * 0.05) * 0.2));
    float diff = max(dot(n, lightDir), 0.0);
    vec3 shLight = sharedDiffuse(n);
    float blendDiff = mix(diff, dot(shLight, vec3(0.333)), 0.3);

    // Specular — wet stone surface
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0 + energy * 48.0);
    vec3 shSpec = sharedSpecular(n, -rd, 32.0 + energy * 48.0);
    float blendSpec = mix(spec, dot(shSpec, vec3(0.333)), 0.3);

    // Fresnel — glancing angles glow from bioluminescence
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    // Distance fog — deeper = darker
    float depth = clamp(td / 15.0, 0.0, 1.0);

    // Base stone color — dark, tinted by palette
    vec3 stone = mix(caveTint * 0.12, caveTint * 0.03, depth);

    // ─── BIOLUMINESCENCE ───────────────────────────────────────
    // Organisms on walls pulse with vocal presence and slow energy
    float bioNoise = snoise(hp * 1.5 + ft * 0.1);
    float bioNoise2 = snoise(hp * 3.0 - ft * 0.15);
    float bioPulse = smoothstep(0.2, 0.7, bioNoise) * smoothstep(0.3, 0.8, bioNoise2);
    float bioIntensity = bioPulse * (0.3 + slowE * 0.7 + vocalP * 0.5 + ambient * 0.4);
    // Drum onset: burst flash across all organisms
    bioIntensity += drumOn * bioPulse * 2.0;
    // Climax: full chamber eruption
    bioIntensity += climB * 1.5;
    bioIntensity = clamp(bioIntensity, 0.0, 3.0);

    // ─── MINERAL VEINS ─────────────────────────────────────────
    // Glowing veins in the rock that pulse with bass
    float veinNoise = abs(snoise(hp * vec3(2.0, 4.0, 2.0) + vec3(0.0, 0.0, ft * 0.03)));
    float veins = smoothstep(0.05, 0.0, veinNoise) * (0.5 + bass * 2.0 + stemBass * 1.5);

    // ─── CAUSTICS ──────────────────────────────────────────────
    // Underwater light patterns on surfaces — more visible at shallow depth
    float caustic1 = snoise(hp.xz * 2.0 + ft * 0.3 + beatSnap * 0.5);
    float caustic2 = snoise(hp.xz * 3.5 - ft * 0.2 + beatSnap * 0.3);
    float caustics = pow(max(caustic1 * caustic2, 0.0), 2.0) * (1.0 - depth) * (0.5 + energy * 1.5);
    // More intense when looking up (light from above)
    caustics *= smoothstep(-0.3, 0.8, n.y);

    // ─── CRYSTAL GLOW ──────────────────────────────────────────
    // Crystals refract and glow with energy
    float crystalGlow = smoothstep(0.5, 0.0, abs(lcMap(hp + n * 0.1, energy, bass, ft, holdP))) * energy * 0.5;

    // ─── COMPOSE ───────────────────────────────────────────────
    col = stone * (0.04 + blendDiff * 0.2) * ao;      // diffuse lit stone
    col += caveTint * blendSpec * 0.08;                // wet specular
    col += bioGlow * bioIntensity * 0.15;              // bioluminescence
    col += causticCol * caustics * 0.12;               // caustic patterns
    col += caveTint * veins * 0.08;                    // mineral veins
    col += crystalCol * crystalGlow;                   // crystal refraction
    col += bioGlow * fresnel * 0.04 * slowE;           // rim bioluminescence

    col *= 0.7 + energy * 0.6;
  } else {
    // Deep water void — very dark blue
    col = caveTint * 0.008 + causticCol * 0.003;
  }

  // ─── GOD RAYS — from distant surface opening ──────────────────
  vec3 lightPos = vec3(sin(ft * 0.06) * 0.5, 2.5, ro.z + 6.0);
  float rays = 0.0;
  for (int g = 0; g < 12; g++) {
    float gt = 0.3 + float(g) * 1.0;
    if (gt > td && hit) break;
    vec3 gp = ro + rd * gt;
    float occ = lcMap(gp + normalize(lightPos - gp) * 0.5, energy, bass, ft, holdP);
    // Volumetric fog density — increases with bass
    float fog = fbm3(gp * 0.2 + ft * 0.015) * (0.04 + bass * 0.2 + stemBass * 0.15);
    rays += smoothstep(-0.1, 0.3, occ) * 0.015 * (0.2 + fog);
  }
  col += causticCol * rays * (0.2 + vocalP * 0.6 + climB * 0.5);

  // ─── MARINE SNOW — drifting particles ──────────────────────────
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 snowP = fract(rd * (8.0 + fi * 3.0) + ft * vec3(0.01, -0.02, 0.01) * (1.0 + fi * 0.3)) - 0.5;
    float snowDot = smoothstep(0.03, 0.01, length(snowP.xy));
    float snowDepth = smoothstep(0.0, 1.0, snowP.z + 0.5);
    col += causticCol * snowDot * snowDepth * 0.02 * (0.5 + slowE * 0.5);
  }

  // ─── FINAL ─────────────────────────────────────────────────────
  col += caveTint * 0.01;
  col *= 1.0 + beatSnap * 0.15;
  float vig = 1.0 - dot(p * 0.3, p * 0.3);
  col = mix(vec3(0.01, 0.008, 0.02), col, smoothstep(0.0, 1.0, vig));
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${lcDepth}
}
`;
