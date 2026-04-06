/**
 * Cosmic Railroad — raymarched train tracks through a starfield.
 * For "I Know You Rider" — riding a train through the cosmos.
 * Railroad ties repeat as geometry, aurora overhead, nebula clouds,
 * telegraph poles with wires, cosmic dust. Tracks curve through infinity.
 *
 * Audio reactivity:
 *   uBass             → track vibration, ground rumble displacement
 *   uEnergy           → aurora intensity, nebula brightness, travel speed
 *   uDrumOnset        → rail click brightness flash, telegraph pole spark
 *   uVocalPresence    → aurora curtain brightness and height
 *   uHarmonicTension  → track curvature (straight→winding), nebula color shift
 *   uMelodicPitch     → aurora wave frequency
 *   uSectionType      → jam=tracks dissolve into starfield, space=floating nebula, chorus=racing forward
 *   uClimaxPhase      → tracks lift off ground into cosmic flight
 *   uBeatSnap         → star pulse
 *   uSlowEnergy       → forward camera speed
 *   uSemanticCosmic   → nebula density boost, star count
 *   uSemanticTriumphant → vanishing point brightness
 *   uTimbralBrightness→ rail specular intensity
 *   uDynamicRange     → aurora fold depth
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const cosmicRailroadVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  caEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
});

export const cosmicRailroadFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;

#define CR_TAU 6.28318530
#define CR_PI 3.14159265
#define CR_MAX_DIST 100.0
#define CR_MAX_STEPS 90
#define CR_SURF_DIST 0.003
#define CR_GAUGE 0.72
#define CR_TIE_SPACING 0.9
#define CR_POLE_SPACING 16.0

// ─── Track curve: sinusoidal displacement in X based on Z ───
float crCurve(float z, float tension) {
  float curvature = 0.3 + tension * 1.8;
  return sin(z * 0.04 * curvature) * (2.5 + tension * 4.0)
       + sin(z * 0.017 * curvature + 1.7) * 1.5;
}

float crCurveDerivX(float z, float tension) {
  float curvature = 0.3 + tension * 1.8;
  return cos(z * 0.04 * curvature) * 0.04 * curvature * (2.5 + tension * 4.0)
       + cos(z * 0.017 * curvature + 1.7) * 0.017 * curvature * 1.5;
}

// ─── Rail SDF: thin box along Z ───
float crRail(vec3 pos, float cx, float bassV) {
  // Rail cross-section: tall narrow rectangle
  float railW = 0.035;
  float railH = 0.06;
  // Bass vibration on rail height
  float vibY = sin(pos.z * 8.0 + uDynamicTime * 4.0) * bassV * 0.008;
  vec2 dd = vec2(abs(pos.x - cx) - railW, abs(pos.y - railH * 0.5 + vibY) - railH);
  return length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
}

// ─── Railroad tie SDF: repeating box across tracks ───
float crTie(vec3 pos, float cx, float bassV) {
  // Repeat along Z
  float tieZ = mod(pos.z + CR_TIE_SPACING * 0.5, CR_TIE_SPACING) - CR_TIE_SPACING * 0.5;
  // Tie dimensions: wide across tracks, thin along Z, low height
  float tieW = CR_GAUGE + 0.35;
  float tieH = 0.05;
  float tieD = 0.12;
  // Bass rumble lifts ties slightly
  float liftY = bassV * 0.01 * sin(pos.z * 3.0);
  vec3 tp = vec3(pos.x - cx, pos.y - tieH * 0.5 + liftY, tieZ);
  vec3 dd3 = abs(tp) - vec3(tieW * 0.5, tieH, tieD * 0.5);
  return length(max(dd3, 0.0)) + min(max(dd3.x, max(dd3.y, dd3.z)), 0.0);
}

// ─── Gravel bed: bumpy ground around tracks ───
float crBallast(vec3 pos, float cx, float bassV) {
  float bedW = CR_GAUGE + 0.7;
  float inBed = smoothstep(bedW * 0.5, bedW * 0.5 - 0.3, abs(pos.x - cx));
  float baseY = -0.04 + bassV * 0.015 * sin(pos.z * 2.0 + pos.x * 3.0);
  return pos.y - baseY - inBed * 0.02;
}

// ─── Telegraph pole SDF ───
float crPole(vec3 pos, float poleH) {
  float cylR = 0.07;
  float cylDist = length(pos.xz) - cylR;
  float capY = clamp(pos.y, 0.0, poleH);
  return max(cylDist, abs(pos.y - capY));
}

// ─── Crossarm on pole ───
float crCrossarm(vec3 pos, float poleH) {
  vec3 armP = pos - vec3(0.0, poleH - 0.1, 0.0);
  vec2 armD = abs(armP.xz) - vec2(1.0, 0.035);
  float armXZ = length(max(armD, 0.0)) + min(max(armD.x, armD.y), 0.0);
  return max(armXZ, abs(armP.y) - 0.05);
}

// ─── Scene SDF ───
float crMap(vec3 pos, float bassV, float tension, float climaxLift, float jamDissolve) {
  float dScene = CR_MAX_DIST;

  // Track center from curve
  float cx = crCurve(pos.z, tension);

  // Climax: tracks lift off the ground
  float liftAmount = climaxLift * 3.0 * (0.5 + 0.5 * sin(pos.z * 0.05));
  vec3 liftedPos = vec3(pos.x, pos.y - liftAmount, pos.z);

  // Jam dissolve: fade out track geometry
  float trackSolidity = 1.0 - jamDissolve * 0.85;

  // Left rail
  float dRailL = crRail(liftedPos, cx - CR_GAUGE * 0.5, bassV) / trackSolidity;
  dScene = min(dScene, dRailL);

  // Right rail
  float dRailR = crRail(liftedPos, cx + CR_GAUGE * 0.5, bassV) / trackSolidity;
  dScene = min(dScene, dRailR);

  // Ties
  float dTie = crTie(liftedPos, cx, bassV) / trackSolidity;
  dScene = min(dScene, dTie);

  // Gravel bed (only when not fully airborne)
  if (climaxLift < 0.8) {
    float dBallast = crBallast(pos, cx, bassV);
    dScene = min(dScene, dBallast);
  }

  // Telegraph poles: repeating along Z, offset from tracks
  float poleZ = mod(pos.z + CR_POLE_SPACING * 0.5, CR_POLE_SPACING) - CR_POLE_SPACING * 0.5;
  float poleH = 4.5 + climaxLift * 2.0;
  float poleCx = crCurve(pos.z - poleZ + pos.z, tension); // approximate nearest pole center

  // Right side pole
  vec3 poleRP = vec3(pos.x - (cx + CR_GAUGE + 2.0), pos.y, poleZ);
  float dPoleR = crPole(poleRP, poleH);
  float dArmR = crCrossarm(poleRP, poleH);
  dScene = min(dScene, min(dPoleR, dArmR));

  // Left side pole
  vec3 poleLR = vec3(pos.x - (cx - CR_GAUGE - 2.0), pos.y, poleZ);
  float dPoleL = crPole(poleLR, poleH);
  float dArmL = crCrossarm(poleLR, poleH);
  dScene = min(dScene, min(dPoleL, dArmL));

  return dScene;
}

// ─── Normal from SDF ───
vec3 crNormal(vec3 pos, float bassV, float tension, float climaxLift, float jamDissolve) {
  vec2 eps = vec2(0.003, 0.0);
  float ref = crMap(pos, bassV, tension, climaxLift, jamDissolve);
  return normalize(vec3(
    crMap(pos + eps.xyy, bassV, tension, climaxLift, jamDissolve) - ref,
    crMap(pos + eps.yxy, bassV, tension, climaxLift, jamDissolve) - ref,
    crMap(pos + eps.yyx, bassV, tension, climaxLift, jamDissolve) - ref
  ));
}

// ─── Ambient occlusion ───
float crAO(vec3 pos, vec3 nrm, float bassV, float tension, float climaxLift, float jamDissolve) {
  float aoVal = 1.0;
  for (int j = 1; j <= 4; j++) {
    float dist = 0.12 * float(j);
    float sampled = crMap(pos + nrm * dist, bassV, tension, climaxLift, jamDissolve);
    aoVal -= (dist - sampled) * (0.35 / float(j));
  }
  return clamp(aoVal, 0.15, 1.0);
}

// ─── Wire catenary between poles ───
float crWire(vec3 pos, float cx, float poleH) {
  float zCell = floor((pos.z + CR_POLE_SPACING * 0.5) / CR_POLE_SPACING);
  float zFrac = (pos.z - (zCell * CR_POLE_SPACING)) / CR_POLE_SPACING;
  float sag = 0.6;
  float zNorm = (zFrac - 0.5) * 2.0;
  float zn2 = zNorm * zNorm;
  float approxCosh = 1.0 + zn2 * 0.5 + zn2 * zn2 / 24.0;
  float catenary = sag * (approxCosh - 1.0);
  float wireY = poleH - 0.4 - catenary;

  // Two wires per side
  float rOff = cx + CR_GAUGE + 2.0;
  float lOff = cx - CR_GAUGE - 2.0;
  float wR1 = length(vec2(pos.x - (rOff + 0.7), pos.y - wireY)) - 0.015;
  float wR2 = length(vec2(pos.x - (rOff - 0.7), pos.y - wireY)) - 0.015;
  float wL1 = length(vec2(pos.x - (lOff + 0.7), pos.y - wireY)) - 0.015;
  float wL2 = length(vec2(pos.x - (lOff - 0.7), pos.y - wireY)) - 0.015;
  return min(min(wR1, wR2), min(wL1, wL2));
}

// ─── Starfield: hash-based point lights ───
vec3 crStars(vec3 rd, float beatSnp, float cosmic) {
  vec3 col = vec3(0.0);
  // Multiple density layers
  for (int layer = 0; layer < 3; layer++) {
    float density = 60.0 + float(layer) * 40.0;
    vec3 cell = floor(rd * density);
    float hsh = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7 + float(layer) * 31.0))) * 43758.5453);
    float threshold = 0.90 - cosmic * 0.05;
    float bright = step(threshold, hsh);
    float starDist = length(fract(rd * density) - 0.5);
    float starSize = 0.04 - float(layer) * 0.01;
    float starPoint = smoothstep(starSize, starSize * 0.2, starDist) * bright;
    // Twinkle
    float twinkle = 0.6 + 0.4 * sin(uDynamicTime * (1.5 + hsh * 3.0) + hsh * 50.0);
    // Beat snap pulse
    float pulse = 1.0 + beatSnp * 0.4;
    // Star color: warm whites + occasional blue/gold
    vec3 starCol = mix(vec3(0.9, 0.88, 0.8), vec3(0.6, 0.7, 1.0), step(0.95, hsh));
    starCol = mix(starCol, vec3(1.0, 0.85, 0.5), step(0.97, hsh));
    col += starCol * starPoint * twinkle * pulse * (1.0 - float(layer) * 0.25);
  }
  return col;
}

// ─── Aurora borealis: vertical curtain of light ───
vec3 crAurora(vec3 rd, float ft, float energy, float vocalP, float pitch, float dynRange) {
  if (rd.y < 0.05) return vec3(0.0);
  vec3 col = vec3(0.0);
  float heightMask = smoothstep(0.05, 0.3, rd.y) * smoothstep(0.95, 0.6, rd.y);
  float curtainHeight = 0.4 + vocalP * 0.3;
  heightMask *= smoothstep(0.0, curtainHeight, rd.y);

  // Multiple curtain layers with melodic pitch controlling wave frequency
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float freq = (3.0 + pitch * 4.0) + fi * 1.5;
    float speed = 0.3 + fi * 0.1;
    float phase = fi * 1.57;
    // Curtain wave displacement
    float wave = sin(rd.x * freq + ft * speed + phase) * (0.08 + fi * 0.02);
    // Fold complexity from dynamic range
    wave += sin(rd.x * freq * 2.3 + ft * speed * 0.7 + phase * 2.0) * dynRange * 0.04;
    float curtain = smoothstep(0.12, 0.0, abs(rd.y - (0.35 + wave + fi * 0.08)));
    // Vertical shimmer
    float shimmer = fbm3(vec3(rd.x * 5.0, rd.y * 12.0 + ft * 0.4, fi * 7.0 + ft * 0.1));
    shimmer = shimmer * 0.5 + 0.5;
    // Aurora colors: green base, purple/pink at edges
    vec3 auroraCol;
    if (i < 2) {
      auroraCol = mix(vec3(0.1, 0.9, 0.3), vec3(0.05, 0.6, 0.2), shimmer);
    } else {
      auroraCol = mix(vec3(0.6, 0.1, 0.8), vec3(0.9, 0.2, 0.5), shimmer);
    }
    float layerStr = (0.3 + energy * 0.5 + vocalP * 0.3) / (1.0 + fi * 0.3);
    col += auroraCol * curtain * shimmer * heightMask * layerStr;
  }
  return col;
}

// ─── Nebula clouds: volumetric density field ───
vec3 crNebula(vec3 ro, vec3 rd, float maxT, bool didHit, float energy, float tension,
              float ft, vec3 palCol1, vec3 palCol2, float cosmic, float spaceMode) {
  vec3 col = vec3(0.0);
  int steps = 12 + int(cosmic * 6.0);
  float stepSize = min(maxT, 40.0) / float(steps);

  for (int i = 0; i < 18; i++) {
    if (i >= steps) break;
    float marchT = float(i) * stepSize + stepSize * 0.5;
    if (marchT > maxT && didHit) break;
    vec3 sampleP = ro + rd * marchT;

    // Nebula density from FBM
    float density = fbm3(sampleP * 0.06 + ft * 0.01 + tension * 0.3);
    density += fbm3(sampleP * 0.12 - ft * 0.008) * 0.5;
    density = smoothstep(0.1 - cosmic * 0.1 - spaceMode * 0.15, 0.6, density);

    if (density > 0.01) {
      // Nebula color: palette-derived with tension shift
      float colorMix = fbm3(sampleP * 0.03 + 10.0);
      vec3 nebCol = mix(palCol1 * 0.6, palCol2 * 0.8, colorMix * 0.5 + 0.5);
      // Tension shifts toward reds/purples
      nebCol = mix(nebCol, vec3(0.5, 0.1, 0.6), tension * 0.3);
      // Emission: brighter cores
      float emission = smoothstep(0.3, 0.8, density) * (0.4 + energy * 0.4);
      float distFade = exp(-marchT * 0.03);
      col += nebCol * density * emission * distFade * stepSize * 0.08;
    }
  }
  return col;
}

// ─── Cosmic dust particles ───
vec3 crDust(vec2 screenP, float ft, float energy) {
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float seed = fi * 73.7;
    float hsh = fract(sin(seed) * 43758.5453);
    vec2 dustPos = vec2(
      sin(ft * (0.1 + hsh * 0.2) + seed) * 0.8,
      cos(ft * (0.08 + hsh * 0.15) + seed * 2.0) * 0.5
    );
    float dist = length(screenP - dustPos);
    float particle = smoothstep(0.05, 0.005, dist);
    float drift = 0.5 + 0.5 * sin(ft * 0.5 + seed);
    col += vec3(0.4, 0.5, 0.7) * particle * drift * 0.06 * (0.3 + energy * 0.5);
  }
  return col;
}

// ─── Vanishing point glow ───
vec3 crVanishingPoint(vec3 rd, vec3 fwDir, float energy, float triumphant, float climaxV) {
  float alignment = max(dot(rd, fwDir), 0.0);
  float glow = pow(alignment, 12.0) * (0.3 + energy * 0.4 + triumphant * 0.3 + climaxV * 0.4);
  float corona = pow(alignment, 4.0) * 0.08;
  vec3 glowCol = mix(vec3(0.8, 0.7, 0.5), vec3(1.0, 0.95, 0.85), alignment);
  return glowCol * (glow + corona);
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 pCoord = (uv - 0.5) * asp;

  // ─── Audio clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatSnp = clamp(uBeatSnap, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float triumphant = clamp(uSemanticTriumphant, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);

  // ─── Section types ───
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxV = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Dynamic time ───
  float ft = uDynamicTime * (0.1 + slowE * 0.08) * (1.0 + sChorus * 0.5 - sSpace * 0.4);

  // ─── Forward travel speed ───
  float forwardSpeed = ft * 6.0 + sChorus * ft * 3.0;

  // ─── Palette ───
  float h1 = hsvToCosineHue(uPalettePrimary);
  vec3 palCol1 = 0.5 + 0.5 * cos(CR_TAU * vec3(h1, h1 + 0.33, h1 + 0.67));
  float h2 = hsvToCosineHue(uPaletteSecondary);
  vec3 palCol2 = 0.5 + 0.5 * cos(CR_TAU * vec3(h2, h2 + 0.33, h2 + 0.67));

  // Track center at camera Z
  float camZ = forwardSpeed;
  float trackCx = crCurve(camZ, tension);
  float trackSlope = crCurveDerivX(camZ, tension);

  // ─── Camera: riding the train, looking forward ───
  float camSway = sin(ft * 0.12) * 0.15 * (1.0 - sSpace * 0.7);
  float camBob = cos(ft * 0.18) * 0.04 + bass * 0.03 * sin(ft * 3.0);
  float camHeight = 1.8 + climaxV * 2.5 + sSpace * 1.5;

  vec3 ro = vec3(
    trackCx + camSway,
    camHeight + camBob,
    camZ
  );

  // Look ahead along track curve
  float lookAheadZ = camZ + 25.0;
  float lookAheadCx = crCurve(lookAheadZ, tension);
  vec3 lookAt = vec3(
    lookAheadCx + sin(ft * 0.06) * 0.2,
    camHeight * 0.7 + vocalP * 0.3 - sSpace * 0.5 + climaxV * 1.5,
    lookAheadZ
  );

  // ─── Camera matrix ───
  vec3 fwDir = normalize(lookAt - ro);
  vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fwDir));
  vec3 upd = cross(fwDir, rgt);

  // Slight roll from track banking
  float rollAngle = trackSlope * 0.15 + sin(ft * 0.25) * 0.04;
  vec3 rolledRgt = rgt * cos(rollAngle) + upd * sin(rollAngle);
  vec3 rolledUp = -rgt * sin(rollAngle) + upd * cos(rollAngle);

  float fov = 0.85 + energy * 0.1 + climaxV * 0.2 + sChorus * 0.1;
  vec3 rd = normalize(pCoord.x * rolledRgt + pCoord.y * rolledUp + fov * fwDir);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  bool didHit = false;

  float jamDissolve = sJam;
  float climaxLift = climaxV;

  for (int i = 0; i < CR_MAX_STEPS; i++) {
    vec3 pos = ro + rd * totalDist;
    float dist = crMap(pos, bass, tension, climaxLift, jamDissolve);

    // Wire test
    float cx = crCurve(pos.z, tension);
    float poleH = 4.5 + climaxLift * 2.0;
    float wireDist = crWire(pos, cx, poleH);
    dist = min(dist, wireDist);

    if (dist < CR_SURF_DIST) {
      hitPos = pos;
      didHit = true;
      break;
    }
    if (totalDist > CR_MAX_DIST) break;
    totalDist += dist * 0.7;
  }

  // ─── Sky: deep space base ───
  vec3 col = vec3(0.01, 0.008, 0.02);

  // Stars
  col += crStars(rd, beatSnp, cosmic);

  // Aurora
  col += crAurora(rd, ft, energy, vocalP, pitch, dynRange);

  // Vanishing point glow
  col += crVanishingPoint(rd, fwDir, energy, triumphant, climaxV);

  // ─── Surface shading ───
  if (didHit) {
    vec3 nrm = crNormal(hitPos, bass, tension, climaxLift, jamDissolve);
    float dpth = clamp(totalDist / CR_MAX_DIST, 0.0, 1.0);

    // ─── Lighting: starlight + aurora emission ───
    vec3 starLight = normalize(vec3(0.3, 0.8, 0.4));
    float diff = max(dot(nrm, starLight), 0.0);
    float spec = pow(max(dot(reflect(-starLight, nrm), -rd), 0.0), 24.0 + timbralBright * 40.0);
    float fres = pow(1.0 - max(dot(nrm, -rd), 0.0), 3.5);

    // AO
    float aoVal = crAO(hitPos, nrm, bass, tension, climaxLift, jamDissolve);

    // ─── Material identification ───
    float cx = crCurve(hitPos.z, tension);
    float climaxLiftLocal = climaxLift * 3.0 * (0.5 + 0.5 * sin(hitPos.z * 0.05));

    // Rails: metallic
    float isRailL = smoothstep(0.06, 0.0, abs(hitPos.x - (cx - CR_GAUGE * 0.5)));
    float isRailR = smoothstep(0.06, 0.0, abs(hitPos.x - (cx + CR_GAUGE * 0.5)));
    float isRail = max(isRailL, isRailR);

    // Ties: wood texture
    float tieZ = mod(hitPos.z + CR_TIE_SPACING * 0.5, CR_TIE_SPACING) - CR_TIE_SPACING * 0.5;
    float isTie = smoothstep(0.15, 0.0, abs(tieZ)) * smoothstep(CR_GAUGE * 0.5 + 0.35, CR_GAUGE * 0.5, abs(hitPos.x - cx));

    // Poles
    float poleZ = mod(hitPos.z + CR_POLE_SPACING * 0.5, CR_POLE_SPACING) - CR_POLE_SPACING * 0.5;
    float isPoleR = smoothstep(0.2, 0.0, length(vec2(hitPos.x - (cx + CR_GAUGE + 2.0), poleZ)));
    float isPoleL = smoothstep(0.2, 0.0, length(vec2(hitPos.x - (cx - CR_GAUGE - 2.0), poleZ)));
    float isPole = max(isPoleR, isPoleL);

    // Ground/ballast
    float isGround = 1.0 - max(max(isRail, isTie), isPole);
    isGround = max(isGround, 0.0);

    // ─── Rail material: polished steel, reflective ───
    vec3 railCol = vec3(0.25, 0.25, 0.28);
    // Rail click flash on drum onset
    float tieClickPhase = fract(hitPos.z / CR_TIE_SPACING);
    float clickFlash = drumOn * smoothstep(0.1, 0.0, abs(tieClickPhase - 0.5)) * 0.8;
    railCol += vec3(0.7, 0.6, 0.4) * clickFlash;
    // Timbral brightness → specular boost
    railCol *= 1.0 + timbralBright * 0.3;

    // ─── Tie material: dark wood with noise grain ───
    vec3 tieCol = vec3(0.08, 0.05, 0.03);
    float woodGrain = snoise(vec3(hitPos.x * 8.0, hitPos.z * 2.0, 0.0));
    tieCol += vec3(0.03, 0.02, 0.01) * woodGrain;

    // ─── Gravel: noisy dark aggregate ───
    vec3 gravelCol = vec3(0.06, 0.05, 0.04);
    float gravelNoise = snoise(vec3(hitPos.xz * 6.0, 0.0));
    gravelCol += vec3(0.02) * gravelNoise;
    // Palette influence
    gravelCol = mix(gravelCol, palCol1 * 0.04, 0.2);

    // ─── Pole material: weathered wood ───
    vec3 poleCol = vec3(0.1, 0.08, 0.05);
    // Drum onset: telegraph spark
    poleCol += vec3(0.6, 0.4, 0.15) * drumOn * 0.5;

    // ─── Composite material ───
    vec3 matCol = gravelCol * isGround + railCol * isRail + tieCol * isTie + poleCol * isPole;

    // ─── Apply lighting ───
    vec3 ambient = vec3(0.015, 0.012, 0.025); // cold starlight ambient
    // Aurora bounce light: green/purple ambient from above
    vec3 auroraBounce = vec3(0.05, 0.12, 0.06) * vocalP * max(nrm.y, 0.0);
    vec3 litCol = matCol * (ambient + diff * 0.4 + auroraBounce) * aoVal;

    // Specular: strong on rails
    float specStr = mix(0.1, 0.7, isRail);
    vec3 specCol = mix(vec3(0.7, 0.7, 0.8), palCol2, 0.15);
    litCol += specCol * spec * specStr;

    // Fresnel: cosmic rim light
    vec3 rimCol = mix(vec3(0.15, 0.2, 0.4), palCol1, 0.3);
    litCol += rimCol * fres * 0.08;

    // ─── Rail reflections: stars reflected in polished steel ───
    if (isRail > 0.3) {
      vec3 reflDir = reflect(rd, nrm);
      vec3 reflStars = crStars(reflDir, beatSnp, cosmic) * 0.3;
      vec3 reflAurora = crAurora(reflDir, ft, energy, vocalP, pitch, dynRange) * 0.2;
      litCol += (reflStars + reflAurora) * isRail * fres;
    }

    // ─── Distance fog: cosmic mist ───
    float fogDensity = 0.008 + energy * 0.004;
    float fogAmount = 1.0 - exp(-totalDist * fogDensity);
    vec3 fogCol = mix(palCol1 * 0.04, palCol2 * 0.06, smoothstep(0.0, 0.3, rd.y));
    fogCol += vec3(0.02, 0.015, 0.04); // base cosmic dark

    col = mix(litCol, col + fogCol, fogAmount);
  }

  // ─── Nebula clouds: volumetric pass ───
  float nebulaMaxT = didHit ? totalDist : CR_MAX_DIST;
  col += crNebula(ro, rd, nebulaMaxT, didHit, energy, tension, ft, palCol1, palCol2, cosmic, sSpace);

  // ─── Wire glow overlay (even on miss) ───
  {
    float wireGlow = 0.0;
    for (int wg = 0; wg < 8; wg++) {
      float wgT = 2.0 + float(wg) * 5.0;
      if (wgT > totalDist && didHit) break;
      vec3 wgPos = ro + rd * wgT;
      float cx = crCurve(wgPos.z, tension);
      float poleH = 4.5 + climaxLift * 2.0;
      float wDist = crWire(wgPos, cx, poleH);
      wireGlow += smoothstep(0.12, 0.0, wDist) * 0.012 / (1.0 + wgT * 0.04);
    }
    // Wire color: dim silver with aurora tint
    vec3 wireGlowCol = mix(vec3(0.25, 0.25, 0.3), vec3(0.1, 0.4, 0.2), vocalP * 0.3);
    col += wireGlowCol * wireGlow;
  }

  // ─── Cosmic dust particles ───
  col += crDust(pCoord, ft, energy);

  // ─── Space mode: enhanced nebula + floating feel ───
  if (sSpace > 0.01) {
    float spaceNoise = fbm3(vec3(pCoord * 1.5, ft * 0.03));
    vec3 spaceGlow = mix(palCol1, palCol2, spaceNoise * 0.5 + 0.5) * 0.04 * sSpace;
    col += spaceGlow;
  }

  // ─── Energy + climax boost ───
  col *= 1.0 + energy * 0.2 + climaxV * 0.3;

  // ─── Beat snap pulse ───
  col *= 1.0 + beatSnp * 0.1;

  // ─── Vignette: focused forward ───
  float vgVal = 1.0 - dot(pCoord * 0.28, pCoord * 0.28);
  col = mix(vec3(0.015, 0.01, 0.025), col, smoothstep(0.0, 1.0, vgVal));

  // ─── Icon emergence ───
  {
    float nf = snoise(vec3(pCoord * 2.0, uTime * 0.1));
    col += iconEmergence(pCoord, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(pCoord, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // ─── Darkness texture for quiet passages ───
  col += darknessTexture(uv, uTime, energy);

  // ─── Minimum brightness floor ───
  col = max(col, vec3(0.012, 0.008, 0.02));

  // ─── Post-processing ───
  col = applyPostProcess(col, uv, pCoord);

  gl_FragColor = vec4(col, 1.0);
}
`;
