/**
 * Desert Cantina — raymarched adobe arch corridor with hanging lanterns,
 * terracotta walls, cactus silhouettes, warm dusty light.
 * A festive, warm, inviting space for "Mexicali Blues."
 *
 * Full 3D SDF scene: repeating corridor of rounded adobe arches,
 * terracotta/stucco wall texture, hanging lanterns with warm point lights,
 * tiled floor, cactus silhouettes through archway openings,
 * papel picado banners, night sky with crescent moon and stars.
 *
 * Audio reactivity (18 uniforms):
 *   uBass              → lantern sway amplitude, wall vibration
 *   uEnergy            → lantern brightness, dust density, overall warmth
 *   uDrumOnset         → lantern swing impulse, floor tile highlight
 *   uVocalPresence     → warm ambient fill light
 *   uHarmonicTension   → shadow depth (warm → dramatic)
 *   uMelodicPitch      → lantern height variation
 *   uSectionType       → jam=lanterns go wild, space=moonlit stillness, chorus=full fiesta
 *   uClimaxPhase       → lanterns burst into confetti brilliance
 *   uBeatSnap          → brightness pulse
 *   uSlowEnergy        → camera drift speed
 *   uOnsetSnap         → lantern swing impulse
 *   uChromaHue         → lantern warm color variation
 *   uPalettePrimary    → terracotta wall tint
 *   uPaletteSecondary  → lantern glow color blend
 *   uPaletteSaturation → overall saturation control
 *   uSemanticRhythmic  → floor tile pulse intensity
 *   uTimbralBrightness → dust mote sparkle
 *   uSpaceScore        → moonlight intensity
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const desertCantinaVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.05,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  grainStrength: "light",
});

const dcNormalGLSL = buildRaymarchNormal("dcMap($P, dcTime, energy, bass, drumOn, melodicP, sJam, sSpace, climB).x", { eps: 0.002, name: "dcNormal" });
const dcAOGLSL = buildRaymarchAO("dcMap($P, dcTime, energy, bass, drumOn, melodicP, sJam, sSpace, climB).x", { steps: 3, stepBase: 0.0, stepScale: 0.15, weightDecay: 0.65, finalMult: 3.0, name: "dcAO" });
const dcDepthAlpha = buildDepthAlphaOutput("totalDist", "DC_MAX_DIST");

export const desertCantinaFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define DC_TAU 6.28318530
#define DC_PI  3.14159265
#define DC_MAX_DIST 35.0
#define DC_SURF_DIST 0.002

// ─── Rotation ───
mat2 dcRot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// ─── SDF Primitives (dc-prefixed) ───
float dcSdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float dcSdSphere(vec3 p, float r) { return length(p) - r; }

float dcSdCylinder(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float dcSdTorus(vec3 p, vec2 radii) {
  vec2 q = vec2(length(p.xz) - radii.x, p.y);
  return length(q) - radii.y;
}

float dcSdPlane(vec3 p, float h) { return p.y - h; }

float dcSdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ab = b - a;
  float param = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * param) - r;
}

float dcSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Adobe Arch: torus top + box sides ───
float dcArch(vec3 p, float archW, float archH, float thickness, float roundness) {
  // Side pillars: two box columns
  vec3 pillarL = p - vec3(-archW, 0.0, 0.0);
  float dPillarL = dcSdBox(pillarL, vec3(thickness, archH, thickness));
  vec3 pillarR = p - vec3(archW, 0.0, 0.0);
  float dPillarR = dcSdBox(pillarR, vec3(thickness, archH, thickness));
  // Arch top: half torus (upper half only)
  vec3 torusP = p - vec3(0.0, archH, 0.0);
  // Rotate torus so it spans XZ plane arching in X
  float dTorus = dcSdTorus(torusP.xzy, vec2(archW, roundness));
  // Clip bottom half of torus
  dTorus = max(dTorus, -(torusP.y + roundness * 0.3));
  // Thicken torus: extrude it along Z
  float dTorusThick = max(dTorus, abs(torusP.z) - thickness);
  return min(dPillarL, min(dPillarR, dTorusThick));
}

// ─── Lantern: sphere body + chain + glow ───
float dcLantern(vec3 p, float swayAngle, float melodicH) {
  // Sway the lantern: rotate around ceiling attachment point
  vec3 sp = p;
  sp.x = p.x * cos(swayAngle) - p.y * sin(swayAngle);
  sp.y = p.x * sin(swayAngle) + p.y * cos(swayAngle);
  // Lantern body: rounded box (paper lantern shape)
  float bodyH = 0.12 + melodicH * 0.04;
  float body = dcSdBox(sp, vec3(0.08, bodyH, 0.08)) - 0.03;
  // Top cap (small sphere at top)
  float cap = dcSdSphere(sp - vec3(0.0, bodyH + 0.02, 0.0), 0.035);
  // Bottom finial
  float finial = dcSdSphere(sp - vec3(0.0, -bodyH - 0.01, 0.0), 0.025);
  return min(body, min(cap, finial));
}

// ─── Lantern chain: thin capsule from ceiling ───
float dcLanternChain(vec3 p, float ceilingY, float lanternY, float swayAngle) {
  vec3 top = vec3(0.0, ceilingY, 0.0);
  vec3 bottom = vec3(sin(swayAngle) * (ceilingY - lanternY), lanternY, 0.0);
  return dcSdCapsule(p, top, bottom, 0.008);
}

// ─── Cactus: cylinder body + sphere arms ───
float dcCactus(vec3 p, float seed) {
  float h1 = fract(sin(seed * 127.1) * 43758.5453);
  float h2 = fract(sin(seed * 311.7) * 43758.5453);
  float bodyH = 0.6 + h1 * 0.4;
  // Main trunk
  float trunk = dcSdCylinder(p, 0.08, bodyH);
  // Top dome
  float topDome = dcSdSphere(p - vec3(0.0, bodyH, 0.0), 0.09);
  float d = dcSmin(trunk, topDome, 0.04);
  // Left arm
  if (h1 > 0.3) {
    float armH = 0.15 + h2 * 0.2;
    vec3 armBase = vec3(-0.08, bodyH * 0.4, 0.0);
    vec3 armP = p - armBase;
    // Horizontal part
    float armHoriz = dcSdCapsule(armP, vec3(0.0), vec3(-0.18, 0.04, 0.0), 0.05);
    // Vertical part
    vec3 armUp = armP - vec3(-0.18, 0.04, 0.0);
    float armVert = dcSdCylinder(armUp, 0.05, armH);
    float armTop = dcSdSphere(armUp - vec3(0.0, armH, 0.0), 0.06);
    d = dcSmin(d, dcSmin(armHoriz, dcSmin(armVert, armTop, 0.03), 0.03), 0.04);
  }
  // Right arm
  if (h2 > 0.4) {
    float armH = 0.12 + h1 * 0.15;
    vec3 armBase = vec3(0.08, bodyH * 0.6, 0.0);
    vec3 armP = p - armBase;
    float armHoriz = dcSdCapsule(armP, vec3(0.0), vec3(0.16, 0.03, 0.0), 0.045);
    vec3 armUp = armP - vec3(0.16, 0.03, 0.0);
    float armVert = dcSdCylinder(armUp, 0.045, armH);
    float armTop = dcSdSphere(armUp - vec3(0.0, armH, 0.0), 0.055);
    d = dcSmin(d, dcSmin(armHoriz, dcSmin(armVert, armTop, 0.03), 0.03), 0.04);
  }
  return d;
}

// ─── Papel picado banner: thin box with scalloped bottom edge ───
float dcPapelPicado(vec3 p, float bannerW, float bannerH) {
  // Main banner rectangle
  float banner = dcSdBox(p, vec3(bannerW, bannerH, 0.005));
  // Scalloped bottom: carve out semicircles along bottom edge
  float scallops = 1e10;
  float scN = 8.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float sx = (fi / (scN - 1.0) - 0.5) * bannerW * 2.0;
    vec3 sp = p - vec3(sx, -bannerH, 0.0);
    scallops = min(scallops, dcSdSphere(sp, bannerH * 0.35));
  }
  // Cut scallops from bottom
  float scalloped = max(banner, -scallops);
  // Cut diamond / flower patterns (holes in the paper)
  float holes = 1e10;
  for (int ix = -2; ix <= 2; ix++) {
    for (int iy = 0; iy <= 1; iy++) {
      float fx = float(ix) * bannerW * 0.4;
      float fy = float(iy) * bannerH * 0.5;
      vec3 hp = p - vec3(fx, fy, 0.0);
      // Diamond hole
      float diamond = (abs(hp.x) + abs(hp.y)) * 0.7071 - bannerH * 0.15;
      holes = min(holes, max(diamond, abs(hp.z) - 0.01));
    }
  }
  return max(scalloped, -holes);
}

// ─── Floor tile pattern ───
float dcFloorTile(vec2 p, float tileSize) {
  vec2 tileId = floor(p / tileSize);
  vec2 tileFrac = fract(p / tileSize);
  // Grout lines
  float grout = min(
    smoothstep(0.02, 0.04, tileFrac.x) * smoothstep(0.02, 0.04, 1.0 - tileFrac.x),
    smoothstep(0.02, 0.04, tileFrac.y) * smoothstep(0.02, 0.04, 1.0 - tileFrac.y)
  );
  // Checker pattern
  float checker = mod(tileId.x + tileId.y, 2.0);
  return mix(0.6, 1.0, checker) * grout;
}

// ─── Crescent moon SDF ───
float dcMoon(vec2 p, float outerR, float innerR, float offset) {
  float outer = length(p) - outerR;
  float inner = length(p - vec2(offset, 0.0)) - innerR;
  return max(outer, -inner);
}

// ═══════════════════════════════════════════════════════════
// SCENE MAP — returns vec2(distance, materialID)
// Materials: 0=floor, 1=wall/ceiling, 2=arch, 3=lantern, 4=chain,
//            5=cactus, 6=banner, 7=sky (miss)
// ═══════════════════════════════════════════════════════════
vec2 dcMap(vec3 p, float dcTime, float energy, float bass, float drumOn,
           float melodicP, float sJam, float sSpace, float climB) {
  // Corridor repetition along Z
  float cellSize = 5.0;
  float cellZ = floor(p.z / cellSize);
  float cellHash = fract(sin(cellZ * 127.1 + 311.7) * 43758.5453);
  float cellHash2 = fract(sin(cellZ * 269.5 + 183.3) * 43758.5453);
  vec3 rp = p;
  rp.z = mod(p.z + cellSize * 0.5, cellSize) - cellSize * 0.5;

  // Floor — terracotta tile plane
  float floorY = -1.2;
  float floorD = dcSdPlane(p, floorY);
  vec2 res = vec2(floorD, 0.0);

  // Ceiling
  float ceilY = 2.8;
  float ceilD = -(p.y - ceilY);
  if (ceilD < res.x) res = vec2(ceilD, 1.0);

  // Walls — adobe corridor with slight waviness
  float corridorW = 2.5 + snoise(vec3(0.0, p.y * 0.3, p.z * 0.15)) * 0.08;
  float wallL = -(p.x + corridorW);
  float wallR = p.x - corridorW;
  float wallD = min(wallL, wallR);
  // Wall vibration on bass
  wallD -= bass * 0.02 * sin(p.y * 8.0 + dcTime * 4.0);
  if (wallD < res.x) res = vec2(wallD, 1.0);

  // Adobe arches — repeating along corridor
  {
    float archW = 1.8;
    float archH = 2.0;
    float archThick = 0.25;
    float archRound = 0.35;
    float archD = dcArch(rp, archW, archH, archThick, archRound);
    if (archD < res.x) res = vec2(archD, 2.0);
  }

  // Hanging lanterns — two per cell, swaying
  {
    float swayFreq = 2.0 + sJam * 3.0;
    float swayAmp = 0.08 + bass * 0.12 + drumOn * 0.15;
    swayAmp *= mix(1.0, 2.5, sJam) * mix(1.0, 0.2, sSpace);

    for (int li = 0; li < 2; li++) {
      float lf = float(li);
      float lHash = fract(sin((cellZ + lf * 13.0) * 73.9) * 9871.3);
      float lx = (lHash - 0.5) * 3.0;
      float lanternBaseY = 1.6 + melodicP * 0.3 + lHash * 0.3;
      float swayPhase = dcTime * swayFreq + lHash * DC_TAU + cellZ * 2.7;
      float sway = sin(swayPhase) * swayAmp;

      vec3 lanternCenter = vec3(lx, lanternBaseY, rp.z + (lHash * 2.0 - 1.0) * 1.2);
      vec3 lp = p - vec3(lanternCenter.x, lanternCenter.y, 0.0);
      lp.z = rp.z - (lHash * 2.0 - 1.0) * 1.2;

      float lanternD = dcLantern(lp, sway, melodicP);
      if (lanternD < res.x) res = vec2(lanternD, 3.0);

      // Chain from ceiling to lantern
      vec3 chainP = lp;
      float chainD = dcLanternChain(chainP, ceilY - lanternCenter.y, 0.12 + melodicP * 0.04 + 0.02, sway);
      if (chainD < res.x) res = vec2(chainD, 4.0);
    }
  }

  // Cactus silhouettes — visible through archway openings (far back, outside corridor)
  {
    float cactusSpacing = 3.5;
    float cactusZ = mod(p.z + cactusSpacing * 0.5, cactusSpacing) - cactusSpacing * 0.5;
    float cactusCellZ = floor(p.z / cactusSpacing);
    float cactusHash = fract(sin(cactusCellZ * 431.7) * 9173.5);

    // Left side cactus (behind left wall)
    if (p.x < -corridorW + 0.5) {
      vec3 cactusP = vec3(p.x + corridorW + 1.5 + cactusHash * 0.8, p.y - floorY, cactusZ);
      float cactusD = dcCactus(cactusP, cactusCellZ);
      if (cactusD < res.x) res = vec2(cactusD, 5.0);
    }
    // Right side cactus
    if (p.x > corridorW - 0.5) {
      vec3 cactusP = vec3(p.x - corridorW - 1.5 - cactusHash * 0.6, p.y - floorY, cactusZ + 1.5);
      float cactusD = dcCactus(cactusP, cactusCellZ + 7.0);
      if (cactusD < res.x) res = vec2(cactusD, 5.0);
    }
  }

  // Papel picado banners — strung between archways
  {
    float bannerW = 0.35;
    float bannerH = 0.2;
    // Three banners per cell at different heights
    for (int bi = 0; bi < 3; bi++) {
      float bf = float(bi);
      float bx = (bf - 1.0) * 1.2;
      float by = 2.2 + bf * 0.15 - energy * 0.05;
      float bWave = sin(dcTime * 1.5 + bf * 2.0 + cellZ * 3.0) * 0.03 * (1.0 + bass * 0.5);
      vec3 bannerP = rp - vec3(bx, by + bWave, 0.0);
      // Slight rotation for wind effect
      bannerP.xz = dcRot2(sin(dcTime * 0.8 + bf * 1.5) * 0.1) * bannerP.xz;
      float bannerD = dcPapelPicado(bannerP, bannerW, bannerH);
      if (bannerD < res.x) res = vec2(bannerD, 6.0);
    }
  }

  return res;
}

// Normal & AO — generated by shared raymarching utilities
${dcNormalGLSL}
${dcAOGLSL}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
void main() {
  vec2 uvCoord = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uvCoord - 0.5) * asp;

  // ─── Clamp audio inputs ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceS = clamp(uSpaceScore, 0.0, 1.0);
  float rhythmic = clamp(uSemanticRhythmic, 0.0, 1.0);

  // ─── Section type decoding ───
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));

  // ─── Climax ───
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Dynamic time ───
  float dcTime = uDynamicTime * (0.06 + slowE * 0.05) * (1.0 + sJam * 0.5 - sSpace * 0.4);

  // ─── Palette ───
  float palH1 = uPalettePrimary;
  float palH2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(palH1, 0.8, 0.9);
  vec3 palCol2 = paletteHueColor(palH2, 0.8, 0.9);

  // Terracotta / warm colors
  vec3 terracotta = vec3(0.65, 0.30, 0.15);
  vec3 adobe = vec3(0.55, 0.42, 0.30);
  vec3 warmWhite = vec3(1.0, 0.90, 0.70);
  vec3 nightSky = vec3(0.05, 0.06, 0.15);
  vec3 lanternGold = vec3(1.0, 0.75, 0.35);

  // Blend with palette
  terracotta = mix(terracotta, palCol1 * 0.5, 0.15);
  lanternGold = mix(lanternGold, palCol2, 0.2);

  // ─── Camera: gentle walk through corridor ───
  float fwd = dcTime * 3.5;
  float swayX = sin(dcTime * 0.2) * 0.25 * (1.0 - sSpace * 0.6);
  float swayY = cos(dcTime * 0.15) * 0.08;
  vec3 ro = vec3(swayX, -0.1 + swayY + vocalP * 0.15, fwd + drumOn * 0.3);
  vec3 lookAt = ro + vec3(sin(dcTime * 0.1) * 0.1, 0.1 + cos(dcTime * 0.07) * 0.05, 3.5);
  vec3 fw = normalize(lookAt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 camUp = cross(fw, ri);
  float fov = 0.8 + energy * 0.1 + climB * 0.15;
  vec3 rd = normalize(screenP.x * ri + screenP.y * camUp + fov * fw);

  // ─── Primary raymarch ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  vec2 hitMat = vec2(DC_MAX_DIST, -1.0);
  bool didHit = false;
  int maxSteps = int(mix(56.0, 84.0, energy));

  for (int i = 0; i < 84; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * totalDist;
    vec2 dm = dcMap(ps, dcTime, energy, bass, drumOn, melodicP, sJam, sSpace, climB);
    if (dm.x < DC_SURF_DIST) {
      hitPos = ps;
      hitMat = dm;
      didHit = true;
      break;
    }
    if (totalDist > DC_MAX_DIST) break;
    totalDist += dm.x * 0.7;
  }

  vec3 col = vec3(0.0);

  if (didHit) {
    // ─── Normal via shared raymarching utilities ───
    vec3 norm = dcNormal(hitPos);

    // ─── Noise-based bump on walls/arches for stucco texture ───
    float matId = hitMat.y;
    if (matId < 2.5 && matId >= 0.5) {
      // Wall and arch materials: terracotta stucco bump
      float bumpScale = 6.0;
      float bumpStr = 0.015;
      vec3 bumpP = hitPos * bumpScale;
      float n0 = snoise(bumpP);
      float nx = snoise(bumpP + vec3(0.1, 0.0, 0.0));
      float ny = snoise(bumpP + vec3(0.0, 0.1, 0.0));
      float nz = snoise(bumpP + vec3(0.0, 0.0, 0.1));
      vec3 bumpGrad = vec3(nx - n0, ny - n0, nz - n0) / 0.1;
      norm = normalize(norm + bumpGrad * bumpStr);
    }

    // ─── Ambient Occlusion via shared raymarching utilities ───
    float ambOcc = dcAO(hitPos, norm);

    // ─── Lighting ───
    // Key light: warm overhead
    vec3 keyLightDir = normalize(vec3(0.3, 0.8, 0.4));
    float keyDiff = max(dot(norm, keyLightDir), 0.0);
    float keySpc = pow(max(dot(reflect(-keyLightDir, norm), -rd), 0.0), 16.0 + energy * 20.0);

    // Fresnel
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

    // Depth fog
    float depth01 = clamp(totalDist / DC_MAX_DIST, 0.0, 1.0);
    float fogFactor = 1.0 - exp(-totalDist * 0.08);

    // ─── Lantern point lights: warm radiance ───
    // Reconstruct nearby lantern positions for point lighting
    float cellSize = 5.0;
    float litCellZ = floor(hitPos.z / cellSize);
    vec3 lanternLight = vec3(0.0);
    for (int ci = -1; ci <= 1; ci++) {
      float cz = litCellZ + float(ci);
      for (int li = 0; li < 2; li++) {
        float lf = float(li);
        float lHash = fract(sin((cz + lf * 13.0) * 73.9) * 9871.3);
        float lx = (lHash - 0.5) * 3.0;
        float ly = 1.6 + melodicP * 0.3 + lHash * 0.3;
        float lz = cz * cellSize + (lHash * 2.0 - 1.0) * 1.2;

        float swayFreq = 2.0 + sJam * 3.0;
        float swayAmp = 0.08 + bass * 0.12 + drumOn * 0.15;
        swayAmp *= mix(1.0, 2.5, sJam) * mix(1.0, 0.2, sSpace);
        float sway = sin(dcTime * swayFreq + lHash * DC_TAU + cz * 2.7) * swayAmp;

        vec3 lanternPos = vec3(lx + sway * (ly - (-1.2)), ly, lz);
        vec3 toLight = lanternPos - hitPos;
        float lightDist = length(toLight);
        vec3 lightDir = toLight / lightDist;

        // Attenuation: warm inverse-square
        float atten = 1.0 / (1.0 + lightDist * lightDist * 1.5);

        // Lantern brightness: energy + section modulation
        float lanternBright = 0.6 + energy * 0.8 + uBeatSnap * 0.15;
        lanternBright *= mix(1.0, 1.8, sChorus) * mix(1.0, 2.5, sJam) * mix(1.0, 0.15, sSpace);
        lanternBright += climB * 0.6;

        float ldiff = max(dot(norm, lightDir), 0.0);
        float lspc = pow(max(dot(reflect(-lightDir, norm), -rd), 0.0), 12.0);

        // Lantern color with variation per lantern
        vec3 lColor = lanternGold;
        float colorVar = fract(sin(cz * 43.7 + lf * 17.3) * 9871.3);
        if (colorVar > 0.6) {
          lColor = mix(lanternGold, vec3(1.0, 0.55, 0.25), 0.4); // deeper amber
        } else if (colorVar > 0.3) {
          lColor = mix(lanternGold, vec3(1.0, 0.85, 0.55), 0.3); // warm white
        }
        // Chroma hue tint
        lColor = mix(lColor, hsv2rgb(vec3(uChromaHue, 0.4, 1.0)), 0.08);

        lanternLight += lColor * lanternBright * atten * (ldiff * 0.7 + lspc * 0.3);
      }
    }

    // ─── Material shading ───
    // Shadow depth driven by harmonic tension
    float shadowDepth = mix(0.12, 0.03, tension);

    if (matId < 0.5) {
      // Floor: terracotta tile
      float tilePat = dcFloorTile(hitPos.xz, 0.5);
      vec3 tileColor = mix(terracotta * 0.6, adobe * 0.5, tilePat);
      // Rhythmic tile highlight on drum onset
      float tileHighlight = drumOn * 0.2 + rhythmic * 0.1;
      tileColor += warmWhite * tileHighlight * tilePat * smoothstep(0.7, 1.0, tilePat);
      col = tileColor * (shadowDepth + keyDiff * 0.2) * ambOcc;
      col += lanternLight * tileColor * 0.5;
      // Floor reflection of lantern light
      col += lanternLight * 0.08 * fresnel;
    } else if (matId < 1.5) {
      // Walls and ceiling: adobe/stucco
      float stuccoNoise = snoise(vec3(hitPos.xz * 3.0, hitPos.y * 2.0)) * 0.15;
      vec3 wallColor = mix(adobe, terracotta, 0.3 + stuccoNoise);
      // Vertical color gradient: darker at bottom
      wallColor *= 0.7 + 0.3 * smoothstep(-1.2, 2.0, hitPos.y);
      col = wallColor * (shadowDepth + keyDiff * 0.25) * ambOcc;
      col += lanternLight * wallColor * 0.4;
      // Vocal warmth: ambient fill
      col += warmWhite * vocalP * 0.03 * ambOcc;
    } else if (matId < 2.5) {
      // Arches: slightly lighter adobe
      vec3 archColor = mix(adobe * 1.1, terracotta * 0.8, 0.3);
      float archDetail = ridged4(hitPos * 2.0) * 0.1;
      archColor += vec3(archDetail) * 0.3;
      col = archColor * (shadowDepth + keyDiff * 0.3) * ambOcc;
      col += lanternLight * archColor * 0.45;
    } else if (matId < 3.5) {
      // Lanterns: self-illuminated warm glow
      vec3 lGlow = lanternGold * (1.5 + energy * 1.5 + uBeatSnap * 0.4);
      lGlow *= mix(1.0, 2.0, sChorus) * mix(1.0, 3.0, sJam) * mix(1.0, 0.3, sSpace);
      lGlow += climB * warmWhite * 0.8;
      // Paper lantern translucency
      float translucency = 0.3 + 0.3 * (1.0 - abs(dot(norm, -rd)));
      col = lGlow * translucency;
    } else if (matId < 4.5) {
      // Chains: dark iron
      col = vec3(0.08, 0.06, 0.05) * (0.3 + keyDiff * 0.4) * ambOcc;
      col += lanternLight * 0.1;
    } else if (matId < 5.5) {
      // Cactus: dark green silhouette against night sky
      vec3 cactusCol = vec3(0.08, 0.15, 0.06);
      col = cactusCol * (0.05 + keyDiff * 0.08) * ambOcc;
      // Moonlight rim
      float moonRim = pow(max(dot(norm, normalize(vec3(0.5, 0.3, -0.5))), 0.0), 4.0);
      col += vec3(0.15, 0.18, 0.25) * moonRim * (0.3 + spaceS * 0.5);
    } else if (matId < 6.5) {
      // Papel picado banners: vibrant colored paper
      float bannerCellZ = floor(hitPos.z / 5.0);
      float bannerHash = fract(sin(bannerCellZ * 97.3) * 4317.5);
      // Cycle through festive colors
      vec3 bannerColor;
      float colorSlot = mod(bannerCellZ + floor(hitPos.x * 2.0), 5.0);
      if (colorSlot < 1.0) bannerColor = vec3(0.95, 0.2, 0.15);       // red
      else if (colorSlot < 2.0) bannerColor = vec3(0.2, 0.85, 0.25);  // green
      else if (colorSlot < 3.0) bannerColor = vec3(0.95, 0.75, 0.1);  // gold
      else if (colorSlot < 4.0) bannerColor = vec3(0.2, 0.4, 0.9);    // blue
      else bannerColor = vec3(0.9, 0.3, 0.7);                          // magenta
      // Backlit by lanterns
      float backlit = 0.3 + energy * 0.4;
      col = bannerColor * (backlit + keyDiff * 0.2) * ambOcc;
      col += lanternLight * bannerColor * 0.3;
      // Climax: confetti brightness burst
      col *= 1.0 + climB * 1.5;
    }

    // ─── Fog: warm dusty atmosphere ───
    vec3 fogColor = mix(vec3(0.12, 0.08, 0.04), lanternGold * 0.15, energy);
    fogColor += warmWhite * vocalP * 0.03;
    col = mix(col, fogColor, fogFactor * 0.7);

  } else {
    // ─── Sky: night sky through gaps ───
    // Gradient: deep blue at top, dark purple at horizon
    float skyGrad = rd.y * 0.5 + 0.5;
    col = mix(vec3(0.04, 0.03, 0.08), nightSky, skyGrad);

    // Stars
    vec3 starP = floor(rd * 80.0);
    float starHash = fract(sin(dot(starP, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float starBright = step(0.92, starHash) * smoothstep(0.06, 0.01, length(fract(rd * 80.0) - 0.5));
    col += warmWhite * starBright * (0.4 + spaceS * 0.4);

    // Crescent moon
    vec2 moonUV = rd.xy * 3.0 - vec2(1.2, 1.5);
    float moonD = dcMoon(moonUV, 0.15, 0.14, 0.08);
    float moonGlow = smoothstep(0.02, 0.0, moonD);
    float moonHalo = smoothstep(0.3, 0.0, moonD) * 0.15;
    col += vec3(0.95, 0.92, 0.80) * moonGlow * (0.5 + sSpace * 0.4);
    col += vec3(0.3, 0.3, 0.5) * moonHalo;
  }

  // ─── Volumetric dust: warm particles in lantern light ───
  {
    float dustAcc = 0.0;
    int dustSteps = 8;
    for (int di = 0; di < 8; di++) {
      float dt = 0.5 + float(di) * 1.2;
      if (dt > totalDist && didHit) break;
      vec3 dustP = ro + rd * dt;
      // Dust particle field
      float dustNoise = snoise(vec3(dustP.xz * 2.0, dustP.y * 1.5 + dcTime * 0.15));
      dustNoise = max(0.0, dustNoise);
      // Dust is denser near lantern light
      float cellZ2 = floor(dustP.z / 5.0);
      float dHash = fract(sin(cellZ2 * 73.9) * 9871.3);
      float lx = (dHash - 0.5) * 3.0;
      float ly = 1.6 + melodicP * 0.3;
      float distToLantern = length(dustP.xy - vec2(lx, ly));
      float lanternProx = smoothstep(2.0, 0.3, distToLantern);
      dustAcc += dustNoise * lanternProx * 0.02;
    }
    float dustIntensity = energy * 0.6 + timbralBright * 0.3;
    dustIntensity *= mix(1.0, 0.2, sSpace);
    col += lanternGold * dustAcc * dustIntensity;
  }

  // ─── God rays: warm beams from lanterns through dust ───
  {
    float rayAcc = 0.0;
    for (int gi = 0; gi < 8; gi++) {
      float gt = 0.3 + float(gi) * 0.8;
      if (gt > totalDist && didHit) break;
      vec3 gp = ro + rd * gt;
      float cellZr = floor(gp.z / 5.0);
      float rHash = fract(sin(cellZr * 73.9) * 9871.3);
      vec3 lanternP = vec3((rHash - 0.5) * 3.0, 1.6 + melodicP * 0.3, cellZr * 5.0);
      float distL = length(gp - lanternP);
      float rayContrib = smoothstep(3.0, 0.5, distL);
      float fogDensity = fbm3(gp * 0.3 + dcTime * 0.02) * (0.08 + bass * 0.1);
      rayAcc += rayContrib * fogDensity * 0.015;
    }
    float rayBright = 0.4 + energy * 0.6 + vocalP * 0.3;
    rayBright *= mix(1.0, 0.1, sSpace);
    col += lanternGold * rayAcc * rayBright;
  }

  // ─── Beat snap brightness pulse ───
  col *= 1.0 + uBeatSnap * 0.12;

  // ─── Vignette ───
  float vg = 1.0 - dot(screenP * 0.3, screenP * 0.3);
  col = mix(vec3(0.02, 0.015, 0.01), col, smoothstep(0.0, 1.0, vg));

  // ─── Icon emergence ───
  {
    float nf = snoise(vec3(screenP * 2.0, uTime * 0.1));
    col += iconEmergence(screenP, uTime, energy, bass, terracotta, lanternGold, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, terracotta, lanternGold, nf, uSectionIndex);
  }

  // ─── Darkness texture ───
  col += darknessTexture(uvCoord, uTime, energy);

  // ─── Minimum brightness floor ───
  col = max(col, vec3(0.025, 0.018, 0.012));

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uvCoord, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${dcDepthAlpha}
}
`;
