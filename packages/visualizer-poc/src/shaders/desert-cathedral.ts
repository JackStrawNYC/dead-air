/**
 * Desert Cathedral — A+++ raymarched desert canyon with natural arches.
 *
 * A vast sandstone canyon at golden hour with:
 *   - Banded sandstone layers with erosion displacement (stratified color)
 *   - A colossal natural arch SDF spanning the canyon
 *   - Dust motes dancing in angled sunlight beams
 *   - Distant mesa silhouettes via layered height fields
 *   - Wind-carved alcoves and hoodoo formations
 *   - Golden hour directional lighting with long shadows
 *   - Camera panning through the winding canyon
 *
 * Audio reactivity (12+ uniforms):
 *   uSlowEnergy     -> golden light intensity, dust density
 *   uEnergy         -> overall illumination, erosion detail
 *   uBass           -> sandstone resonance, mesa vibration
 *   uDrumOnset      -> dust burst eruption
 *   uVocalPresence  -> sunbeam intensity, heat shimmer
 *   uBeatSnap       -> sand particle flash
 *   uStemBass       -> deep canyon echo resonance
 *   uSectionType    -> jam: faster pan, space: hover and gaze
 *   uShaderHoldProgress -> canyon deepens (entrance -> narrows -> arch chamber)
 *   uClimaxPhase    -> full golden hour supernova lighting
 *   uPalettePrimary/Secondary -> canyon palette
 *   uSemanticRhythmic -> enhances heat shimmer
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const desertCathedralVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: 0.03,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
});

const dcNormal = buildRaymarchNormal("dcMap($P, energy, bass, ft, holdP)", { eps: 0.003, name: "dcNormal" });
const dcAO = buildRaymarchAO("dcMap($P, energy, bass, ft, holdP)", { name: "dcAO" });
const dcDepth = buildDepthAlphaOutput("td", "25.0");

export const desertCathedralFrag = /* glsl */ `
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

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// ─── CANYON MAP ───────────────────────────────────────────────────

float dcMap(vec3 p, float energy, float bass, float ft, float holdP) {
  // Canyon walls — carved from solid sandstone mass
  float canyonWidth = 2.5 - holdP * 0.8; // narrows over time
  float wallWarp = snoise(vec3(p.y * 0.2, p.z * 0.1, 0.0)) * 1.2
                 + snoise(vec3(p.y * 0.5, p.z * 0.25, 1.0)) * 0.5;
  wallWarp += snoise(vec3(p.y * 1.2, p.z * 0.6, 2.0)) * 0.2 * (1.0 + bass * 0.4);

  // Left and right canyon walls
  float leftWall = -(p.x + canyonWidth + wallWarp);
  float rightWall = p.x - canyonWidth - wallWarp * 0.8;
  float canyon = min(leftWall, rightWall);

  // Banded erosion layers — horizontal striping in sandstone
  float bands = sin(p.y * 4.0) * 0.08 + sin(p.y * 12.0 + p.z * 0.5) * 0.03;
  bands += sin(p.y * 25.0) * 0.015 * (1.0 + energy * 0.5);
  canyon -= bands;

  // Canyon floor — sandy with scattered rocks
  float floorH = -3.0 + snoise(vec3(p.x * 0.3, p.z * 0.2, 3.0)) * 0.3
               + snoise(vec3(p.x * 0.8, p.z * 0.5, 4.0)) * 0.1;
  float floor2 = p.y - floorH;
  canyon = max(canyon, -floor2);

  // Canyon ceiling — open sky in parts, narrow slot in others
  float ceilH = 5.0 + holdP * 2.0 + snoise(vec3(p.x * 0.2, p.z * 0.15, 5.0)) * 1.5;
  float ceil2 = -(p.y - ceilH);
  canyon = max(canyon, -ceil2);

  // Natural arch — massive torus carved into the canyon wall
  float archZ = floor(p.z / 12.0) * 12.0 + 6.0;
  float archDist = abs(p.z - archZ);
  if (archDist < 6.0) {
    vec3 ap = p - vec3(0.0, 1.5, archZ);
    // Rotate torus to span across canyon
    float arch = sdTorus(ap.xzy, vec2(canyonWidth + 0.5, 0.6 + bass * 0.1));
    // Sandstone texture on arch
    arch -= snoise(vec3(ap * 2.0 + ft * 0.005)) * 0.08;
    canyon = smin(canyon, arch, 0.4);
  }

  // Hoodoo formations — tall narrow pillars
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float hz = floor(p.z / 8.0 + fi * 0.6);
    float hh = fract(sin(hz * 127.1 + fi * 311.7) * 43758.5453);
    if (hh < 0.5) continue;
    float hx = (hh - 0.5) * 3.0;
    float hpz = (hz + 0.5) * 8.0 - fi * 0.6 * 8.0;
    vec3 hp2 = p - vec3(hx, 0.0, hpz);
    // Tapered column with cap
    float colR = 0.2 + hh * 0.15 - hp2.y * 0.02;
    colR += snoise(vec3(hp2.y * 2.0, hh * 10.0, 0.0)) * 0.05;
    float hoodoo = length(hp2.xz) - max(colR, 0.05);
    float hoodooH = abs(hp2.y - floorH - 1.0) - (1.5 + hh * 1.0);
    hoodoo = max(hoodoo, hoodooH);
    // Cap rock (wider top)
    vec3 capP = hp2 - vec3(0.0, floorH + 2.0 + hh * 1.0, 0.0);
    float cap = length(capP) - (colR + 0.1);
    hoodoo = smin(hoodoo, cap, 0.1);
    canyon = smin(canyon, hoodoo, 0.2);
  }

  // Alcove carving — wind-eroded hollows in walls
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float az = floor(p.z / 6.0 + fi * 1.2);
    float ah = fract(sin(az * 91.3 + fi * 73.7) * 43758.5453);
    float apz = (az + 0.5) * 6.0 - fi * 1.2 * 6.0;
    float side = step(0.5, ah) * 2.0 - 1.0; // left or right wall
    vec3 alP = p - vec3(side * (canyonWidth + 0.5), 0.5 + ah * 2.0, apz);
    float alcove = length(alP) - (0.6 + ah * 0.4);
    canyon = max(canyon, -alcove); // carve out
  }

  return canyon;
}

${dcNormal}
${dcAO}

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
  float rhythmic = clamp(uSemanticRhythmic, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));
  float ft = uDynamicTime * (0.02 + slowE * 0.05) * (1.0 + sJam * 0.5 - sSpace * 0.6);

  // ─── PALETTE ────────────────────────────────────────────────────
  vec3 sandstone = paletteHueColor(uPalettePrimary, 0.45, 0.65);
  vec3 goldenSun = paletteHueColor(uPaletteSecondary, 0.8, 0.95);
  vec3 deepShadow = mix(vec3(0.08, 0.04, 0.02), sandstone * 0.1, 0.3);
  vec3 skyWarm = mix(vec3(0.9, 0.6, 0.3), goldenSun, 0.4);

  // ─── CAMERA — pan through winding canyon ────────────────────────
  float fwd = ft * 2.5;
  float camCurve = sin(ft * 0.05) * 0.8 * (1.0 - sSpace * 0.6);
  float camH = -1.5 + cos(ft * 0.03) * 0.3 + holdP * 0.5;
  vec3 ro = vec3(camCurve, camH, fwd);
  vec3 target = ro + vec3(sin(ft * 0.04) * 0.3, 0.4 + sSolo * 0.3, 4.0);

  vec3 fw = normalize(target - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up2 = cross(fw, ri);
  float fov = 0.75 + energy * 0.12;
  vec3 rd = normalize(p.x * ri + p.y * up2 + fov * fw);

  // ─── RAYMARCH ───────────────────────────────────────────────────
  float td = 0.0;
  vec3 hp = ro;
  bool hit = false;
  int maxSteps = int(mix(48.0, 96.0, energy));

  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * td;
    float d = dcMap(ps, energy, bass, ft, holdP);
    if (d < 0.002) {
      hp = ps;
      hit = true;
      break;
    }
    if (td > 25.0) break;
    td += d * 0.65;
  }

  // ─── SHADING ────────────────────────────────────────────────────
  vec3 col = vec3(0.0);

  if (hit) {
    vec3 n = dcNormal(hp);
    float ao = dcAO(hp, n);

    // Golden hour sun — low angle, warm
    vec3 sunDir = normalize(vec3(0.6, 0.35, -0.3));
    float diff = max(dot(n, sunDir), 0.0);
    vec3 shLight = sharedDiffuse(n);
    float blendDiff = mix(diff, dot(shLight, vec3(0.333)), 0.25);

    // Specular — polished sandstone highlights
    float spec = pow(max(dot(reflect(-sunDir, n), -rd), 0.0), 20.0 + energy * 40.0);
    vec3 shSpec = sharedSpecular(n, -rd, 20.0 + energy * 40.0);
    float blendSpec = mix(spec, dot(shSpec, vec3(0.333)), 0.3);

    // Fresnel
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    float depth = clamp(td / 20.0, 0.0, 1.0);

    // Sandstone banding color — layered red/orange/cream
    float bandLayer = sin(hp.y * 4.0) * 0.5 + 0.5;
    float bandLayer2 = sin(hp.y * 12.0 + hp.z * 0.3) * 0.5 + 0.5;
    vec3 bandColor = mix(sandstone * 0.8, sandstone * 1.2, bandLayer);
    bandColor = mix(bandColor, vec3(0.9, 0.7, 0.4), bandLayer2 * 0.3);

    // Compose
    col = bandColor * (0.06 + blendDiff * 0.5) * ao;
    col += goldenSun * blendSpec * 0.15;
    col += skyWarm * fresnel * 0.04;
    col *= 0.6 + energy * 0.6;
    col = mix(col, deepShadow, depth * 0.3);
  } else {
    // Sky — gradient warm to deep blue
    float skyGrad = smoothstep(-0.1, 0.8, rd.y);
    col = mix(skyWarm * 0.15, vec3(0.15, 0.25, 0.5) * 0.08, skyGrad);
    // Distant mesa silhouettes
    float mesaH = -0.1 + snoise(vec3(rd.x * 2.0, 0.0, ft * 0.002)) * 0.15;
    float mesa = smoothstep(mesaH + 0.02, mesaH, rd.y);
    col = mix(col, deepShadow * 0.5, mesa * 0.6);
    col += goldenSun * 0.02 * climB;
  }

  // ─── VOLUMETRIC GOD RAYS — angled sunbeams into canyon ─────────
  vec3 sunBeamDir = normalize(vec3(0.6, 0.4, -0.2));
  float rays = 0.0;
  for (int g = 0; g < 14; g++) {
    float gt = 0.4 + float(g) * 1.2;
    if (gt > td && hit) break;
    vec3 gp = ro + rd * gt;
    float occ = dcMap(gp + sunBeamDir * 0.6, energy, bass, ft, holdP);
    // Dust density — more near floor, responsive to onset
    float dustH = smoothstep(2.0, -2.0, gp.y);
    float dustDensity = dustH * (0.02 + bass * 0.06 + drumOn * 0.15);
    // Heat shimmer distortion
    float shimmer = snoise(vec3(gp.x * 2.0, gp.y * 3.0, ft * 0.5)) * rhythmic * 0.01;
    rays += smoothstep(-0.2, 0.4, occ) * (dustDensity + shimmer) * 0.02;
  }
  col += goldenSun * rays * (0.4 + slowE * 0.8 + vocalP * 0.5 + climB * 1.0);

  // ─── DUST MOTES — floating particles in sunbeams ───────────────
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 dustP = fract(rd * (10.0 + fi * 4.0) + ft * vec3(0.02, -0.005, 0.015) * (1.0 + fi * 0.2)) - 0.5;
    float dustDot = smoothstep(0.025, 0.008, length(dustP.xy));
    float dustDepth = smoothstep(0.0, 1.0, dustP.z + 0.5);
    // Only visible in lit areas
    float inLight = smoothstep(0.0, 0.3, dot(rd, sunBeamDir) + 0.5);
    col += goldenSun * dustDot * dustDepth * inLight * 0.03 * (0.4 + drumOn * 1.0 + beatSnap * 0.6);
  }

  // ─── FINAL ─────────────────────────────────────────────────────
  col += sandstone * 0.006;
  col *= 1.0 + beatSnap * 0.1;
  float vig = 1.0 - dot(p * 0.25, p * 0.25);
  col = mix(vec3(0.02, 0.015, 0.01), col, smoothstep(0.0, 1.0, vig));
  col = max(col, vec3(0.02, 0.015, 0.01));
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${dcDepth}
}
`;
