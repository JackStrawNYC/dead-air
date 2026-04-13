/**
 * Ancient Forest — A+++ raymarched primeval redwood forest.
 *
 * A cathedral-scale old-growth forest with:
 *   - Massive tree trunk SDFs with bark displacement (ridged noise cylinders)
 *   - Cathedral canopy filtering dappled volumetric light shafts
 *   - Forest floor with fern fronds and luminescent mushroom clusters
 *   - Volumetric mist pooling between ancient trunks
 *   - Fireflies pulsing in sync with vocal presence
 *   - Slow camera walk along a winding forest path
 *
 * Audio reactivity (12+ uniforms):
 *   uSlowEnergy     -> canopy light intensity, mist density
 *   uEnergy         -> overall illumination, bark detail depth
 *   uBass           -> trunk resonance vibration, ground rumble
 *   uDrumOnset      -> firefly burst flash
 *   uVocalPresence  -> firefly pulse rate, mushroom glow
 *   uBeatSnap       -> dappled light flicker
 *   uStemBass       -> deep root resonance
 *   uSectionType    -> jam: faster walk, space: camera hovers
 *   uShaderHoldProgress -> forest deepens (meadow edge -> deep grove -> ancient hollow)
 *   uClimaxPhase    -> full canopy golden hour eruption
 *   uPalettePrimary/Secondary -> forest palette tinting
 *   uSemanticTender -> enhances soft golden light
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const ancientForestVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.02,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
});

const afNormal = buildRaymarchNormal("afMap($P, energy, bass, ft, holdP)", { eps: 0.003, name: "afNormal" });
const afAO = buildRaymarchAO("afMap($P, energy, bass, ft, holdP)", { name: "afAO" });
const afDepth = buildDepthAlphaOutput("td", "20.0");

export const ancientForestFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;
#define TAU 6.28318530
#define PI 3.14159265

// ─── SDF PRIMITIVES ────────────────────────────────────────────────

float sdCylinder(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(a-b)/k, 0.0, 1.0);
  return mix(a, b, h) - k*h*(1.0-h);
}

// ─── FOREST MAP ───────────────────────────────────────────────────

float afMap(vec3 p, float energy, float bass, float ft, float holdP) {
  // Ground plane — undulating forest floor
  float groundH = -1.8 + snoise(vec3(p.x*0.15, p.z*0.12, 0.0)) * 0.4
                + snoise(vec3(p.x*0.4, p.z*0.35, 1.0)) * 0.15;
  float ground = p.y - groundH;

  // Tree trunks — massive displaced cylinders placed in a grid
  float d = ground;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // Procedural tree placement using hash
    float cellZ = floor(p.z / 4.5 + fi * 0.7);
    float cellX = floor(p.x / 5.0 + fi * 1.3);
    float h1 = fract(sin(cellZ * 127.1 + cellX * 311.7 + fi * 73.3) * 43758.5453);
    float h2 = fract(sin(cellZ * 269.5 + cellX * 183.3 + fi * 41.1) * 43758.5453);
    if (h1 < 0.35) continue; // sparse placement

    float tx = (cellX + 0.3 + h2 * 0.4) * 5.0 - fi * 1.3 * 5.0;
    float tz = (cellZ + 0.3 + h1 * 0.4) * 4.5 - fi * 0.7 * 4.5;
    vec3 tp = p - vec3(tx, 0.0, tz);

    // Bark displacement — ridged noise for deep furrows
    float barkAngle = atan(tp.z, tp.x);
    float bark = snoise(vec3(barkAngle * 3.0, tp.y * 0.8, h1 * 10.0)) * 0.12
               + snoise(vec3(barkAngle * 8.0, tp.y * 2.0, h2 * 10.0)) * 0.05;
    bark *= (1.0 + bass * 0.3);

    // Trunk: tapered cylinder with natural lean
    float lean = sin(ft * 0.005 + h1 * TAU) * 0.02;
    tp.x += tp.y * lean;
    float radius = (0.35 + h1 * 0.25) * (1.0 - tp.y * 0.01); // taper upward
    float trunk = length(tp.xz) - radius - bark;
    float trunkH = abs(tp.y - 3.0) - (4.5 + holdP * 1.5); // taller with holdP
    trunk = max(trunk, trunkH);

    d = smin(d, trunk, 0.3);

    // Root buttresses
    for (int r = 0; r < 3; r++) {
      float ra = float(r) * TAU / 3.0 + h2 * TAU;
      vec3 rp = tp - vec3(cos(ra) * radius * 1.2, groundH + 0.3, sin(ra) * radius * 1.2);
      float root = length(rp) - (0.15 + h1 * 0.1);
      d = smin(d, root, 0.4);
    }
  }

  // Fern fronds on the forest floor — simple displaced spheres
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float fz = floor(p.z / 2.0 + fi * 0.5);
    float fx = floor(p.x / 2.5 + fi * 0.8);
    float fh = fract(sin(fz * 91.3 + fx * 157.1 + fi * 33.7) * 43758.5453);
    if (fh < 0.6) continue;
    float fpx = (fx + fh * 0.6) * 2.5 - fi * 0.8 * 2.5;
    float fpz = (fz + fract(fh * 7.1) * 0.6) * 2.0 - fi * 0.5 * 2.0;
    vec3 fp = p - vec3(fpx, groundH + 0.2, fpz);
    // Flat fern shape: squished ellipsoid
    fp.y *= 3.0;
    float fern = length(fp) - (0.15 + fh * 0.1);
    d = smin(d, fern, 0.1);
  }

  // Mushroom clusters — small glowing domes near tree bases
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float mz = floor(p.z / 3.5 + fi * 1.1);
    float mx = floor(p.x / 3.5 + fi * 0.9);
    float mh = fract(sin(mz * 173.7 + mx * 211.3 + fi * 67.1) * 43758.5453);
    if (mh < 0.5) continue;
    float mpx = (mx + mh * 0.5) * 3.5 - fi * 0.9 * 3.5;
    float mpz = (mz + fract(mh * 3.7) * 0.5) * 3.5 - fi * 1.1 * 3.5;
    vec3 mp = p - vec3(mpx, groundH + 0.08, mpz);
    // Dome cap
    float cap = length(mp - vec3(0.0, 0.04, 0.0)) - (0.06 + mh * 0.03);
    d = smin(d, cap, 0.03);
  }

  return d;
}

${afNormal}
${afAO}

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
  float tender = clamp(uSemanticTender, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));
  float ft = uDynamicTime * (0.015 + slowE * 0.04) * (1.0 + sJam * 0.6 - sSpace * 0.7);

  // ─── PALETTE — ancient forest: deep green shadows, dappled gold highlights ───
  // Bias primary toward forest green (0.28–0.38), secondary toward golden sunlight (0.10–0.15)
  float afH1 = mix(uPalettePrimary, 0.30 + fract(uPalettePrimary) * 0.08, 0.5); // deep green
  float afH2 = mix(uPaletteSecondary, 0.12 + fract(uPaletteSecondary) * 0.05, 0.45); // warm gold
  vec3 forestGreen = paletteHueColor(afH1, 0.45, 0.40); // rich forest green, not generic
  vec3 goldenLight = paletteHueColor(afH2, 0.75, 0.92); // warm dappled gold
  goldenLight = mix(goldenLight, vec3(1.0, 0.88, 0.55), 0.35); // push toward true golden sunlight
  vec3 mistCol = mix(vec3(0.55, 0.65, 0.45), forestGreen * 0.7, 0.25); // green-tinted forest mist
  vec3 barkCol = mix(vec3(0.10, 0.07, 0.03), forestGreen * 0.15, 0.3); // warm brown bark

  // ─── CAMERA — walk along forest path ────────────────────────────
  float fwd = ft * 2.0;
  float pathCurve = sin(ft * 0.06) * 1.5;
  float camH = -0.8 + cos(ft * 0.04) * 0.15;
  vec3 ro = vec3(pathCurve, camH, fwd);
  vec3 target = ro + vec3(sin(ft * 0.03) * 0.4, 0.2 + holdP * 0.3, 3.5);

  vec3 fw = normalize(target - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up2 = cross(fw, ri);
  float fov = 0.7 + energy * 0.1;
  vec3 rd = normalize(p.x * ri + p.y * up2 + fov * fw);

  // ─── RAYMARCH ───────────────────────────────────────────────────
  float td = 0.0;
  vec3 hp = ro;
  bool hit = false;
  int maxSteps = int(mix(48.0, 88.0, energy));

  for (int i = 0; i < 88; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * td;
    float d = afMap(ps, energy, bass, ft, holdP);
    if (d < 0.002) {
      hp = ps;
      hit = true;
      break;
    }
    if (td > 20.0) break;
    td += d * 0.7;
  }

  // ─── SHADING ────────────────────────────────────────────────────
  vec3 col = vec3(0.0);

  if (hit) {
    vec3 n = afNormal(hp);
    float ao = afAO(hp, n);

    // Dappled sunlight from above — canopy filtered
    vec3 sunDir = normalize(vec3(0.3, 0.85, 0.2 + sin(ft * 0.03) * 0.1));
    float diff = max(dot(n, sunDir), 0.0);
    vec3 shLight = sharedDiffuse(n);
    float blendDiff = mix(diff, dot(shLight, vec3(0.333)), 0.25);

    // Canopy dappling — noise-modulated shadow pattern
    float canopyNoise = snoise(vec3(hp.x * 0.5, hp.z * 0.5, ft * 0.02));
    float dapple = smoothstep(-0.2, 0.5, canopyNoise) * (0.5 + beatSnap * 0.5);
    blendDiff *= (0.3 + dapple * 0.7);

    // Specular — wet moss/bark highlights
    float spec = pow(max(dot(reflect(-sunDir, n), -rd), 0.0), 16.0 + energy * 32.0);
    vec3 shSpec = sharedSpecular(n, -rd, 16.0 + energy * 32.0);
    float blendSpec = mix(spec, dot(shSpec, vec3(0.333)), 0.3);

    // Fresnel rim — backlit edges
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.5);

    float depth = clamp(td / 16.0, 0.0, 1.0);

    // Material differentiation: ground vs trunk vs mushroom
    float isGround = smoothstep(-1.5, -1.0, hp.y);
    float isMushroom = smoothstep(0.08, 0.0, abs(hp.y - (-1.6)));
    vec3 matCol = mix(barkCol, vec3(0.05, 0.08, 0.02), isGround * 0.7);
    matCol = mix(matCol, vec3(0.1, 0.15, 0.08), isMushroom);

    // Mushroom bioluminescence
    float mushGlow = isMushroom * (0.3 + vocalP * 1.5 + drumOn * 2.0);

    col = matCol * (0.04 + blendDiff * 0.35) * ao;
    col += goldenLight * blendSpec * 0.1 * dapple;
    col += goldenLight * fresnel * 0.03 * (0.5 + tender * 0.5);
    col += vec3(0.1, 0.4, 0.15) * mushGlow * 0.08;
    col *= 0.7 + energy * 0.5;
    col = mix(col, mistCol * 0.03, depth * 0.4); // distance fog
  } else {
    // Sky through canopy gaps — warm golden
    float skyGrad = smoothstep(-0.1, 0.3, rd.y);
    col = mix(forestGreen * 0.01, goldenLight * 0.06, skyGrad);
    col += goldenLight * 0.02 * (0.5 + climB * 0.5);
  }

  // ─── VOLUMETRIC GOD RAYS — sunlight shafts through canopy ──────
  vec3 rayLightDir = normalize(vec3(0.3, 0.9, 0.2));
  float rays = 0.0;
  for (int g = 0; g < 12; g++) {
    float gt = 0.5 + float(g) * 1.2;
    if (gt > td && hit) break;
    vec3 gp = ro + rd * gt;
    // Canopy occlusion pattern
    float canopyOcc = snoise(vec3(gp.x * 0.4, gp.z * 0.4, ft * 0.01));
    float shaft = smoothstep(0.0, 0.6, canopyOcc);
    // Mist density varies — thicker near ground, thinner higher
    float mistDensity = smoothstep(1.0, -2.0, gp.y) * (0.03 + bass * 0.08 + stemBass * 0.06);
    rays += shaft * mistDensity * 0.025;
  }
  col += goldenLight * rays * (0.3 + slowE * 0.7 + climB * 0.8 + tender * 0.3);

  // ─── FIREFLIES — vocal-reactive luminescent particles ──────────
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float fSeed = fract(sin(fi * 127.1 + 311.7) * 43758.5453);
    vec3 flyPos = vec3(
      sin(ft * 0.3 * (1.0 + fSeed) + fi * 2.1) * 2.0,
      -0.5 + sin(ft * 0.2 + fi * 1.7) * 0.8,
      ro.z + 2.0 + sin(ft * 0.15 + fi * 3.1) * 4.0
    );
    vec3 toFly = flyPos - ro;
    float flyDist = length(toFly);
    float flyDot = dot(normalize(toFly), rd);
    // Pulse with vocal presence
    float pulse = sin(ft * (2.0 + fSeed * 3.0) + fi * PI) * 0.5 + 0.5;
    pulse *= (0.2 + vocalP * 0.8 + drumOn * 1.5);
    float flyGlow = smoothstep(0.995, 1.0, flyDot) * pulse / (1.0 + flyDist * 0.5);
    col += vec3(0.5, 0.9, 0.3) * flyGlow * 0.3;
  }

  // ─── FINAL ─────────────────────────────────────────────────────
  col += forestGreen * 0.008;
  col *= 1.0 + beatSnap * 0.12;
  float vig = 1.0 - dot(p * 0.28, p * 0.28);
  col = mix(vec3(0.01, 0.012, 0.008), col, smoothstep(0.0, 1.0, vig));
  col = max(col, vec3(0.015, 0.02, 0.01));
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${afDepth}
}
`;
