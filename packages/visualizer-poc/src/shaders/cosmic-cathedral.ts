/**
 * Cosmic Cathedral — A+++ raymarched impossible space cathedral in a nebula.
 *
 * An architecturally impossible gothic cathedral floating in deep space with:
 *   - Ribbed gothic arches made of crystallized starlight
 *   - Stained glass windows revealing swirling galaxies
 *   - Gravity-defying flying buttresses and inverted spires
 *   - Nebula volumetrics visible through the open structure
 *   - Floating choir platforms connected by light bridges
 *   - Camera drifting through the infinite nave
 *
 * Audio reactivity (13+ uniforms):
 *   uSlowEnergy      -> nebula glow intensity, arch luminosity
 *   uEnergy          -> structural detail, overall brilliance
 *   uBass            -> architectural bass resonance, pillar vibration
 *   uDrumOnset       -> starburst through stained glass
 *   uVocalPresence   -> choir platform radiance
 *   uBeatSnap        -> light bridge pulse
 *   uStemBass        -> deep cosmic rumble
 *   uSectionType     -> jam: faster drift, space: hover in wonder
 *   uShaderHoldProgress -> cathedral reveals (entrance -> nave -> apse -> transcendence)
 *   uClimaxPhase     -> all windows ignite, full nebula eruption
 *   uPalettePrimary/Secondary -> cosmic palette
 *   uSemanticPsychedelic -> enhances impossible geometry warp
 *   uSemanticCosmic  -> nebula intensity boost
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const cosmicCathedralVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.08,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
});

const ccNormal = buildRaymarchNormal("ccMap($P, energy, bass, ft, holdP, psyche)", { eps: 0.002, name: "ccNormal" });
const ccAO = buildRaymarchAO("ccMap($P, energy, bass, ft, holdP, psyche)", { name: "ccAO" });
const ccDepth = buildDepthAlphaOutput("td", "16.0");

export const cosmicCathedralFrag = /* glsl */ `
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

float sdCappedCylinder(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ─── CATHEDRAL MAP ────────────────────────────────────────────────

float ccMap(vec3 p, float energy, float bass, float ft, float holdP, float psyche) {
  // Repeating nave sections
  float cellZ = floor(p.z / 3.5);
  vec3 rp = p;
  rp.z = mod(p.z + 1.75, 3.5) - 1.75;
  float ch = fract(sin(cellZ * 127.1 + 311.7) * 43758.5453);

  // Cathedral tunnel — pointed gothic arch cross-section
  float angle = atan(rp.y, rp.x);
  float archShape = 1.8 + 0.4 * pow(abs(sin(angle * 0.5)), 2.0); // pointed top
  // Impossible geometry warp — psychedelic twists the space
  float twist = psyche * 0.3 * sin(p.z * 0.2 + ft * 0.1);
  float ca = cos(twist), sa = sin(twist);
  vec2 twisted = mat2(ca, sa, -sa, ca) * rp.xy;

  // Wall displacement — ribbed gothic texture
  float ribs = sin(angle * 8.0 + ch * TAU) * 0.06 + sin(angle * 16.0 - ft * 0.05) * 0.025;
  ribs *= (1.0 + bass * 0.4);
  float d = -(length(twisted) - archShape - ribs);

  // Gothic ribbed vault ceiling arches
  float ribZ = abs(rp.z) - (1.75 - 0.08);
  float ribR = length(twisted) - (archShape - 0.3 - energy * 0.2);
  float vaultRib = max(ribZ, -ribR);
  d = min(d, vaultRib);

  // Pillars — clustered columns at each bay
  for (int i = 0; i < 6; i++) {
    float a = float(i) * TAU / 6.0 + ch * 0.3;
    vec2 pillarPos = vec2(cos(a), sin(a)) * (archShape * 0.85);
    float pillar = length(twisted - pillarPos) - (0.06 + energy * 0.08);
    d = min(d, pillar);
    // Attached colonettes (thinner clustered shafts)
    for (int j = 0; j < 2; j++) {
      float offset = (float(j) - 0.5) * 0.12;
      vec2 colPos = pillarPos + vec2(cos(a + offset), sin(a + offset)) * 0.1;
      float colonette = length(twisted - colPos) - 0.02;
      d = min(d, colonette);
    }
  }

  // Stained glass windows — recessed panels between ribs
  for (int i = 0; i < 4; i++) {
    float wa = float(i) * TAU / 4.0 + PI * 0.25;
    vec2 winPos = vec2(cos(wa), sin(wa)) * (archShape + 0.05);
    vec3 wp = vec3(twisted - winPos, rp.z);
    // Thin recessed panel
    float window = sdBox(wp, vec3(0.3 + holdP * 0.15, 0.5, 0.02));
    d = max(d, -window); // carve window recess
  }

  // Flying buttresses — arcing external supports (visible when structure opens)
  if (holdP > 0.3) {
    for (int i = 0; i < 3; i++) {
      float ba = float(i) * TAU / 3.0 + ft * 0.01;
      float bR = archShape + 0.8 + holdP * 0.5;
      vec3 buttP = vec3(rp.xy - vec2(cos(ba), sin(ba)) * bR, rp.z);
      // Arc shape — curved beam
      float arc = length(vec2(length(buttP.xy) - 0.6, buttP.z)) - 0.04;
      d = min(d, arc);
    }
  }

  // Floating octahedral jewels — same as fractal temple homage
  for (int i = 0; i < 3; i++) {
    float a = float(i) * TAU / 3.0 + ch * PI + ft * 0.03;
    float jr = archShape * 0.3;
    vec3 jp = rp - vec3(cos(a) * jr, sin(a) * jr, 0.0);
    float rot = ft * 0.08 + float(i) * 2.094;
    float cr2 = cos(rot), sr2 = sin(rot);
    jp.xy = mat2(cr2, sr2, -sr2, cr2) * jp.xy;
    jp.yz = mat2(cr2, sr2, -sr2, cr2) * jp.yz;
    // Octahedron
    vec3 ap = abs(jp);
    float octa = (ap.x + ap.y + ap.z - (0.06 + energy * 0.15)) * 0.57735027;
    d = min(d, octa);
  }

  return d;
}

${ccNormal}
${ccAO}

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
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));
  float ft = uDynamicTime * (0.025 + slowE * 0.07) * (1.0 + sJam * 0.5 - sSpace * 0.5);

  // ─── PALETTE — sacred cosmic: gold starlight, purple nebula, deep void ───
  // Starlight: warm gold/amber sacred light
  float ccSH1 = mix(uPalettePrimary, 0.12 + fract(uPalettePrimary) * 0.06, 0.45); // gold
  vec3 starlight = paletteHueColor(ccSH1, 0.55, 0.92);
  starlight = mix(starlight, vec3(1.0, 0.88, 0.60), 0.35); // gold-amber bias
  // Nebula: rich purple/violet
  float ccSH2 = mix(uPaletteSecondary, 0.78 + fract(uPaletteSecondary) * 0.1, 0.4);
  vec3 nebulaGlow = paletteHueColor(ccSH2, 0.8, 0.75);
  vec3 deepVoid = mix(vec3(0.02, 0.008, 0.06), starlight * 0.04, 0.25); // deep purple-black void
  vec3 windowCol = mix(vec3(0.45, 0.2, 0.85), nebulaGlow, 0.45 + cosmic * 0.3); // vivid violet windows

  // ─── CAMERA — drift through infinite nave ──────────────────────
  float fwd = ft * 3.0;
  float camSway = sin(ft * 0.06) * 0.25 * (1.0 - sSpace * 0.7);
  float camRise = cos(ft * 0.04) * 0.2 + holdP * 0.3;
  vec3 ro = vec3(camSway, camRise, fwd + drumOn * 0.2);
  vec3 target = ro + vec3(sin(ft * 0.035) * 0.15, cos(ft * 0.025) * 0.1, 3.5);

  vec3 fw = normalize(target - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up2 = cross(fw, ri);
  float fov = (0.8 + energy * 0.12 + climB * 0.15);
  vec3 rd = normalize(p.x * ri + p.y * up2 + fov * fw);

  // ─── RAYMARCH ───────────────────────────────────────────────────
  float td = 0.0;
  vec3 hp = ro;
  bool hit = false;
  int maxSteps = int(mix(48.0, 96.0, energy));

  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * td;
    float d = ccMap(ps, energy, bass, ft, holdP, psyche);
    // Climax warps space slightly
    d += climB * 0.3 * (0.5 + 0.5 * snoise(ps * 2.0 + ft * 2.0));
    if (d < 0.002) {
      hp = ps;
      hit = true;
      break;
    }
    if (td > 16.0) break;
    td += d * 0.65;
  }

  // ─── SHADING ────────────────────────────────────────────────────
  vec3 col = vec3(0.0);

  if (hit) {
    vec3 n = ccNormal(hp);
    float ao = ccAO(hp, n);

    // Ethereal multi-directional lighting
    vec3 lightDir1 = normalize(vec3(0.3, 0.8, 0.4));
    vec3 lightDir2 = normalize(vec3(-0.5, -0.3, 0.6));
    float diff1 = max(dot(n, lightDir1), 0.0);
    float diff2 = max(dot(n, lightDir2), 0.0) * 0.3;
    vec3 shLight = sharedDiffuse(n);
    float blendDiff = mix(diff1 + diff2, dot(shLight, vec3(0.333)), 0.25);

    // Specular — crystalline starlight surfaces
    float spec = pow(max(dot(reflect(-lightDir1, n), -rd), 0.0), 48.0 + energy * 64.0);
    vec3 shSpec = sharedSpecular(n, -rd, 48.0 + energy * 64.0);
    float blendSpec = mix(spec, dot(shSpec, vec3(0.333)), 0.3);

    // Fresnel — edges glow with cosmic energy
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);

    float depth = clamp(td / 12.0, 0.0, 1.0);

    // Material: starlight crystal with nebula tinting
    vec3 crystal = mix(starlight * 0.15, starlight * 0.04, depth);

    // Stained glass emission — windows glow from behind
    float windowAngle = atan(hp.y, hp.x);
    float windowMask = pow(abs(sin(windowAngle * 2.0)), 8.0);
    float windowGlow = windowMask * (0.3 + vocalP * 1.0 + drumOn * 2.0 + climB * 1.5);

    // Structural emission — ribs glow with energy
    float ribGlow = smoothstep(0.1, 0.0, abs(mod(hp.z + 1.75, 3.5) - 1.75)) * (0.2 + energy * 0.8);

    col = crystal * (0.03 + blendDiff * 0.25) * ao;
    col += starlight * blendSpec * 0.2;
    col += nebulaGlow * fresnel * 0.08 * (0.5 + cosmic * 0.5);
    col += windowCol * windowGlow * 0.12;
    col += starlight * ribGlow * 0.05;
    col *= 0.6 + energy * 0.7;
  } else {
    // Deep space nebula background
    float nebulaPattern = fbm3(rd * 3.0 + ft * 0.01) * 0.5 + 0.5;
    float nebulaPattern2 = fbm3(rd * 5.0 - ft * 0.015 + 10.0) * 0.5 + 0.5;
    vec3 nebula = nebulaGlow * nebulaPattern * 0.08 + starlight * nebulaPattern2 * 0.04;
    nebula *= (0.5 + cosmic * 0.8 + slowE * 0.5);
    col = nebula + deepVoid;
    // Stars
    vec3 starCell = floor(rd * 60.0);
    float starHash = fract(sin(dot(starCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float starBright = smoothstep(0.92, 0.99, starHash) * smoothstep(0.04, 0.01, length(fract(rd * 60.0) - 0.5));
    // Stars: warm gold-amber points, not cool white
    col += mix(vec3(0.95, 0.85, 0.60), vec3(0.85, 0.80, 1.0), fract(starHash * 7.0)) * starBright * 0.4;
  }

  // ─── VOLUMETRIC GOD RAYS — ethereal light through structure ────
  vec3 godLightPos = vec3(sin(ft * 0.07) * 0.5, 1.2, ro.z + 5.0);
  float rays = 0.0;
  for (int g = 0; g < 12; g++) {
    float gt = 0.3 + float(g) * 0.9;
    if (gt > td && hit) break;
    vec3 gp = ro + rd * gt;
    float occ = ccMap(gp + normalize(godLightPos - gp) * 0.4, energy, bass, ft, holdP, psyche);
    float fog = fbm3(gp * 0.25 + ft * 0.02) * (0.03 + bass * 0.12 + stemBass * 0.08);
    rays += smoothstep(-0.1, 0.3, occ) * 0.018 * (0.3 + fog);
  }
  col += mix(starlight, nebulaGlow, 0.4) * rays * (0.2 + vocalP * 0.7 + climB * 0.8);

  // ─── NEBULA VOLUMETRICS — visible through open structure ───────
  float nebulaVol = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float nt = 2.0 + fi * 1.5;
    if (nt > td && hit) break;
    vec3 np = ro + rd * nt;
    float nDensity = fbm3(np * 0.15 + ft * 0.008) * 0.5 + 0.5;
    nDensity *= smoothstep(0.3, 0.7, nDensity);
    nebulaVol += nDensity * 0.008 * (0.5 + cosmic * 1.0);
  }
  col += nebulaGlow * nebulaVol * (0.5 + slowE * 0.5);

  // ─── FINAL ─────────────────────────────────────────────────────
  col += starlight * 0.01;
  col *= 1.0 + beatSnap * 0.15;
  float vig = 1.0 - dot(p * 0.25, p * 0.25);
  col = mix(vec3(0.015, 0.005, 0.03), col, smoothstep(0.0, 1.0, vig)); // deep purple vignette
  col = max(col, vec3(0.02, 0.01, 0.04)); // purple-tinted black floor
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${ccDepth}
}
`;
