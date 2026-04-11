/**
 * Neon Casino — raymarched corridor of neon-lit casino geometry.
 * Rotating dice SDFs, card suit symbols, neon sign glow tubes,
 * reflective floor, volumetric haze. Vegas-meets-psychedelic.
 *
 * For "Deal" — uptempo gambling/card-playing song with driving rhythm.
 *
 * Audio reactivity:
 *   uBass            → neon pulse intensity, floor reflection strength
 *   uEnergy          → neon brightness, haze density, dice spin speed
 *   uDrumOnset       → dice bounce, neon flicker
 *   uVocalPresence   → warm ambient uplighting
 *   uHarmonicTension → neon color instability (steady → flickering)
 *   uBeatSnap        → strobe flash
 *   uSectionType     → jam=neon overload, space=dim moody, chorus=full Vegas
 *   uClimaxPhase     → everything maxes out, dice explode into fragments
 *   uSlowEnergy      → camera forward drift
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const neonCasinoVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.1,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
});

const ncNormalGLSL = buildRaymarchNormal("ncMap($P, ncTime, energy, bass, drumOn, tension, sJam, sSpace, climB).x", { eps: 0.002, name: "ncNormal" });
const ncDepthAlpha = buildDepthAlphaOutput("totalDist", "NC_MAX_DIST");

export const neonCasinoFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define NC_TAU 6.28318530
#define NC_PI  3.14159265
#define NC_MAX_DIST 30.0
#define NC_SURF_DIST 0.002

// ─── Rotation helpers ───
mat2 ncRot2(float a) { float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

// ─── SDF primitives ───
float ncSdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float ncSdRoundBox(vec3 p, vec3 b, float r) {
  return ncSdBox(p, b) - r;
}

float ncSdSphere(vec3 p, float r) { return length(p) - r; }

float ncSdCylinder(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float ncSdTorus(vec3 p, vec2 radii) {
  vec2 q = vec2(length(p.xz) - radii.x, p.y);
  return length(q) - radii.y;
}

float ncSdPlane(vec3 p, float h) { return p.y - h; }

// Smooth union
float ncSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

// ─── 2D SDF card suits for wall cutouts ───
float ncSdDiamond2D(vec2 p, float sz) {
  p = abs(p);
  return (p.x + p.y - sz) * 0.7071;
}

float ncSdHeart2D(vec2 p, float sz) {
  p /= sz;
  p.y -= 0.3;
  float a = atan(p.x, p.y) / NC_PI;
  float r = length(p);
  float h = abs(a);
  float d = (13.0*h - 22.0*h*h + 10.0*h*h*h) / (6.0 - 5.0*h);
  return (r - d) * sz;
}

float ncSdSpade2D(vec2 p, float sz) {
  // Heart flipped + stem
  float heart = ncSdHeart2D(vec2(p.x, -p.y + sz*0.2), sz * 0.85);
  float stem = max(abs(p.x) - sz*0.08, abs(p.y + sz*0.3) - sz*0.35);
  return min(heart, stem);
}

float ncSdClub2D(vec2 p, float sz) {
  // Three circles + stem
  float r = sz * 0.28;
  float c1 = length(p - vec2(0.0, sz*0.2)) - r;
  float c2 = length(p - vec2(-sz*0.22, -sz*0.05)) - r;
  float c3 = length(p - vec2(sz*0.22, -sz*0.05)) - r;
  float stem = max(abs(p.x) - sz*0.07, abs(p.y + sz*0.3) - sz*0.3);
  return min(min(c1, min(c2, c3)), stem);
}

// ─── Dice SDF: rounded box with pip (dot) indentations ───
float ncDicePip(vec3 p, vec3 center, float pipR) {
  return length(p - center) - pipR;
}

float ncDice(vec3 p, float sz, float roundness, float energy, float drumOn) {
  float body = ncSdRoundBox(p, vec3(sz), roundness);
  float pipR = sz * 0.18;
  float pipDepth = sz * 0.06;

  // Center pip (1-face: +Y)
  float pips = ncDicePip(p, vec3(0.0, sz + pipDepth, 0.0), pipR);
  // 2-face: -Y
  pips = min(pips, ncDicePip(p, vec3(-sz*0.35, -sz - pipDepth, -sz*0.35), pipR*0.8));
  pips = min(pips, ncDicePip(p, vec3(sz*0.35, -sz - pipDepth, sz*0.35), pipR*0.8));
  // 3-face: +X
  pips = min(pips, ncDicePip(p, vec3(sz + pipDepth, 0.0, 0.0), pipR*0.75));
  pips = min(pips, ncDicePip(p, vec3(sz + pipDepth, sz*0.35, sz*0.35), pipR*0.75));
  pips = min(pips, ncDicePip(p, vec3(sz + pipDepth, -sz*0.35, -sz*0.35), pipR*0.75));
  // 6-face: -X (6 pips in 2x3 grid)
  for (int iy = -1; iy <= 1; iy++) {
    for (int ix = -1; ix <= 0; ix++) {
      vec3 pp = vec3(-sz - pipDepth, float(iy)*sz*0.33, (float(ix)*2.0+1.0)*sz*0.25);
      pips = min(pips, ncDicePip(p, pp, pipR*0.65));
    }
  }
  // Subtract pips from body
  return max(body, -pips);
}

// ─── Neon tube SDF: torus or line segment with glow radius ───
float ncNeonTube(vec3 p, vec3 a, vec3 b, float radius) {
  vec3 ab = b - a;
  float param = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * param) - radius;
}

// ─── Archway SDF: rounded rectangular frame ───
float ncArchway(vec3 p, float w, float h, float depth, float thickness) {
  // Outer box
  float outer = ncSdBox(p, vec3(w, h, depth));
  // Inner cutout (slightly smaller)
  float inner = ncSdBox(p - vec3(0.0, -thickness*0.5, 0.0), vec3(w - thickness, h - thickness, depth + 0.1));
  return max(outer, -inner);
}

// ─── Ceiling panel SDF ───
float ncCeilingPanel(vec3 p, float spacing) {
  vec2 id = floor(p.xz / spacing);
  vec2 fp = fract(p.xz / spacing) - 0.5;
  float panel = max(abs(fp.x) - 0.4, abs(fp.y) - 0.4);
  return max(panel * spacing, p.y - 2.8);
}

// ─── Card suit on wall (extruded 2D SDF) ───
float ncCardSuit(vec3 p, float suitType, float sz) {
  // Project onto XY plane for 2D suit shape, extrude along Z
  vec2 p2d = p.xy;
  float d2d;
  if (suitType < 1.0) {
    d2d = ncSdDiamond2D(p2d, sz);
  } else if (suitType < 2.0) {
    d2d = ncSdHeart2D(p2d, sz);
  } else if (suitType < 3.0) {
    d2d = ncSdSpade2D(p2d, sz);
  } else {
    d2d = ncSdClub2D(p2d, sz);
  }
  float extrude = abs(p.z) - 0.03;
  return max(d2d, extrude);
}

// ─── Scene SDF ───
// Returns vec2: x = distance, y = material ID
// Materials: 0=floor, 1=wall, 2=archway, 3=neon tube, 4=dice, 5=card suit, 6=ceiling
vec2 ncMap(vec3 p, float ncTime, float energy, float bass, float drumOn,
           float tension, float sJam, float sSpace, float climB) {
  // Corridor repetition along Z
  float cellSize = 5.0;
  float cellZ = floor(p.z / cellSize);
  float cellHash = fract(sin(cellZ * 127.1 + 311.7) * 43758.5453);
  float cellHash2 = fract(sin(cellZ * 269.5 + 183.3) * 43758.5453);
  vec3 rp = p;
  rp.z = mod(p.z + cellSize * 0.5, cellSize) - cellSize * 0.5;

  // Floor — reflective plane
  float floorY = -1.5;
  float floorD = ncSdPlane(p, floorY);
  vec2 res = vec2(floorD, 0.0);

  // Ceiling
  float ceilD = -(p.y - 3.0);
  if (ceilD < res.x) res = vec2(ceilD, 6.0);

  // Walls — left and right.
  // SDF convention: positive in corridor air, negative in surrounding rock.
  // Previously these were sign-inverted (leftWall negated, rightWall reversed)
  // which made every camera ray instantly "hit" at distance ~0 and produced
  // a flat-color frame with no actual corridor visible.
  float corridorW = 3.0 + sin(p.z * 0.3 + ncTime * 0.1) * 0.15;
  float wallL = p.x + corridorW;       // positive when right of left wall
  float wallR = corridorW - p.x;       // positive when left of right wall
  float wallD = min(wallL, wallR);
  if (wallD < res.x) res = vec2(wallD, 1.0);

  // Archways: neon-framed doorways repeating along corridor
  {
    vec3 ap = rp;
    float archD = ncArchway(ap, 2.5, 2.8, 0.2, 0.25);
    if (archD < res.x) res = vec2(archD, 2.0);
  }

  // Neon tubes — horizontal and vertical framing each cell
  {
    float neonR = 0.035 + bass * 0.01;
    // Top horizontal tube
    float nt1 = ncNeonTube(rp, vec3(-2.4, 2.6, 0.0), vec3(2.4, 2.6, 0.0), neonR);
    // Left vertical tube
    float nt2 = ncNeonTube(rp, vec3(-2.4, -1.3, 0.0), vec3(-2.4, 2.6, 0.0), neonR);
    // Right vertical tube
    float nt3 = ncNeonTube(rp, vec3(2.4, -1.3, 0.0), vec3(2.4, 2.6, 0.0), neonR);
    // Bottom horizontal tube
    float nt4 = ncNeonTube(rp, vec3(-2.4, -1.3, 0.0), vec3(2.4, -1.3, 0.0), neonR);
    // Diagonal accent tubes (X pattern)
    float nt5 = ncNeonTube(rp, vec3(-1.5, 0.0, 0.0), vec3(0.0, 2.0, 0.0), neonR * 0.7);
    float nt6 = ncNeonTube(rp, vec3(1.5, 0.0, 0.0), vec3(0.0, 2.0, 0.0), neonR * 0.7);
    float neonD = min(nt1, min(nt2, min(nt3, min(nt4, min(nt5, nt6)))));
    if (neonD < res.x) res = vec2(neonD, 3.0);
  }

  // Dice — tumbling in the corridor
  {
    float diceSz = 0.22 + energy * 0.04;
    // Two dice per cell at different positions
    for (int di = 0; di < 2; di++) {
      float doff = float(di);
      float dHash = fract(sin((cellZ + doff * 7.0) * 43.7) * 9871.3);
      vec3 dicePos = vec3(
        (dHash - 0.5) * 3.0,
        floorY + diceSz * 1.4 + sin(ncTime * 2.0 + dHash * NC_TAU) * 0.3 * drumOn,
        rp.z + (dHash * 2.0 - 1.0) * 1.5
      );
      vec3 dp = p - vec3(dicePos.x, dicePos.y, 0.0);
      dp.z = rp.z - (dHash * 2.0 - 1.0) * 1.5;
      // Rotation: slow tumble + energy spin
      float spinSpeed = 0.4 + energy * 0.8 + drumOn * 1.5;
      float rotA = ncTime * spinSpeed * (0.5 + dHash);
      float rotB = ncTime * spinSpeed * 0.7 * (0.3 + dHash * 0.5);
      dp.xy = ncRot2(rotA) * dp.xy;
      dp.yz = ncRot2(rotB) * dp.yz;

      float diceD;
      // Climax: dice fragment into smaller cubes
      if (climB > 0.3) {
        float fragStr = smoothstep(0.3, 1.0, climB);
        float smallSz = diceSz * mix(1.0, 0.35, fragStr);
        vec3 fragP = dp;
        // Explode outward
        float explodeT = ncTime * 1.5 + dHash * 4.0;
        fragP += vec3(
          sin(explodeT + doff*2.0) * fragStr * 0.6,
          cos(explodeT * 1.3 + doff*3.0) * fragStr * 0.4,
          sin(explodeT * 0.7 + doff*5.0) * fragStr * 0.5
        );
        diceD = ncSdRoundBox(fragP, vec3(smallSz), smallSz * 0.15);
        // Additional fragments
        for (int fi = 1; fi < 4; fi++) {
          float ff = float(fi);
          vec3 fOff = vec3(
            sin(explodeT * (1.0 + ff*0.3)) * fragStr * (0.3 + ff*0.2),
            cos(explodeT * (0.8 + ff*0.4)) * fragStr * (0.2 + ff*0.15),
            sin(explodeT * (1.2 + ff*0.2)) * fragStr * (0.25 + ff*0.18)
          );
          diceD = min(diceD, ncSdRoundBox(dp + fOff, vec3(smallSz * 0.6), smallSz * 0.1));
        }
      } else {
        diceD = ncDice(dp, diceSz, diceSz * 0.12, energy, drumOn);
      }
      if (diceD < res.x) res = vec2(diceD, 4.0);
    }
  }

  // Card suits on walls — embedded in wall surface
  {
    float suitSpacing = 2.5;
    float suitZ = mod(p.z + suitSpacing * 0.5, suitSpacing) - suitSpacing * 0.5;
    float suitCellZ = floor(p.z / suitSpacing);
    float suitType = mod(suitCellZ, 4.0);
    float suitSz = 0.3 + energy * 0.05;
    // Left wall suit
    vec3 suitPL = vec3(p.x + corridorW - 0.02, p.y - 0.8, suitZ);
    float suitDL = ncCardSuit(suitPL, suitType, suitSz);
    // Right wall suit (different type)
    vec3 suitPR = vec3(-(p.x - corridorW + 0.02), p.y - 0.8, suitZ);
    float suitDR = ncCardSuit(suitPR, mod(suitType + 2.0, 4.0), suitSz);
    float suitD = min(suitDL, suitDR);
    if (suitD < res.x) res = vec2(suitD, 5.0);
  }

  return res;
}

// ─── Normal (shared raymarching utility) ───
${ncNormalGLSL}

// ─── Neon color palette: hot pink, electric blue, acid green ───
vec3 ncNeonColor(float cellZ, float ncTime, float tension, float bass,
                 float palH1, float palH2, float sJam) {
  float flickerBase = tension * 0.5;
  float flicker = 1.0 - flickerBase * (0.5 + 0.5 * sin(ncTime * 15.0 + cellZ * 7.3));
  flicker = max(flicker, 0.3);

  // Three neon hues rotating per cell
  float hueSelect = mod(cellZ, 3.0);
  vec3 neonCol;
  if (hueSelect < 1.0) {
    // Hot pink
    neonCol = vec3(1.0, 0.1, 0.5);
  } else if (hueSelect < 2.0) {
    // Electric blue
    neonCol = vec3(0.1, 0.4, 1.0);
  } else {
    // Acid green
    neonCol = vec3(0.2, 1.0, 0.3);
  }

  // Blend with palette colors
  vec3 palCol = paletteHueColor(palH1, 0.85, 0.95);
  neonCol = mix(neonCol, palCol, 0.25);

  // Pulse with bass
  neonCol *= (1.0 + bass * 0.8);
  // Flicker with tension
  neonCol *= flicker;
  // Jam: neon overload — boost saturation and brightness
  neonCol *= (1.0 + sJam * 0.6);

  return neonCol;
}

void main() {
  vec2 uvCoord = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uvCoord - 0.5) * asp;

  // Clamp audio inputs
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);

  // Section type decoding
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));

  // Climax
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // Dynamic time with section modulation
  float ncTime = uDynamicTime * (0.08 + slowE * 0.06) * (1.0 + sJam * 0.5 - sSpace * 0.4);

  // Palette
  float h1 = uPalettePrimary;
  float h2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(h1, 0.85, 0.95);
  vec3 palCol2 = paletteHueColor(h2, 0.85, 0.95);

  // ─── Camera ───
  float fwd = ncTime * 4.5;
  // Gentle sway
  float swayX = sin(ncTime * 0.25) * 0.35 * (1.0 - sSpace * 0.5);
  float swayY = cos(ncTime * 0.18) * 0.12;
  vec3 ro = vec3(swayX, 0.2 + swayY + vocalP * 0.3, fwd + drumOn * 0.5);
  vec3 lookAt = ro + vec3(sin(ncTime * 0.12) * 0.15, -0.05 + cos(ncTime * 0.09) * 0.05, 4.0);
  vec3 fw = normalize(lookAt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 camUp = cross(fw, ri);
  float fov = 0.75 + energy * 0.12 + climB * 0.2;
  vec3 rd = normalize(p.x * ri + p.y * camUp + fov * fw);

  // ─── Primary raymarch ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  vec2 hitMat = vec2(NC_MAX_DIST, -1.0);
  bool didHit = false;
  int maxSteps = int(mix(60.0, 90.0, energy));

  for (int i = 0; i < 90; i++) {
    if (i >= maxSteps) break;
    vec3 marchPos = ro + rd * totalDist;
    vec2 sceneD = ncMap(marchPos, ncTime, energy, bass, drumOn, tension, sJam, sSpace, climB);
    if (sceneD.x < NC_SURF_DIST) {
      hitPos = marchPos;
      hitMat = sceneD;
      didHit = true;
      break;
    }
    if (totalDist > NC_MAX_DIST) break;
    totalDist += sceneD.x * 0.65; // conservative step for complex SDF
  }

  // ─── Normal (shared raymarching utility) ───
  vec3 ncNorm = vec3(0.0, 1.0, 0.0);
  if (didHit) {
    ncNorm = ncNormal(hitPos);
  }

  // Cell identification for per-cell neon color
  float cellSize = 5.0;
  float hitCellZ = floor(hitPos.z / cellSize);

  // ─── Lighting + material shading ───
  vec3 col = vec3(0.0);

  if (didHit) {
    float matID = hitMat.y;
    float depthFade = clamp(totalDist / NC_MAX_DIST, 0.0, 1.0);

    // Neon glow color for this cell
    vec3 neonCol = ncNeonColor(hitCellZ, ncTime, tension, bass, uPalettePrimary, uPaletteSecondary, sJam);
    // Secondary neon color (offset cell)
    vec3 neonCol2 = ncNeonColor(hitCellZ + 1.0, ncTime, tension, bass, uPalettePrimary, uPaletteSecondary, sJam);

    // Base directional light (dim — neon is the primary illumination)
    vec3 lightDir = normalize(vec3(0.2, 0.6, 0.3));
    float diff = max(dot(ncNorm, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, ncNorm), -rd), 0.0), 16.0 + energy * 32.0);

    // Ambient occlusion (simple)
    float ambOcc = 1.0;
    for (int j = 1; j < 4; j++) {
      float aoDist = 0.15 * float(j);
      float aoSample = ncMap(hitPos + ncNorm * aoDist, ncTime, energy, bass, drumOn, tension, sJam, sSpace, climB).x;
      ambOcc -= (aoDist - aoSample) * (0.35 / float(j));
    }
    ambOcc = clamp(ambOcc, 0.15, 1.0);

    // Fresnel
    float fresnel = pow(1.0 - max(dot(ncNorm, -rd), 0.0), 3.5);

    // ── Material: Floor (0) ──
    if (matID < 0.5) {
      // Reflective dark floor — checkerboard subtle pattern
      vec2 floorUV = hitPos.xz * 0.5;
      float checker = mod(floor(floorUV.x) + floor(floorUV.y), 2.0);
      vec3 floorBase = mix(vec3(0.02, 0.015, 0.025), vec3(0.04, 0.03, 0.05), checker);

      // Neon reflection approximation: project neon color onto floor
      float reflStr = (0.3 + bass * 0.5) * (1.0 - depthFade * 0.5);
      vec3 neonRefl = neonCol * reflStr * 0.4;
      neonRefl += neonCol2 * reflStr * 0.2;
      // Fresnel-boosted reflection
      neonRefl *= (0.5 + fresnel * 1.5);

      col = floorBase * ambOcc + neonRefl * (1.0 - depthFade * 0.7);

      // Secondary ray reflection (approximate)
      vec3 reflDir = reflect(rd, ncNorm);
      float reflMarch = 0.0;
      for (int ri2 = 0; ri2 < 20; ri2++) {
        vec3 reflPos = hitPos + reflDir * reflMarch;
        vec2 reflD = ncMap(reflPos, ncTime, energy, bass, drumOn, tension, sJam, sSpace, climB);
        if (reflD.x < 0.01) {
          // Hit something in reflection — tint floor with its neon glow
          float reflCellZ = floor(reflPos.z / cellSize);
          vec3 reflNeon = ncNeonColor(reflCellZ, ncTime, tension, bass, uPalettePrimary, uPaletteSecondary, sJam);
          if (reflD.y > 2.5 && reflD.y < 3.5) {
            // Reflected neon tube — bright
            col += reflNeon * 0.6 * fresnel * reflStr;
          } else {
            col += reflNeon * 0.15 * fresnel * reflStr;
          }
          break;
        }
        if (reflMarch > 8.0) break;
        reflMarch += reflD.x * 0.8;
      }
    }
    // ── Material: Wall (1) ──
    else if (matID < 1.5) {
      vec3 wallBase = vec3(0.03, 0.02, 0.04) * ambOcc;
      // Neon illumination from nearby tubes
      float neonProx = 1.0 / (1.0 + totalDist * 0.3);
      col = wallBase + neonCol * neonProx * 0.08 * energy;
      col += diff * vec3(0.02) + spec * neonCol * 0.05;
      // Vocal uplighting: warm wash on walls
      col += vec3(0.08, 0.04, 0.02) * vocalP * 0.3;
    }
    // ── Material: Archway (2) ──
    else if (matID < 2.5) {
      vec3 archBase = vec3(0.05, 0.04, 0.06);
      col = archBase * (0.1 + diff * 0.3) * ambOcc;
      col += neonCol * 0.12 * energy;
      col += spec * neonCol * 0.08;
      // Metallic sheen
      col += fresnel * mix(neonCol, neonCol2, 0.5) * 0.15;
    }
    // ── Material: Neon tube (3) ──
    else if (matID < 3.5) {
      // Self-illuminated: these ARE the light source
      float neonBright = (1.5 + energy * 2.0 + sJam * 1.0) * (1.0 - sSpace * 0.6);
      // Drum onset flicker
      float flicker = 1.0 - drumOn * 0.4 * (0.5 + 0.5 * sin(uTime * 40.0));
      col = neonCol * neonBright * flicker;
      // Glow halo: bloom beyond the tube surface
      float glowFalloff = 1.0 / (1.0 + totalDist * totalDist * 0.1);
      col *= glowFalloff;
      // Chorus: full Vegas intensity
      col *= (1.0 + sChorus * 0.5);
      // Climax: saturate to white-hot
      col = mix(col, vec3(length(col) * 1.2), climB * 0.3);
    }
    // ── Material: Dice (4) ──
    else if (matID < 4.5) {
      // Glossy white with neon illumination
      vec3 diceBase = vec3(0.85, 0.82, 0.8);
      col = diceBase * (0.1 + diff * 0.5) * ambOcc;
      // Neon tinted specular
      col += spec * neonCol * 0.3;
      col += fresnel * neonCol * 0.15;
      // Pip indentations show as darker
      float pipShadow = 1.0 - smoothstep(0.0, 0.01, hitMat.x + 0.005) * 0.3;
      col *= pipShadow;
      // Drum onset: bounce flash
      col += vec3(0.3) * drumOn * 0.4;
    }
    // ── Material: Card suit (5) ──
    else if (matID < 5.5) {
      // Neon-colored card suit cutouts
      float suitCellZ = floor(hitPos.z / 2.5);
      float suitType = mod(suitCellZ, 4.0);
      // Red suits (diamonds=0, hearts=1) vs neon green suits (spades=2, clubs=3)
      vec3 suitColor;
      if (suitType < 2.0) {
        suitColor = vec3(1.0, 0.1, 0.2); // Red
      } else {
        suitColor = vec3(0.1, 0.9, 0.3); // Neon green (instead of black)
      }
      float suitGlow = 0.8 + energy * 1.2 + bass * 0.5;
      col = suitColor * suitGlow;
      col += fresnel * neonCol * 0.1;
    }
    // ── Material: Ceiling (6) ──
    else {
      vec3 ceilBase = vec3(0.02, 0.015, 0.03);
      col = ceilBase * ambOcc;
      // Recessed panels glow with neon light
      vec2 panelUV = fract(hitPos.xz * 0.4);
      float panelEdge = smoothstep(0.45, 0.48, max(abs(panelUV.x - 0.5), abs(panelUV.y - 0.5)));
      col += neonCol * panelEdge * 0.15 * energy;
      col += diff * vec3(0.02);
    }

    // ─── Distance fog ───
    vec3 fogCol = mix(vec3(0.01, 0.005, 0.02), neonCol * 0.03, energy);
    float fogAmount = 1.0 - exp(-totalDist * (0.06 + sSpace * 0.04 - sJam * 0.02));
    col = mix(col, fogCol, fogAmount);

  } else {
    // Miss: deep void with faint neon glow
    vec3 voidNeon = ncNeonColor(floor(ro.z / 5.0) + 3.0, ncTime, tension, bass,
                                 uPalettePrimary, uPaletteSecondary, sJam);
    col = voidNeon * 0.005 + palCol1 * 0.01;
  }

  // ─── Volumetric haze ───
  {
    float hazeAccum = 0.0;
    vec3 hazeColor = vec3(0.0);
    float hazeMax = didHit ? min(totalDist, 12.0) : 12.0;
    int hazeSteps = 12;
    float hazeStep = hazeMax / float(hazeSteps);
    for (int hi = 0; hi < 12; hi++) {
      float ht = float(hi) * hazeStep + hazeStep * 0.5;
      vec3 hazePos = ro + rd * ht;
      // Noise-based density
      float hazeDensity = fbm3(hazePos * 0.15 + ncTime * 0.03);
      hazeDensity = hazeDensity * 0.5 + 0.5; // remap 0-1
      hazeDensity *= (0.04 + energy * 0.06 + sSpace * 0.03);
      // Height falloff: thicker near floor
      float heightFade = smoothstep(3.0, -0.5, hazePos.y);
      hazeDensity *= heightFade;
      // Neon illumination of haze
      float hazeCellZ = floor(hazePos.z / 5.0);
      vec3 hazeNeon = ncNeonColor(hazeCellZ, ncTime, tension, bass,
                                   uPalettePrimary, uPaletteSecondary, sJam);
      hazeColor += hazeNeon * hazeDensity * hazeStep;
      hazeAccum += hazeDensity * hazeStep;
    }
    col += hazeColor * (0.3 + vocalP * 0.2 + climB * 0.3);
    // Haze also attenuates scene behind it
    col = mix(col, col * 0.9, clamp(hazeAccum * 0.3, 0.0, 0.15));
  }

  // ─── Neon glow rings: point light falloff from neon tubes ───
  {
    float glowAccum = 0.0;
    vec3 glowCol = vec3(0.0);
    for (int gi = -1; gi <= 2; gi++) {
      float gCellZ = floor(ro.z / 5.0) + float(gi);
      float gZ = (gCellZ + 0.5) * 5.0;
      vec3 gNeon = ncNeonColor(gCellZ, ncTime, tension, bass,
                                uPalettePrimary, uPaletteSecondary, sJam);
      // Four tube corner positions per cell — unrolled for WebGL compat
      vec3 tp0 = vec3(-2.4, 2.6, gZ);
      vec3 tp1 = vec3(2.4, 2.6, gZ);
      vec3 tp2 = vec3(-2.4, -1.3, gZ);
      vec3 tp3 = vec3(2.4, -1.3, gZ);

      // Accumulate glow from each tube corner
      for (int ti = 0; ti < 4; ti++) {
        vec3 tpCur = tp0;
        if (ti == 1) tpCur = tp1;
        if (ti == 2) tpCur = tp2;
        if (ti == 3) tpCur = tp3;
        // Project tube position onto view ray for glow contribution
        vec3 toTube = tpCur - ro;
        float projDist = dot(toTube, rd);
        float projGate = step(0.0, projDist);
        vec3 closest = ro + rd * max(projDist, 0.01);
        float dist2tube = length(closest - tpCur);
        float glow = 1.0 / (1.0 + dist2tube * dist2tube * 3.0);
        glow *= smoothstep(NC_MAX_DIST, 0.0, projDist) * projGate;
        glowCol += gNeon * glow * 0.08;
      }
    }
    col += glowCol * (0.5 + energy * 0.5);
  }

  // ─── Beat snap strobe ───
  {
    float strobe = uBeatSnap * (0.15 + climB * 0.2);
    col += vec3(strobe);
  }

  // ─── Vignette ───
  {
    float vig = 1.0 - dot(p * 0.32, p * 0.32);
    vig = smoothstep(0.0, 1.0, vig);
    float vigStr = 0.40 + sSpace * 0.15 - sJam * 0.1;
    col = mix(vec3(0.01, 0.005, 0.015), col, mix(1.0, vig, vigStr));
  }

  // ─── Minimum brightness (no dead black) ───
  col = max(col, vec3(0.015, 0.01, 0.02));

  // ─── Icon emergence ───
  {
    float noiseF = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, uBass, palCol1, palCol2, noiseF, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, uBass, palCol1, palCol2, noiseF, uSectionIndex);
  }

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uvCoord, p);

  gl_FragColor = vec4(col, 1.0);
  ${ncDepthAlpha}
}
`;
