/**
 * Highway Horizon — raymarched infinite desert road with heat shimmer,
 * power lines receding to vanishing point, sunrise bleeding over mesa silhouettes.
 *
 * For "The Promised Land" (Chuck Berry) — a driving American road song.
 * Dark atmospheric base with dramatic lighting. Infinite road, monolithic mesas,
 * heat shimmer bringing the scene alive.
 *
 * Audio reactivity:
 *   uBass            -> road width pulsing, ground plane vibration
 *   uEnergy          -> heat shimmer intensity, dust density
 *   uDrumOnset       -> power line pole flash, road bump
 *   uVocalPresence   -> horizon glow intensity
 *   uHarmonicTension -> sky color shift (peaceful gold → ominous red)
 *   uSectionType     -> jam=mirage distortion, space=empty horizon, chorus=sunrise burst
 *   uClimaxPhase     -> everything intensifies, road fractures
 *   uBeatSnap        -> headlight flash effect
 *   uSlowEnergy      -> camera forward speed
 */
import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const highwayHorizonVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.05,
  caEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
  thermalShimmerEnabled: false, // we do our own heat shimmer in the scene
});

export const highwayHorizonFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;

#define HH_TAU 6.28318530
#define HH_PI 3.14159265
#define HH_MAX_DIST 120.0
#define HH_MAX_STEPS 96
#define HH_SURF_DIST 0.002

// ─── Palette helpers ───
vec3 hhPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(HH_TAU * (c * t + d));
}

// ─── Ground plane SDF: flat desert with bass vibration ───
float hhGround(vec3 pos, float bassV, float drumV) {
  float baseY = 0.0;
  // Bass vibration: gentle ground undulation
  baseY += sin(pos.x * 0.3 + pos.z * 0.2) * bassV * 0.15;
  // Drum onset: sharp bump near camera
  baseY += drumV * 0.08 * exp(-length(pos.xz) * 0.03);
  return pos.y - baseY;
}

// ─── Road surface SDF: asphalt strip down the center ───
float hhRoad(vec3 pos, float roadW) {
  // Road is a strip along Z axis
  float roadDist = abs(pos.x) - roadW;
  float roadY = pos.y + 0.005; // slightly recessed into ground
  return max(roadDist, abs(roadY) - 0.006);
}

// ─── Road markings: dashed center line + edge lines ───
float hhRoadMarking(vec3 pos, float roadW) {
  // Center dashed line: 3m dash, 5m gap
  float centerStripe = abs(pos.x) - 0.05;
  float dashMod = mod(pos.z, 8.0);
  float dashMask = step(dashMod, 3.0);
  float center = max(centerStripe, mix(1.0, abs(pos.y) - 0.008, dashMask));

  // Edge lines: continuous
  float edgeL = abs(pos.x + roadW * 0.95) - 0.04;
  float edgeR = abs(pos.x - roadW * 0.95) - 0.04;
  float edges = min(edgeL, edgeR);
  edges = max(edges, abs(pos.y) - 0.008);

  return min(center, edges);
}

// ─── Mesa/butte silhouettes: trapezoid SDFs repeated along X ───
float hhMesa(vec3 pos, float seed) {
  // Hash for mesa variation
  float hsh = fract(sin(seed * 127.1 + 311.7) * 43758.5453);
  float hsh2 = fract(sin(seed * 269.5 + 183.3) * 43758.5453);

  // Mesa dimensions from hash
  float mesaH = 3.0 + hsh * 8.0;
  float mesaTopW = 1.5 + hsh2 * 4.0;
  float mesaBotW = mesaTopW + mesaH * 0.4;

  // Tapered box: wider at bottom, narrow at top
  float yFrac = clamp(pos.y / mesaH, 0.0, 1.0);
  float currentW = mix(mesaBotW, mesaTopW, yFrac);
  float dx = abs(pos.x) - currentW;
  float dy = pos.y - mesaH;

  // 2D box distance
  vec2 dd = vec2(max(dx, 0.0), max(dy, 0.0));
  float outside = length(dd);
  float inside = min(max(dx, dy), 0.0);

  // Erode with noise for natural rock texture (kept small to preserve SDF Lipschitz)
  float erosion = snoise(vec3(pos.x * 0.3, pos.y * 0.5, seed * 10.0)) * 0.08;
  erosion += snoise(vec3(pos.x * 1.2, pos.y * 0.8, seed * 20.0)) * 0.03;

  return outside + inside + erosion;
}

// ─── Power line pole: thin vertical cylinder ───
float hhPole(vec3 pos, float poleH) {
  // Vertical cylinder
  float cylR = 0.08;
  float cylDist = length(pos.xz) - cylR;
  float capY = clamp(pos.y, 0.0, poleH);
  float yDist = abs(pos.y - capY);
  return max(cylDist, yDist);
}

// ─── Crossbar on pole top ───
float hhCrossbar(vec3 pos, float poleH) {
  vec3 barP = pos - vec3(0.0, poleH, 0.0);
  vec2 barD = abs(barP.xz) - vec2(1.2, 0.04);
  float barXZ = length(max(barD, 0.0)) + min(max(barD.x, barD.y), 0.0);
  return max(barXZ, abs(barP.y) - 0.06);
}

// ─── Scene SDF: composite everything ───
float hhMap(vec3 pos, float bassV, float drumV, float roadW, float climaxV) {
  float dScene = HH_MAX_DIST;

  // Ground plane
  float dGround = hhGround(pos, bassV, drumV);
  dScene = min(dScene, dGround);

  // Road surface
  float dRoadSurf = hhRoad(pos, roadW);
  dScene = min(dScene, dRoadSurf);

  // Mesas: placed at fixed distances along both sides of the road
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float mesaZ = 30.0 + fi * 18.0;
    float side = (mod(fi, 2.0) < 1.0) ? -1.0 : 1.0;
    float lateralOffset = 15.0 + fract(sin(fi * 73.7) * 43758.5453) * 20.0;
    vec3 mesaP = pos - vec3(side * lateralOffset, 0.0, mesaZ);
    float dMesa = hhMesa(mesaP, fi);
    dScene = min(dScene, dMesa);
  }

  // Power line poles: repeating along Z at fixed interval
  float poleSpacing = 20.0;
  float poleZ = mod(pos.z + poleSpacing * 0.5, poleSpacing) - poleSpacing * 0.5;
  float poleH = 6.0;

  // Right side pole
  vec3 poleRP = vec3(pos.x - (roadW + 3.0), pos.y, poleZ);
  float dPoleR = hhPole(poleRP, poleH);
  float dBarR = hhCrossbar(poleRP, poleH);
  dScene = min(dScene, min(dPoleR, dBarR));

  // Left side pole
  vec3 poleLR = vec3(pos.x + (roadW + 3.0), pos.y, poleZ);
  float dPoleL = hhPole(poleLR, poleH);
  float dBarL = hhCrossbar(poleLR, poleH);
  dScene = min(dScene, min(dPoleL, dBarL));

  // Climax: road fractures — cracks in the ground
  if (climaxV > 0.1) {
    float crackPattern = sin(pos.x * 3.0 + pos.z * 0.5) * sin(pos.z * 2.0 + pos.x * 0.3);
    float crack = abs(crackPattern) - 0.02 * climaxV;
    float crackDepth = pos.y + 0.3 * climaxV;
    float dCrack = max(crack, crackDepth);
    dCrack = max(dCrack, -hhGround(pos, bassV, drumV) + 0.05);
    dScene = min(dScene, dCrack);
  }

  return dScene;
}

// ─── Normal calculation with hh prefix ───
vec3 hhNormal(vec3 pos, float bassV, float drumV, float roadW, float climaxV) {
  vec2 hEps = vec2(0.005, 0.0);
  float ref = hhMap(pos, bassV, drumV, roadW, climaxV);
  vec3 n = vec3(
    hhMap(pos + hEps.xyy, bassV, drumV, roadW, climaxV) - ref,
    hhMap(pos + hEps.yxy, bassV, drumV, roadW, climaxV) - ref,
    hhMap(pos + hEps.yyx, bassV, drumV, roadW, climaxV) - ref
  );
  float len = length(n);
  return len > 0.0001 ? n / len : vec3(0.0, 1.0, 0.0);
}

// ─── Ambient occlusion ───
float hhAO(vec3 pos, vec3 nrm, float bassV, float drumV, float roadW, float climaxV) {
  float aoVal = 1.0;
  for (int j = 1; j <= 4; j++) {
    float dist = 0.12 * float(j);
    float sampled = hhMap(pos + nrm * dist, bassV, drumV, roadW, climaxV);
    aoVal -= (dist - sampled) * (0.35 / float(j));
  }
  return clamp(aoVal, 0.15, 1.0);
}

// ─── Power line wire: catenary curve between poles ───
float hhWire(vec3 pos, float roadW, float poleH) {
  float poleSpacing = 20.0;
  // Find nearest pole segment
  float zCell = floor((pos.z + poleSpacing * 0.5) / poleSpacing);
  float zFrac = (pos.z - (zCell * poleSpacing)) / poleSpacing;

  // Wire sag: catenary approximation y = a*cosh(x/a) - a
  // cosh not available in GLSL ES — approximate: cosh(x) ≈ 1 + x²/2 + x⁴/24
  float sag = 0.8;
  float zNorm = (zFrac - 0.5) * 2.0;
  float zn2 = zNorm * zNorm;
  float approxCosh = 1.0 + zn2 * 0.5 + zn2 * zn2 / 24.0;
  float catenary = sag * (approxCosh - 1.0);

  float wireY = poleH - 0.5 - catenary;

  // Two wires per side
  float wireDistR1 = length(vec2(pos.x - (roadW + 3.0 + 0.8), pos.y - wireY)) - 0.02;
  float wireDistR2 = length(vec2(pos.x - (roadW + 3.0 - 0.8), pos.y - wireY)) - 0.02;
  float wireDistL1 = length(vec2(pos.x + (roadW + 3.0 + 0.8), pos.y - wireY)) - 0.02;
  float wireDistL2 = length(vec2(pos.x + (roadW + 3.0 - 0.8), pos.y - wireY)) - 0.02;

  return min(min(wireDistR1, wireDistR2), min(wireDistL1, wireDistL2));
}

// ─── Sky rendering: desert sunset/sunrise with stars ───
vec3 hhSky(vec3 rd, float tension, float vocalP, float energy, float sChorus,
           float sSpace, float climaxV, float ft, vec3 sunDir, vec3 palCol1, vec3 palCol2) {
  // Base sky: dark blue zenith to warm horizon
  float sunDot = max(dot(rd, sunDir), 0.0);
  float horizonMask = smoothstep(0.0, 0.3, rd.y);
  float belowHorizon = smoothstep(0.02, -0.02, rd.y);

  // Sky gradient: tension shifts from gold to red
  vec3 zenithCol = mix(vec3(0.02, 0.03, 0.08), vec3(0.05, 0.02, 0.04), tension);
  vec3 horizonCol = mix(
    vec3(0.6, 0.35, 0.1),   // peaceful golden
    vec3(0.7, 0.15, 0.05),  // ominous red
    tension
  );
  // Chorus: brilliant sunrise burst
  horizonCol = mix(horizonCol, vec3(1.0, 0.7, 0.3), sChorus * 0.4);

  vec3 skyCol = mix(horizonCol, zenithCol, horizonMask);

  // Sun glow: concentrated disc with corona
  float sunGlow = pow(sunDot, 60.0) * 2.0;
  float sunCorona = pow(sunDot, 8.0) * 0.5;
  float sunHalo = pow(sunDot, 2.5) * 0.15;
  vec3 sunCol = mix(vec3(1.0, 0.8, 0.4), vec3(1.0, 0.5, 0.2), tension);
  skyCol += sunCol * (sunGlow + sunCorona + sunHalo) * (0.6 + vocalP * 0.4);

  // Chorus: sunrise burst intensification
  skyCol += sunCol * pow(sunDot, 4.0) * sChorus * 0.6;

  // Climax: sky catches fire
  skyCol += vec3(0.4, 0.15, 0.05) * climaxV * (0.3 + sunDot * 0.7);

  // God rays: volumetric streaks from sun position
  float godRayBase = pow(sunDot, 3.0);
  float rayNoise = fbm3(vec3(rd.xz * 4.0, ft * 0.05));
  float godRays = godRayBase * (0.5 + rayNoise * 0.5) * (0.3 + energy * 0.4 + vocalP * 0.3);
  skyCol += sunCol * godRays * 0.25;

  // Stars: upper sky in quiet moments
  if (rd.y > 0.2) {
    float starField = smoothstep(0.2, 0.6, rd.y);
    vec3 starCell = floor(rd * 80.0);
    float starHash = fract(sin(dot(starCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    float starBright = step(0.92, starHash) * (1.0 - energy * 0.6);
    float starDist = length(fract(rd * 80.0) - 0.5);
    float starPoint = smoothstep(0.05, 0.01, starDist) * starBright;
    // Twinkle
    float twinkle = 0.7 + 0.3 * sin(ft * 2.0 + starHash * 50.0);
    skyCol += vec3(0.9, 0.85, 0.7) * starPoint * starField * twinkle;
    // Space mode: more prominent stars
    skyCol += vec3(0.8, 0.75, 0.9) * starPoint * starField * sSpace * 0.5;
  }

  // Below horizon: dark ground reflection
  skyCol = mix(skyCol, vec3(0.02, 0.015, 0.01), belowHorizon);

  return skyCol;
}

// ─── Heat shimmer UV distortion ───
vec2 hhShimmer(vec2 uv, float dist, float energy, float ft, float sJam) {
  // Shimmer increases near ground and with distance (mirage effect)
  float shimmerStr = energy * 0.006 * smoothstep(20.0, 5.0, dist);
  // Jam: mirage distortion cranked up
  shimmerStr *= (1.0 + sJam * 2.0);
  float wave1 = sin(uv.y * 80.0 + ft * 4.0) * shimmerStr;
  float wave2 = sin(uv.y * 140.0 + ft * 6.0 + 1.5) * shimmerStr * 0.5;
  float wave3 = sin(uv.x * 60.0 + ft * 3.0) * shimmerStr * 0.3;
  return vec2(wave1 + wave2, wave3 * 0.3);
}

// ─── Desert dust / atmospheric haze ───
vec3 hhDust(vec3 pos, vec3 rd, float energy, float ft) {
  float density = energy * 0.15;
  float dustNoise = fbm3(vec3(pos.xz * 0.05, ft * 0.03));
  dustNoise = max(dustNoise, 0.0);
  // Distance attenuation
  float distFade = exp(-length(pos) * 0.015);
  return vec3(0.4, 0.25, 0.12) * dustNoise * density * distFade;
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
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float beatSnp = clamp(uBeatSnap, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float triumphant = clamp(uSemanticTriumphant, 0.0, 1.0);

  // ─── Section types ───
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxV = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Dynamic time ───
  float ft = uDynamicTime * (0.08 + slowE * 0.06) * (1.0 + sJam * 0.3 - sSpace * 0.4);

  // ─── Road width: bass pulsing ───
  float roadW = 2.5 + bass * 0.3 + sin(ft * 0.2) * 0.1;

  // ─── Palette ───
  float h1 = uPalettePrimary;
  vec3 palCol1 = paletteHueColor(h1, 0.8, 0.9);
  float h2 = uPaletteSecondary;
  vec3 palCol2 = paletteHueColor(h2, 0.8, 0.9);

  // Desert-warm palette blend
  vec3 desertWarm = mix(vec3(0.7, 0.4, 0.2), vec3(0.9, 0.6, 0.3), tension);
  palCol1 = mix(palCol1, desertWarm, 0.3);

  // ─── Sun direction: low on horizon, slightly right ───
  float sunAngle = HH_PI * 0.02 + vocalP * 0.03; // just above horizon
  vec3 sunDir = normalize(vec3(0.3, sunAngle + 0.08, 1.0));

  // ─── Camera: traveling forward along the road ───
  float camSpeed = ft * 8.0;
  float camSway = sin(ft * 0.15) * 0.4 * (1.0 - sSpace * 0.5);
  float camBob = cos(ft * 0.22) * 0.05;

  vec3 ro = vec3(
    camSway,
    1.6 + camBob + drumOn * 0.15,
    camSpeed
  );

  // Look at vanishing point with slight sway
  vec3 lookAt = ro + vec3(
    sin(ft * 0.08) * 0.3,
    -0.1 + vocalP * 0.05,
    20.0
  );

  // ─── Camera matrix ───
  vec3 fw = normalize(lookAt - ro);
  vec3 rgt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 upd = cross(fw, rgt);
  float fov = 0.9 + energy * 0.1 + climaxV * 0.15;

  // Heat shimmer UV distortion before ray construction
  vec2 shimmerOffset = hhShimmer(uv, 10.0, energy, ft, sJam);
  vec2 shimmerP = pCoord + shimmerOffset;

  vec3 rd = normalize(shimmerP.x * rgt + shimmerP.y * upd + fov * fw);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  bool didHit = false;
  int stepCount = 0;

  for (int i = 0; i < HH_MAX_STEPS; i++) {
    vec3 pos = ro + rd * totalDist;
    float dist = hhMap(pos, bass, drumOn, roadW, climaxV);

    // Wire test (thin geometry — separate pass)
    float wireDist = hhWire(pos, roadW, 6.0);
    dist = min(dist, wireDist);

    if (dist < HH_SURF_DIST) {
      hitPos = pos;
      didHit = true;
      stepCount = i;
      break;
    }
    if (totalDist > HH_MAX_DIST) break;
    totalDist += dist * 0.7; // conservative stepping for thin features
    stepCount = i;
  }

  // ─── Sky as base ───
  vec3 col = hhSky(rd, tension, vocalP, energy, sChorus, sSpace, climaxV, ft, sunDir, palCol1, palCol2);

  if (didHit) {
    vec3 nrm = hhNormal(hitPos, bass, drumOn, roadW, climaxV);
    float dpth = clamp(totalDist / HH_MAX_DIST, 0.0, 1.0);

    // ─── Lighting ───
    vec3 lightDir = normalize(sunDir);
    float diff = max(dot(nrm, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, nrm), -rd), 0.0), 32.0 + energy * 48.0);
    float fres = pow(1.0 - max(dot(nrm, -rd), 0.0), 3.5);

    // Ambient occlusion
    float aoVal = hhAO(hitPos, nrm, bass, drumOn, roadW, climaxV);

    // ─── Material identification ───
    float isRoad = 1.0 - smoothstep(roadW - 0.1, roadW, abs(hitPos.x));
    isRoad *= smoothstep(0.02, -0.02, hitPos.y - 0.01);
    float isMarking = smoothstep(0.005, 0.0, hhRoadMarking(hitPos, roadW));
    float isPole = smoothstep(0.2, 0.0, length(vec2(
      abs(hitPos.x) - (roadW + 3.0),
      mod(hitPos.z + 10.0, 20.0) - 10.0
    )));
    float isWire = smoothstep(0.1, 0.0, hhWire(hitPos, roadW, 6.0));
    float isMesa = smoothstep(0.5, 0.0, abs(hitPos.x) - 10.0) * step(0.5, hitPos.y);

    // ─── Road material ───
    vec3 roadCol = vec3(0.04, 0.04, 0.045); // dark asphalt
    // Road texture: subtle noise
    float roadTex = snoise(vec3(hitPos.xz * 2.0, 0.0)) * 0.02;
    roadCol += roadTex;
    // Road marking: bright yellow
    vec3 markingCol = vec3(0.8, 0.7, 0.1);
    roadCol = mix(roadCol, markingCol, isMarking * 0.9);

    // ─── Desert ground material ───
    vec3 groundCol = vec3(0.15, 0.1, 0.06); // sandy desert
    float groundTex = fbm3(vec3(hitPos.xz * 0.5, 0.0));
    groundCol += vec3(0.06, 0.04, 0.02) * groundTex;
    // Palette-influenced sand
    groundCol = mix(groundCol, palCol1 * 0.08, 0.15);

    // ─── Mesa material ───
    vec3 mesaCol = vec3(0.25, 0.12, 0.06); // red rock
    float mesaTex = ridged4(hitPos * 0.3) * 0.3;
    float stratification = sin(hitPos.y * 3.0) * 0.5 + 0.5;
    mesaCol = mix(mesaCol, vec3(0.35, 0.18, 0.08), stratification * 0.4);
    mesaCol += vec3(0.05, 0.02, 0.01) * mesaTex;
    // Palette influence on mesas
    mesaCol = mix(mesaCol, palCol2 * 0.15, 0.2);

    // ─── Pole material ───
    vec3 poleCol = vec3(0.12, 0.1, 0.08); // weathered wood
    // Drum onset: pole flash
    poleCol += vec3(0.5, 0.35, 0.15) * drumOn * 0.4;

    // ─── Wire material ───
    vec3 wireCol = vec3(0.06, 0.06, 0.07);

    // ─── Composite material ───
    vec3 matCol = groundCol;
    matCol = mix(matCol, roadCol, isRoad);
    matCol = mix(matCol, mesaCol, isMesa);
    matCol = mix(matCol, poleCol, isPole);
    matCol = mix(matCol, wireCol, isWire);

    // ─── Apply lighting ───
    vec3 ambient = vec3(0.03, 0.025, 0.02);
    // Warm bounced light from sun
    float sunBounce = max(dot(nrm, vec3(0.0, 1.0, 0.0)), 0.0) * 0.15;
    vec3 litCol = matCol * (ambient + diff * 0.6 + sunBounce) * aoVal;

    // Specular: stronger on road (wet look) and wires
    float specStr = mix(0.15, 0.5, isRoad) + isWire * 0.6;
    vec3 specCol = mix(vec3(0.9, 0.8, 0.6), palCol1, 0.2);
    litCol += specCol * spec * specStr;

    // Fresnel rim lighting: silhouette glow from sun
    vec3 rimCol = mix(vec3(0.6, 0.35, 0.15), vec3(0.8, 0.3, 0.1), tension);
    litCol += rimCol * fres * 0.12 * (0.5 + vocalP * 0.5);

    // ─── Road reflections: wet road reflects sky near horizon ───
    if (isRoad > 0.3) {
      vec3 reflDir = reflect(rd, nrm);
      vec3 reflCol = hhSky(reflDir, tension, vocalP, energy, sChorus, sSpace, climaxV, ft, sunDir, palCol1, palCol2);
      float reflStr = fres * isRoad * 0.25 * (0.5 + energy * 0.5);
      litCol += reflCol * reflStr;
    }

    // ─── Distance fog: desert haze ───
    float fogDensity = 0.012 + energy * 0.005;
    float fogAmount = 1.0 - exp(-totalDist * fogDensity);
    vec3 fogCol = mix(vec3(0.3, 0.2, 0.1), vec3(0.5, 0.3, 0.15), smoothstep(0.0, 0.3, rd.y));
    // Fog tinted by sun
    fogCol = mix(fogCol, vec3(0.7, 0.4, 0.2) * (0.5 + vocalP * 0.5), pow(max(dot(rd, sunDir), 0.0), 4.0) * 0.4);

    col = mix(litCol, fogCol, fogAmount);

    // ─── Headlight flash on beat snap ───
    if (beatSnp > 0.01) {
      float headlightCone = smoothstep(0.3, 0.0, abs(hitPos.x)) * smoothstep(50.0, 5.0, hitPos.z - ro.z);
      col += vec3(0.9, 0.85, 0.7) * headlightCone * beatSnp * 0.15;
    }

    // ─── Atmospheric dust accumulation along ray ───
    vec3 dustCol = hhDust(hitPos, rd, energy, ft);
    col += dustCol * (1.0 - fogAmount);
  }

  // ─── Power line wires: thin overlay pass (add glow even if not hit) ───
  {
    float wireGlow = 0.0;
    for (int wg = 0; wg < 8; wg++) {
      float wgT = 2.0 + float(wg) * 4.0;
      if (wgT > totalDist && didHit) break;
      vec3 wgPos = ro + rd * wgT;
      float wDist = hhWire(wgPos, roadW, 6.0);
      wireGlow += smoothstep(0.15, 0.0, wDist) * 0.015 / (1.0 + wgT * 0.05);
    }
    col += vec3(0.3, 0.25, 0.2) * wireGlow;
  }

  // ─── Horizon glow: volumetric sunrise band ───
  {
    float horizonBand = exp(-abs(rd.y) * 15.0);
    float sunInfluence = pow(max(dot(rd, sunDir), 0.0), 2.0);
    vec3 horizonGlowCol = mix(
      vec3(0.4, 0.2, 0.08),
      vec3(0.8, 0.45, 0.15),
      sunInfluence
    );
    horizonGlowCol = mix(horizonGlowCol, palCol1 * 0.5, 0.15);
    float glowStr = (0.08 + vocalP * 0.12 + sChorus * 0.15 + climaxV * 0.1);
    col += horizonGlowCol * horizonBand * glowStr;
  }

  // ─── Mirage effect (jam section): false reflections near road ───
  if (sJam > 0.01) {
    float mirageZone = smoothstep(0.1, -0.1, rd.y) * smoothstep(-0.3, -0.1, rd.y);
    vec3 mirageCol = hhSky(vec3(rd.x, abs(rd.y) + 0.1, rd.z), tension, vocalP, energy, sChorus, sSpace, climaxV, ft, sunDir, palCol1, palCol2);
    col = mix(col, mirageCol * 0.6, mirageZone * sJam * 0.4);
  }

  // ─── Energy boost ───
  col *= 1.0 + energy * 0.2 + climaxV * 0.25;

  // ─── Beat snap headlight pulse (even when no hit — global brightness) ───
  col *= 1.0 + beatSnp * 0.08;

  // ─── Vignette: road-focused ───
  float vgVal = 1.0 - dot(pCoord * 0.3, pCoord * 0.3);
  col = mix(vec3(0.01, 0.008, 0.005), col, smoothstep(0.0, 1.0, vgVal));

  // ─── Icon emergence ───
  {
    float nf = snoise(vec3(pCoord * 2.0, uTime * 0.1));
    col += iconEmergence(pCoord, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(pCoord, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // ─── Darkness texture for quiet passages ───
  col += darknessTexture(uv, uTime, energy);

  // ─── Minimum brightness floor ───
  col = max(col, vec3(0.015, 0.01, 0.008));

  // ─── Post-processing ───
  col = applyPostProcess(col, uv, pCoord);

  gl_FragColor = vec4(col, 1.0);
}
`;
