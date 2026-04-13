/**
 * Molten Forge — A+++ raymarched underground foundry/forge.
 *
 * A vast subterranean forge with industrial scale and volcanic energy:
 *   - Anvil SDFs with worn metallic surfaces
 *   - Molten metal rivers flowing through channels (emissive SDF)
 *   - Hammer mechanisms and gear assemblies (rotating SDFs)
 *   - Forge fire casting volumetric orange light
 *   - Sparks erupting on drum onsets
 *   - Organic rock walls with mineral veins and heat glow
 *   - Camera moving through the foundry on a rail
 *
 * Audio reactivity (13+ uniforms):
 *   uSlowEnergy      -> forge fire intensity, ambient heat glow
 *   uEnergy          -> overall illumination, mechanism speed
 *   uBass            -> anvil strikes, ground tremor
 *   uDrumOnset       -> spark eruptions, hammer strikes
 *   uVocalPresence   -> molten metal brightness
 *   uBeatSnap        -> gear tooth engagement flash
 *   uStemBass        -> deep volcanic rumble
 *   uStemDrums       -> hammer mechanism sync
 *   uSectionType     -> jam: mechanisms speed up, space: embers drift
 *   uShaderHoldProgress -> forge reveals (antechamber -> main forge -> deep crucible)
 *   uClimaxPhase     -> full eruption — all channels overflow
 *   uPalettePrimary/Secondary -> forge palette
 *   uSemanticAggressive -> fire intensity boost
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const moltenForgeVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.04,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
});

const mfNormal = buildRaymarchNormal("mfMap($P, energy, bass, ft, holdP, drumOn)", { eps: 0.003, name: "mfNormal" });
const mfAO = buildRaymarchAO("mfMap($P, energy, bass, ft, holdP, drumOn)", { name: "mfAO" });
const mfDepth = buildDepthAlphaOutput("td", "18.0");

export const moltenForgeFrag = /* glsl */ `
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

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(a-b)/k, 0.0, 1.0);
  return mix(a, b, h) - k*h*(1.0-h);
}

float sdCylinder(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ─── FORGE MAP ────────────────────────────────────────────────────

float mfMap(vec3 p, float energy, float bass, float ft, float holdP, float drumOn) {
  // Cavern shell — rough volcanic rock
  float caveR = 3.0 + holdP * 1.5;
  float wallWarp = snoise(vec3(p.x * 0.2, p.y * 0.15, p.z * 0.12)) * 0.8
                 + snoise(vec3(p.x * 0.5, p.y * 0.4, p.z * 0.3)) * 0.3;
  wallWarp *= (1.0 + bass * 0.2);
  float cave = -(length(p.xy) - caveR - wallWarp);

  // Floor — irregular rocky with channels
  float floorH = -2.0 + snoise(vec3(p.x * 0.25, p.z * 0.2, 0.0)) * 0.3;
  float floor2 = p.y - floorH;
  cave = max(cave, -floor2);

  // Ceiling — domed with stalactites
  float ceilH = 2.5 + snoise(vec3(p.x * 0.3, p.z * 0.25, 1.0)) * 0.5;
  float ceil2 = -(p.y - ceilH);
  cave = max(cave, -ceil2);

  float d = cave;

  // Molten metal channels — carved into the floor
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cx = (fi - 1.0) * 1.8;
    float channelWarp = sin(p.z * 0.5 + fi * 2.0 + ft * 0.05) * 0.3;
    vec3 cp = p - vec3(cx + channelWarp, floorH - 0.1, 0.0);
    float channel = sdBox(cp, vec3(0.2, 0.15, 100.0));
    d = max(d, -channel); // carve channel
  }

  // Anvil — central work station
  float anvZ = floor(p.z / 6.0) * 6.0 + 3.0;
  vec3 anvP = p - vec3(0.0, floorH + 0.6, anvZ);
  // Anvil body — trapezoidal
  float anvilBody = sdBox(anvP, vec3(0.4, 0.3, 0.3));
  // Anvil horn
  vec3 hornP = anvP - vec3(0.5, 0.1, 0.0);
  float horn = sdCylinder(hornP.xzy, 0.08, 0.25);
  float anvil = min(anvilBody, horn);
  // Anvil base (wider)
  float anvBase = sdBox(anvP - vec3(0.0, -0.35, 0.0), vec3(0.5, 0.1, 0.4));
  anvil = min(anvil, anvBase);
  d = min(d, anvil);

  // Hammer mechanism — oscillating with drum/beat
  float hammerPhase = ft * 2.0 + drumOn * PI;
  float hammerY = 0.5 + abs(sin(hammerPhase)) * 0.8;
  vec3 hamP = p - vec3(0.0, floorH + hammerY + 0.6, anvZ);
  float hammer = sdBox(hamP, vec3(0.15, 0.3, 0.12));
  // Hammer handle
  vec3 handleP = hamP - vec3(0.0, 0.35, 0.0);
  float handle = sdCylinder(handleP, 0.03, 0.3);
  hammer = min(hammer, handle);
  d = min(d, hammer);

  // Gear assemblies — rotating wheels on walls
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float gz = floor(p.z / 4.0 + fi * 0.5) * 4.0 + 2.0;
    float gx = (fi == 0.0) ? -caveR + 0.8 : caveR - 0.8;
    vec3 gp = p - vec3(gx, 0.5, gz);
    // Rotating gear — torus with teeth
    float gAngle = ft * (1.0 + energy * 2.0) + fi * PI;
    float gc = cos(gAngle), gs = sin(gAngle);
    gp.xy = mat2(gc, gs, -gs, gc) * gp.xy;
    float gearR = 0.5;
    float gear = length(vec2(length(gp.xy) - gearR, gp.z)) - 0.06;
    // Gear teeth
    float toothAngle = atan(gp.y, gp.x);
    float teeth = sin(toothAngle * 12.0) * 0.03;
    gear -= max(teeth, 0.0);
    d = min(d, gear);
  }

  // Support pillars — thick stone columns
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float pz = floor(p.z / 5.0 + fi * 0.3) * 5.0 + 2.5;
    float ph = fract(sin(pz * 127.1 + fi * 311.7) * 43758.5453);
    float px = (ph - 0.5) * 4.0;
    vec3 pp = p - vec3(px, 0.0, pz);
    float pillar = length(pp.xz) - (0.25 + ph * 0.1);
    pillar += snoise(vec3(pp.y * 2.0, ph * 10.0, 0.0)) * 0.04;
    float pillarH = abs(pp.y) - (ceilH + 2.0);
    pillar = max(pillar, pillarH);
    d = min(d, pillar);
  }

  // Crucible — large molten metal basin (appears with holdP)
  if (holdP > 0.5) {
    float crucZ = floor(p.z / 8.0) * 8.0 + 4.0;
    vec3 crP = p - vec3(1.5, floorH + 0.4, crucZ);
    float crucOuter = length(crP.xz) - 0.6;
    float crucInner = length(crP.xz) - 0.5;
    float crucH = abs(crP.y) - 0.5;
    float crucible = max(crucOuter, crucH);
    float hollow = max(-crucInner, -(crP.y - 0.1)); // hollow inside
    crucible = max(crucible, hollow);
    d = min(d, crucible);
  }

  return d;
}

${mfNormal}
${mfAO}

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
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float aggressive = clamp(uSemanticAggressive, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));
  float ft = uDynamicTime * (0.02 + slowE * 0.06) * (1.0 + sJam * 0.6 - sSpace * 0.5);

  // ─── PALETTE — forge: molten amber/orange, deep iron-brown shadows ───
  // Bias primary toward orange-amber (hue 0.06–0.1), secondary toward deep crimson (0.0–0.04)
  float forgeHue1 = mix(uPalettePrimary, 0.08 + fract(uPalettePrimary) * 0.05, 0.55);
  float forgeHue2 = mix(uPaletteSecondary, 0.02 + fract(uPaletteSecondary) * 0.03, 0.5);
  vec3 moltenOrange = paletteHueColor(forgeHue1, 0.95, 0.9);
  vec3 forgeRed = paletteHueColor(forgeHue2, 0.9, 0.65);
  vec3 darkIron = mix(vec3(0.05, 0.03, 0.015), moltenOrange * 0.04, 0.2); // deep brown, not black
  vec3 sparkCol = mix(vec3(1.0, 0.75, 0.25), moltenOrange, 0.35); // white-hot sparks

  // ─── CAMERA — rail through the foundry ─────────────────────────
  float fwd = ft * 2.0;
  float camSway = sin(ft * 0.05) * 0.5 * (1.0 - sSpace * 0.6);
  float camH = -0.8 + sin(ft * 0.03) * 0.2;
  vec3 ro = vec3(camSway, camH, fwd);
  vec3 target = ro + vec3(sin(ft * 0.04) * 0.3, 0.1 + sSolo * 0.2, 3.5);

  vec3 fw = normalize(target - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up2 = cross(fw, ri);
  float fov = 0.72 + energy * 0.12;
  vec3 rd = normalize(p.x * ri + p.y * up2 + fov * fw);

  // ─── RAYMARCH ───────────────────────────────────────────────────
  float td = 0.0;
  vec3 hp = ro;
  bool hit = false;
  int maxSteps = int(mix(48.0, 92.0, energy));

  for (int i = 0; i < 92; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * td;
    float d = mfMap(ps, energy, bass, ft, holdP, drumOn);
    if (d < 0.002) {
      hp = ps;
      hit = true;
      break;
    }
    if (td > 18.0) break;
    td += d * 0.65;
  }

  // ─── SHADING ────────────────────────────────────────────────────
  vec3 col = vec3(0.0);

  if (hit) {
    vec3 n = mfNormal(hp);
    float ao = mfAO(hp, n);

    // Forge fire light — warm directional from below and side
    vec3 fireLightDir = normalize(vec3(0.2, -0.5, 0.3));
    vec3 topLight = normalize(vec3(-0.3, 0.7, 0.2));
    float diff1 = max(dot(n, -fireLightDir), 0.0); // light from below
    float diff2 = max(dot(n, topLight), 0.0) * 0.4;
    vec3 shLight = sharedDiffuse(n);
    float blendDiff = mix(diff1 + diff2, dot(shLight, vec3(0.333)), 0.2);

    // Specular — metallic surfaces
    float spec = pow(max(dot(reflect(fireLightDir, n), -rd), 0.0), 24.0 + energy * 48.0);
    vec3 shSpec = sharedSpecular(n, -rd, 24.0 + energy * 48.0);
    float blendSpec = mix(spec, dot(shSpec, vec3(0.333)), 0.25);

    // Fresnel — heat glow on edges
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.5);

    float depth = clamp(td / 14.0, 0.0, 1.0);

    // Material: identify molten channels vs stone vs metal
    float floorH = -2.0 + snoise(vec3(hp.x * 0.25, hp.z * 0.2, 0.0)) * 0.3;
    float isMolten = smoothstep(0.3, 0.0, abs(hp.y - floorH + 0.1)) *
                     smoothstep(0.4, 0.1, abs(mod(hp.x + 1.8, 1.8) - 0.9));
    float isAnvil = smoothstep(0.5, 0.3, length(hp.xy - vec2(0.0, floorH + 0.6)));

    // Base materials
    vec3 matCol = darkIron; // default: dark volcanic rock
    matCol = mix(matCol, vec3(0.06, 0.05, 0.04), isAnvil); // polished metal
    // Heat glow on surfaces near molten channels
    float heatProx = smoothstep(1.0, 0.0, abs(hp.y - floorH)) * 0.5;
    vec3 heatGlow = forgeRed * heatProx * (0.3 + slowE * 0.7 + aggressive * 0.5);

    // Molten emission
    float moltenGlow = isMolten * (1.0 + vocalP * 1.5 + climB * 2.0);
    float moltenFlow = sin(hp.z * 3.0 - ft * 2.0) * 0.3 + 0.7;
    moltenGlow *= moltenFlow;

    col = matCol * (0.03 + blendDiff * 0.3) * ao;
    col += moltenOrange * blendSpec * 0.12;
    col += forgeRed * fresnel * 0.05 * (0.5 + aggressive * 0.5);
    col += heatGlow * 0.1;
    col += moltenOrange * moltenGlow * 0.25;
    col *= 0.6 + energy * 0.7;
    col = mix(col, darkIron * 0.5, depth * 0.3);
  } else {
    // Deep forge void — smoky darkness with ember glow
    col = darkIron * 0.02 + forgeRed * 0.005;
  }

  // ─── VOLUMETRIC FORGE FIRE — orange light from below ───────────
  float rays = 0.0;
  for (int g = 0; g < 12; g++) {
    float gt = 0.4 + float(g) * 1.0;
    if (gt > td && hit) break;
    vec3 gp = ro + rd * gt;
    float occ = mfMap(gp + vec3(0.0, 0.5, 0.0), energy, bass, ft, holdP, drumOn);
    // Fire/smoke density — concentrated near floor
    float fireDensity = smoothstep(0.5, -2.5, gp.y) * (0.04 + bass * 0.12 + stemBass * 0.1);
    // Smoke turbulence
    float smoke = fbm3(gp * 0.3 + ft * 0.03) * 0.5 + 0.5;
    fireDensity *= (0.5 + smoke * 0.5);
    rays += smoothstep(-0.2, 0.3, occ) * fireDensity * 0.02;
  }
  col += moltenOrange * rays * (0.3 + slowE * 0.6 + climB * 1.0 + aggressive * 0.4);

  // ─── SPARKS — erupting on drum onsets ──────────────────────────
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    float sparkSeed = fract(sin(fi * 127.1 + floor(ft * 4.0) * 311.7) * 43758.5453);
    // Sparks only active during/after drum hits
    float sparkLife = fract(ft * 3.0 + fi * 0.1);
    float sparkAlive = drumOn * step(0.0, 1.0 - sparkLife) + stemDrums * 0.3;
    if (sparkAlive < 0.1) continue;

    vec3 sparkPos = vec3(
      (sparkSeed - 0.5) * 3.0,
      -1.0 + sparkLife * 3.0 - sparkLife * sparkLife * 2.0, // parabolic arc
      ro.z + 2.0 + sparkSeed * 4.0
    );
    vec3 toSpark = sparkPos - ro;
    float sparkDist = length(toSpark);
    float sparkDot = dot(normalize(toSpark), rd);
    float sparkGlow = smoothstep(0.997, 1.0, sparkDot) * sparkAlive / (1.0 + sparkDist * 0.3);
    sparkGlow *= (1.0 - sparkLife); // fade as they fly
    col += sparkCol * sparkGlow * 0.5;
  }

  // ─── FINAL ─────────────────────────────────────────────────────
  col += moltenOrange * 0.008;
  col *= 1.0 + beatSnap * 0.15;
  float vig = 1.0 - dot(p * 0.28, p * 0.28);
  col = mix(vec3(0.03, 0.015, 0.005), col, smoothstep(0.0, 1.0, vig)); // warm maroon vignette
  col = max(col, vec3(0.03, 0.018, 0.008)); // deep brown floor, never neutral black
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${mfDepth}
}
`;
