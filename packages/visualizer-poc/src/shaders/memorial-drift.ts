/**
 * Memorial Drift — raymarched floating stone monoliths in fog.
 * Song: "He's Gone" — a eulogy. Solemn, beautiful, mournful.
 * Concept: sacred quiet space of remembrance. Candlelight volumes,
 * slow-drifting ash/petal particles, weathered stone in mist.
 *
 * Muted palette: slate, silver, soft gold candlelight. Stars above fog.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass            → monolith hover height
 *   uEnergy          → candle count/brightness, raymarch detail
 *   uDrumOnset       → candle flicker
 *   uVocalPresence   → warm fog glow
 *   uHarmonicTension → monolith tilt angle
 *   uSectionType     → jam=monoliths orbit, space=perfect stillness
 *   uClimaxPhase     → monoliths rise, light blazes
 *   uSlowEnergy      → drift speed
 *   uSemanticTender  → warmth boost
 *   uBeatSnap        → subtle candle pulse
 *   uMelodicPitch    → fog density vertical gradient
 *   uChordIndex      → candle hue shift
 *   uSpaceScore      → fog depth expansion
 *   uClimaxIntensity → climax brightness multiplier
 *   uStemVocalRms    → vocal warmth in fog color
 *   uDynamicRange    → monolith scale variation
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const memorialDriftVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "heavy",
  halationEnabled: false,
  bloomEnabled: true,
  bloomThresholdOffset: 0.10,
  caEnabled: false,
  lensDistortionEnabled: true,
  lightLeakEnabled: false,
  eraGradingEnabled: true,
  dofEnabled: true,
  beatPulseEnabled: false,
});

const mdNormalGLSL = buildRaymarchNormal("mdMap($P).x", { eps: 0.003, name: "mdNormal" });
const mdAOGLSL = buildRaymarchAO("mdMap($P).x", { steps: 5, stepBase: 0.0, stepScale: 0.05, weightDecay: 0.65, finalMult: 3.0, name: "mdAO" });
const mdDepthAlpha = buildDepthAlphaOutput("totalDist", "MD_MAX_DIST");

export const memorialDriftFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define MD_PI 3.14159265
#define MD_TAU 6.28318530
#define MD_MAX_STEPS 80
#define MD_MAX_DIST 40.0
#define MD_SURF_DIST 0.002
#define MD_MONOLITH_COUNT 7
#define MD_CANDLE_COUNT 5

// ─── Hash helpers ───
float mdHash(float n) { return fract(sin(n) * 43758.5453); }
float mdHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ─── SDF Primitives ───
float mdBoxSDF(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float mdSphereSDF(vec3 p, float r) {
  return length(p) - r;
}

float mdCylinderSDF(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// Smooth minimum for organic blending
float mdSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// 2D rotation matrix
mat2 mdRot2(float a) {
  float c = cos(a); float s = sin(a);
  return mat2(c, -s, s, c);
}

// ─── Scene parameters (set in main, read by SDF) ───
// Monolith transforms: positions, rotations, scales
// Using global-scope arrays for the SDF to read
vec3 mdMonolithPos[MD_MONOLITH_COUNT];
vec3 mdMonolithSize[MD_MONOLITH_COUNT];
float mdMonolithTilt[MD_MONOLITH_COUNT];
float mdMonolithRotY[MD_MONOLITH_COUNT];

vec3 mdCandlePos[MD_CANDLE_COUNT];
float mdCandleRadius[MD_CANDLE_COUNT];
float mdCandleBright[MD_CANDLE_COUNT];

// ─── Monolith SDF with weathered noise displacement ───
float mdMonolith(vec3 p, int idx) {
  // Apply monolith transform
  vec3 q = p - mdMonolithPos[idx];

  // Y-axis rotation
  float ry = mdMonolithRotY[idx];
  q.xz = mdRot2(ry) * q.xz;

  // Tilt around X-axis (harmonic tension)
  float tlt = mdMonolithTilt[idx];
  q.yz = mdRot2(tlt) * q.yz;

  // Base box SDF
  float d = mdBoxSDF(q, mdMonolithSize[idx]);

  // Weathering: noise displacement on surface
  float weathering = fbm3(q * 2.5 + 17.0) * 0.06;
  weathering += fbm3(q * 5.0 + 31.0) * 0.02;
  d += weathering;

  // Chamfered edges: soften corners
  float edgeSoftness = 0.015;
  d -= edgeSoftness;

  return d;
}

// ─── Candle SDF (sphere on monolith surface) ───
float mdCandle(vec3 p, int idx) {
  vec3 q = p - mdCandlePos[idx];
  return mdSphereSDF(q, mdCandleRadius[idx]);
}

// ─── Candle flame SDF (elongated soft sphere above candle) ───
float mdFlame(vec3 p, int idx, float time, float drumFlicker) {
  vec3 flamePos = mdCandlePos[idx] + vec3(0.0, mdCandleRadius[idx] * 2.5, 0.0);

  // Flicker displacement
  float flicker = sin(time * 8.0 + float(idx) * 2.7) * 0.015;
  flicker += sin(time * 13.0 + float(idx) * 4.1) * 0.008;
  flicker += drumFlicker * 0.04 * sin(time * 20.0 + float(idx) * 1.3);
  flamePos.x += flicker;
  flamePos.z += flicker * 0.7;

  vec3 q = p - flamePos;
  // Elongate vertically
  q.y *= 0.5;
  return mdSphereSDF(q, mdCandleRadius[idx] * 1.2) - 0.005;
}

// ─── Ground plane ───
float mdGround(vec3 p) {
  return p.y + 2.5;
}

// ─── Full scene SDF ───
// Returns: x=distance, y=material ID (0=ground, 1=monolith, 2=candle, 3=flame)
vec2 mdMap(vec3 p) {
  float d = MD_MAX_DIST;
  float matId = 0.0;

  // Ground
  float gnd = mdGround(p);
  d = gnd;

  // Monoliths
  for (int i = 0; i < MD_MONOLITH_COUNT; i++) {
    float md = mdMonolith(p, i);
    if (md < d) {
      d = md;
      matId = 1.0;
    }
  }

  // Candles
  for (int i = 0; i < MD_CANDLE_COUNT; i++) {
    if (mdCandleBright[i] < 0.01) continue;
    float cd = mdCandle(p, i);
    if (cd < d) {
      d = cd;
      matId = 2.0;
    }
  }

  return vec2(d, matId);
}

// ─── Scene SDF including flames (separate for emission pass) ───
vec2 mdMapWithFlames(vec3 p, float time, float drumFlicker) {
  vec2 scene = mdMap(p);

  for (int i = 0; i < MD_CANDLE_COUNT; i++) {
    if (mdCandleBright[i] < 0.01) continue;
    float fd = mdFlame(p, i, time, drumFlicker);
    if (fd < scene.x) {
      scene = vec2(fd, 3.0);
    }
  }

  return scene;
}

// ─── Normal + AO (shared raymarching utilities) ───
${mdNormalGLSL}
${mdAOGLSL}

// ─── Soft shadow (toward candlelight) ───
float mdSoftShadow(vec3 ro, vec3 rd, float mint, float maxt) {
  float res = 1.0;
  float t = mint;
  for (int i = 0; i < 24; i++) {
    if (t > maxt) break;
    float d = mdMap(ro + rd * t).x;
    res = min(res, 8.0 * d / t);
    if (d < 0.001) return 0.0;
    t += max(d, 0.02);
  }
  return clamp(res, 0.0, 1.0);
}

// ─── Volumetric fog with candlelight scattering ───
vec3 mdVolumetricFog(vec3 ro, vec3 rd, float maxT, float time,
                     float vocalWarm, float energy, float spaceExpand,
                     float tenderBoost, vec3 fogBaseColor) {
  vec3 fogAccum = vec3(0.0);
  float fogAlpha = 0.0;

  int fogSteps = 24 + int(energy * 12.0);
  float fogStepSize = min(maxT, 20.0) / float(fogSteps);

  for (int i = 0; i < 36; i++) {
    if (i >= fogSteps) break;
    float t = float(i) * fogStepSize + fogStepSize * 0.5;
    vec3 pos = ro + rd * t;

    // Height-based density: thickest near ground, thins with altitude
    float heightDensity = exp(-max(pos.y + 1.0, 0.0) * 0.25);
    // Noise variation
    float noiseDensity = fbm3(pos * 0.3 + vec3(time * 0.02, 0.0, time * 0.015));
    noiseDensity = noiseDensity * 0.5 + 0.5;

    float density = heightDensity * noiseDensity * (0.03 + spaceExpand * 0.01);

    if (density > 0.001) {
      float alpha = density * (1.0 - fogAlpha);

      // Base fog color: cool slate with vocal warmth
      vec3 fogCol = fogBaseColor;
      fogCol += vec3(0.15, 0.08, 0.02) * vocalWarm; // warm glow from vocals
      fogCol += vec3(0.08, 0.05, 0.02) * tenderBoost; // tender semantic warmth

      // Candlelight scattering: each active candle adds warm light to fog
      for (int c = 0; c < MD_CANDLE_COUNT; c++) {
        if (mdCandleBright[c] < 0.01) continue;
        vec3 toCandle = mdCandlePos[c] - pos;
        float candleDist = length(toCandle);
        float scatter = exp(-candleDist * 0.5) * mdCandleBright[c];
        // Warm candlelight color
        vec3 candleCol = vec3(1.0, 0.75, 0.35) * scatter * 0.4;
        fogCol += candleCol;
      }

      // Depth fade
      float depthFade = exp(-t * 0.08);
      fogAccum += fogCol * alpha * depthFade;
      fogAlpha += alpha;
    }

    if (fogAlpha > 0.95) break;
  }

  return fogAccum;
}

// ─── Petal/ash particle field ───
// Returns soft glow from drifting particles
float mdParticles(vec3 p, float time, float slowDrift) {
  float particles = 0.0;

  // 3 layers at different scales/speeds
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    vec3 q = p;
    // Different drift per layer
    q.x += time * (0.03 + fl * 0.01) * slowDrift;
    q.y += time * (0.02 + fl * 0.005) * slowDrift;
    q.z += sin(time * 0.1 + fl * 2.0) * 0.3;

    // Scale per layer
    q *= 2.0 + fl * 1.5;

    // Grid-based particle placement
    vec3 cell = floor(q);
    vec3 fq = fract(q) - 0.5;

    float cellHash = mdHash(dot(cell, vec3(17.1, 31.7, 43.3 + fl * 7.0)));

    // Only some cells have particles
    if (cellHash > 0.65) {
      // Offset within cell
      vec3 offset = vec3(
        mdHash(cellHash * 127.1) - 0.5,
        mdHash(cellHash * 269.3) - 0.5,
        mdHash(cellHash * 419.7) - 0.5
      ) * 0.3;
      vec3 particlePos = fq - offset;

      float dist = length(particlePos);
      float size = 0.02 + cellHash * 0.015;
      float glow = smoothstep(size, size * 0.3, dist);
      // Twinkle
      glow *= 0.5 + 0.5 * sin(time * (2.0 + cellHash * 3.0) + cellHash * MD_TAU);
      particles += glow * (0.3 + fl * 0.1);
    }
  }

  return clamp(particles, 0.0, 1.0);
}

// ─── Starfield above fog ───
float mdStars(vec3 rd) {
  // Only above horizon
  if (rd.y < 0.05) return 0.0;

  vec2 starUv = rd.xz / (rd.y + 0.001) * 4.0;
  vec2 cell = floor(starUv);
  vec2 fq = fract(starUv) - 0.5;

  float h = mdHash2(cell);
  if (h < 0.92) return 0.0; // sparse stars

  vec2 offset = vec2(mdHash2(cell + 100.0), mdHash2(cell + 200.0)) * 0.6 - 0.3;
  float dist = length(fq - offset);
  float brightness = smoothstep(0.03, 0.0, dist) * (0.4 + h * 0.6);

  // Twinkle
  brightness *= 0.7 + 0.3 * sin(h * 100.0 + cell.x * 13.0);

  // Fade near horizon
  brightness *= smoothstep(0.05, 0.25, rd.y);

  return brightness;
}

// ─── Fresnel term ───
float mdFresnel(vec3 viewDir, vec3 normal, float power) {
  return pow(1.0 - max(dot(viewDir, normal), 0.0), power);
}


void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float bass = clamp(uBass, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tender = clamp(uSemanticTender, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float vocalRms = clamp(uStemVocalRms, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);

  // === CLIMAX ===
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // === TIME ===
  float driftSpeed = (0.03 + slowE * 0.02) * mix(1.0, 1.6, sJam) * mix(1.0, 0.1, sSpace);
  float flowTime = uDynamicTime * driftSpeed;

  // ═══════════════════════════════════════════════
  // MONOLITH PLACEMENT
  // ═══════════════════════════════════════════════

  // Base hover height rises with bass; climax lifts all
  float baseHover = -0.5 + bass * 0.8 + climaxBoost * 1.5;

  for (int i = 0; i < MD_MONOLITH_COUNT; i++) {
    float fi = float(i);
    float seed = mdHash(fi * 7.13 + 3.0);

    // Arrange in a loose arc
    float angle = (fi / float(MD_MONOLITH_COUNT)) * MD_TAU * 0.6 - 0.5;
    // Jam: monoliths orbit slowly
    float orbitAngle = angle + flowTime * mix(0.0, 1.0, sJam) * (0.3 + seed * 0.2);
    // Space: freeze
    orbitAngle = mix(orbitAngle, angle, sSpace);

    float radius = 3.5 + seed * 2.5;
    float xPos = sin(orbitAngle) * radius;
    float zPos = cos(orbitAngle) * radius - 4.0; // offset in front of camera

    // Individual hover with slow bob
    float hover = baseHover + sin(flowTime * (0.5 + seed * 0.3) + fi * 1.7) * 0.3;
    hover += seed * 0.8 - 0.4;

    mdMonolithPos[i] = vec3(xPos, hover, zPos);

    // Size: tall rectangles with dynamic range variation
    float heightScale = 0.8 + seed * 1.2 + dynRange * 0.3;
    float widthScale = 0.25 + seed * 0.2;
    mdMonolithSize[i] = vec3(widthScale, heightScale, widthScale * 0.8);

    // Tilt from harmonic tension
    mdMonolithTilt[i] = tension * (seed - 0.5) * 0.25;

    // Slow Y rotation
    mdMonolithRotY[i] = flowTime * (0.1 + seed * 0.1) * mix(1.0, 0.0, sSpace);
  }

  // ═══════════════════════════════════════════════
  // CANDLE PLACEMENT
  // ═══════════════════════════════════════════════

  // Number of visible candles scales with energy
  int visibleCandles = 2 + int(energy * 3.0);

  for (int i = 0; i < MD_CANDLE_COUNT; i++) {
    float fi = float(i);
    float seed = mdHash(fi * 11.3 + 17.0);

    if (i < visibleCandles) {
      // Place candles on top of specific monoliths
      int monIdx = int(mod(fi * 2.0 + 1.0, float(MD_MONOLITH_COUNT)));
      vec3 monPos = mdMonolithPos[monIdx];
      vec3 monSize = mdMonolithSize[monIdx];

      // On top surface, slightly offset
      vec3 candleOffset = vec3(
        (seed - 0.5) * monSize.x * 0.6,
        monSize.y + 0.06,
        (mdHash(seed * 31.0) - 0.5) * monSize.z * 0.6
      );

      mdCandlePos[i] = monPos + candleOffset;
      mdCandleRadius[i] = 0.03 + seed * 0.02;

      // Brightness: energy + beat + flicker from drums
      float bright = 0.5 + energy * 0.5;
      bright += beatSnap * 0.15;
      bright *= 1.0 + climaxBoost * 0.8; // blazing at climax
      bright *= 1.0 + tender * 0.2; // warmer when tender

      // Drum onset flicker: momentary brightness spike
      bright += drumOnset * 0.4 * sin(uTime * 25.0 + fi * 3.7);

      mdCandleBright[i] = clamp(bright, 0.0, 2.0);
    } else {
      // Inactive candle
      mdCandlePos[i] = vec3(0.0, -100.0, 0.0);
      mdCandleRadius[i] = 0.0;
      mdCandleBright[i] = 0.0;
    }
  }

  // ═══════════════════════════════════════════════
  // RAY SETUP — cinematic camera choreography
  // ═══════════════════════════════════════════════

  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Hold progress drives camera: arrive at vigil → walk among monoliths → ascend above
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);
  float energy2 = clamp(uEnergy, 0.0, 1.0);

  // Phase 1 (0.0-0.3): Ground-level approach — walking toward the memorial
  // Phase 2 (0.3-0.7): Drift among the monoliths — lateral glide, eye-level
  // Phase 3 (0.7-1.0): Slow crane up — reveals the full field from above
  float arrive = smoothstep(0.0, 0.3, holdP);
  float explore = smoothstep(0.3, 0.7, holdP);
  float ascend = smoothstep(0.7, 1.0, holdP);

  float camTime = flowTime * (0.5 + energy2 * 0.3);
  float camTimeMul = mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace);
  camTime *= camTimeMul;

  // Lateral drift: slow walk through the memorial field
  float walkX = sin(camTime * 0.4) * (1.5 + arrive * 2.0);
  float walkZ = camTime * 0.8 - 4.0; // forward progression

  // Height: eye-level → ascending crane
  float camY = mix(-0.5, 0.2, arrive) + ascend * 4.0;
  // Space: nearly still, contemplative hover
  walkX *= mix(1.0, 0.15, sSpace);
  // Jam: wider orbit
  walkX += sJam * sin(camTime * 0.8) * 1.0;

  ro = vec3(walkX, camY, walkZ);

  // Look target: center of the field, rises with crane
  vec3 lookAt = vec3(
    sin(camTime * 0.2) * 0.3 * (1.0 - sSpace * 0.8),
    mix(0.0, 0.5, arrive) + ascend * 0.5,
    walkZ + 3.0 + arrive * 2.0
  );
  vec3 camFwd = normalize(lookAt - ro);
  vec3 camRt = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
  vec3 camUpVec = cross(camRt, camFwd);
  float camFov = 0.85 + energy2 * 0.1 - sSpace * 0.1;
  vec2 sp = (uv - 0.5) * aspect;
  rd = normalize(camFwd * camFov + camRt * sp.x + camUpVec * sp.y);

  // ═══════════════════════════════════════════════
  // RAYMARCH
  // ═══════════════════════════════════════════════

  float totalDist = 0.0;
  vec2 marchResult = vec2(MD_MAX_DIST, 0.0);
  bool ht = false;

  for (int i = 0; i < MD_MAX_STEPS; i++) {
    vec3 pos = ro + rd * totalDist;
    vec2 res = mdMapWithFlames(pos, uDynamicTime, drumOnset);
    if (res.x < MD_SURF_DIST) {
      marchResult = vec2(totalDist, res.y);
      ht = true;
      break;
    }
    if (totalDist > MD_MAX_DIST) break;
    totalDist += res.x * 0.8; // slight overshoot protection
  }

  // ═══════════════════════════════════════════════
  // SHADING
  // ═══════════════════════════════════════════════

  // Palette: muted memorial tones — blue-gray melancholy, cold silver, one warm candle
  vec3 palTint = paletteHueColor(uPalettePrimary, 0.15, 0.4); // very desaturated palette influence
  vec3 slatePrimary = mix(vec3(0.30, 0.33, 0.42), palTint * 0.3, 0.12); // cool blue-slate
  vec3 silverHighlight = vec3(0.60, 0.65, 0.75); // cold silver with ice-blue tint
  vec3 candleGold = vec3(1.0, 0.78, 0.35); // warm gold — the only warmth
  vec3 ashGray = vec3(0.45, 0.44, 0.47); // ash with faint blue undertone

  // Chord hue subtly tints only the candle (the sole warm element)
  candleGold = mix(candleGold, hsv2rgb(vec3(0.08 + chordHue, 0.7, 0.9)), 0.2);

  // Tender adds restrained warmth — keeps overall cool melancholy
  slatePrimary += vec3(0.02, 0.01, 0.0) * tender;
  silverHighlight += vec3(0.03, 0.02, 0.01) * tender;
  // Push shadows toward deep navy/purple for somber depth
  slatePrimary += vec3(-0.02, -0.01, 0.03);

  vec3 col = vec3(0.0);
  float hitDist = marchResult.x;

  if (ht) {
    vec3 hitPos = ro + rd * hitDist;
    float matId = marchResult.y;

    if (matId < 0.5) {
      // ─── Ground: dark stone floor ───
      vec3 n = vec3(0.0, 1.0, 0.0);
      float aoVal = mdAO(hitPos, n);

      // Ground texture
      float groundNoise = fbm3(vec3(hitPos.xz * 1.5 + 3.0, 0.0)) * 0.5 + 0.5;
      vec3 groundCol = mix(vec3(0.06, 0.06, 0.07), vec3(0.12, 0.11, 0.10), groundNoise);

      // Candlelight on ground
      vec3 candleLight = vec3(0.0);
      for (int c = 0; c < MD_CANDLE_COUNT; c++) {
        if (mdCandleBright[c] < 0.01) continue;
        vec3 toCandle = mdCandlePos[c] - hitPos;
        float dist = length(toCandle);
        vec3 lDir = toCandle / dist;
        float ndotl = max(dot(n, lDir), 0.0);
        float atten = 1.0 / (1.0 + dist * dist * 0.5);
        float shadow = mdSoftShadow(hitPos + n * 0.01, lDir, 0.05, dist);
        candleLight += candleGold * mdCandleBright[c] * ndotl * atten * shadow;
      }

      col = groundCol * (0.08 + aoVal * 0.15) + candleLight * 0.6;

    } else if (matId < 1.5) {
      // ─── Monolith: weathered stone ───
      vec3 n = mdNormal(hitPos);
      float aoVal = mdAO(hitPos, n);

      // Stone texture: layered noise
      float stoneNoise = fbm(hitPos * 3.0) * 0.5 + 0.5;
      float stoneDetail = fbm3(hitPos * 8.0 + 7.0) * 0.3 + 0.5;
      vec3 stoneCol = mix(slatePrimary * 0.6, ashGray * 0.5, stoneNoise);
      stoneCol *= 0.7 + stoneDetail * 0.3;

      // Fresnel rim
      float fresnel = mdFresnel(-rd, n, 3.0);
      vec3 rimCol = silverHighlight * fresnel * 0.35;

      // Candlelight on monolith
      vec3 candleLight = vec3(0.0);
      for (int c = 0; c < MD_CANDLE_COUNT; c++) {
        if (mdCandleBright[c] < 0.01) continue;
        vec3 toCandle = mdCandlePos[c] - hitPos;
        float dist = length(toCandle);
        vec3 lDir = toCandle / dist;
        float ndotl = max(dot(n, lDir), 0.0);
        float atten = 1.0 / (1.0 + dist * dist * 0.3);
        float shadow = mdSoftShadow(hitPos + n * 0.01, lDir, 0.05, dist);
        candleLight += candleGold * mdCandleBright[c] * ndotl * atten * shadow;
      }

      // Specular highlight from candlelight
      vec3 specAccum = vec3(0.0);
      for (int c = 0; c < MD_CANDLE_COUNT; c++) {
        if (mdCandleBright[c] < 0.01) continue;
        vec3 toCandle = normalize(mdCandlePos[c] - hitPos);
        vec3 halfDir = normalize(toCandle - rd);
        float spec = pow(max(dot(n, halfDir), 0.0), 32.0);
        specAccum += candleGold * spec * mdCandleBright[c] * 0.15;
      }

      // Ambient: very dim directional from above
      float ambientUp = max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0) * 0.06;
      vec3 ambient = silverHighlight * ambientUp;

      col = stoneCol * (ambient + aoVal * 0.1) + candleLight * 0.5 + rimCol + specAccum;

      // Climax: stone glows subtly
      col += slatePrimary * climaxBoost * 0.15;

    } else if (matId < 2.5) {
      // ─── Candle body: warm wax ───
      vec3 n = mdNormal(hitPos);
      vec3 waxCol = vec3(0.85, 0.80, 0.65);
      float fresnel = mdFresnel(-rd, n, 2.0);
      col = waxCol * 0.4 + candleGold * 0.3 + vec3(fresnel * 0.2);

    } else {
      // ─── Flame: bright emission ───
      // Pure emissive gold-white
      float flameIntensity = 1.5 + energy * 0.5 + climaxBoost * 1.0;
      col = mix(candleGold, vec3(1.0, 0.95, 0.8), 0.5) * flameIntensity;
      // Hot white core
      col += vec3(0.5, 0.4, 0.2) * flameIntensity;
    }

    // Distance fog on solid surfaces
    float fogAmount = 1.0 - exp(-hitDist * (0.06 - spaceScore * 0.02));
    vec3 fogCol = mix(vec3(0.08, 0.08, 0.10), vec3(0.12, 0.10, 0.08), vocalPres);
    col = mix(col, fogCol, fogAmount);

  } else {
    // ─── Background: deep memorial twilight + stars ───
    // Was vec3(0.05) → vec3(0.02) which rendered as essentially pure black on
    // most displays. Lifted to a visible deep blue twilight tone with a real
    // warm horizon glow so the scene reads as a memorial at dusk.
    float skyGrad = smoothstep(-0.3, 0.6, rd.y);
    vec3 skyHigh = vec3(0.04, 0.05, 0.10);
    vec3 skyLow  = mix(vec3(0.18, 0.12, 0.08), vec3(0.32, 0.18, 0.10), vocalPres);
    vec3 skyColor = mix(skyLow, skyHigh, skyGrad);

    // Stars
    float stars = mdStars(rd);
    skyColor += vec3(0.85, 0.88, 1.0) * stars * 1.2;

    // Wide horizon glow that warms the lower half of the frame
    float horizonGlow = exp(-max(0.0, rd.y) * 3.0);
    vec3 horizonCol = mix(vec3(0.20, 0.13, 0.08), vec3(0.42, 0.22, 0.10), vocalPres + tender * 0.3);
    skyColor += horizonCol * horizonGlow * 0.55;

    // Faint distant moon-glow to anchor the night sky
    vec3 moonDir = normalize(vec3(0.3, 0.45, 0.85));
    float moon = pow(max(dot(rd, moonDir), 0.0), 32.0);
    skyColor += vec3(0.55, 0.55, 0.65) * moon * 0.7;

    col = skyColor;
    hitDist = MD_MAX_DIST;
  }

  // ═══════════════════════════════════════════════
  // VOLUMETRIC FOG PASS
  // ═══════════════════════════════════════════════

  vec3 fogBaseColor = mix(vec3(0.06, 0.06, 0.08), vec3(0.10, 0.08, 0.06), vocalPres + tender * 0.3);
  vec3 fog = mdVolumetricFog(ro, rd, hitDist, uDynamicTime,
                              vocalPres, energy, spaceScore, tender, fogBaseColor);
  col += fog;

  // ═══════════════════════════════════════════════
  // PETAL / ASH PARTICLES
  // ═══════════════════════════════════════════════

  // Evaluate particles along ray at a few depth samples
  float particleAccum = 0.0;
  for (int i = 0; i < 4; i++) {
    float t = 2.0 + float(i) * 3.0;
    if (t > hitDist) break;
    vec3 samplePos = ro + rd * t;
    float particleVal = mdParticles(samplePos, uDynamicTime, 0.5 + slowE);
    particleAccum += particleVal * exp(-t * 0.1) * 0.25;
  }

  // Particle color: mix of ash gray and warm petal
  vec3 particleColor = mix(ashGray * 0.7, candleGold * 0.5, 0.3 + tender * 0.2);
  col += particleColor * particleAccum;

  // ═══════════════════════════════════════════════
  // CANDLELIGHT GLOW HALOS
  // ═══════════════════════════════════════════════

  // Screen-space glow around each candle
  for (int c = 0; c < MD_CANDLE_COUNT; c++) {
    if (mdCandleBright[c] < 0.01) continue;

    // Project candle position to screen
    vec3 camFwd = normalize(uCamTarget - uCamPos);
    vec3 camRgt = normalize(cross(camFwd, vec3(0.0, 1.0, 0.0)));
    vec3 camUpd = cross(camRgt, camFwd);

    vec3 toCandle = mdCandlePos[c] - uCamPos;
    float zDist = dot(toCandle, camFwd);
    if (zDist < 0.1) continue; // behind camera

    float fovScale = tan(radians(uCamFov) * 0.5);
    vec2 screenCandle = vec2(
      dot(toCandle, camRgt) / (zDist * fovScale * aspect.x),
      dot(toCandle, camUpd) / (zDist * fovScale)
    );

    float dist = length(p - screenCandle);
    float haloSize = 0.15 + mdCandleBright[c] * 0.1;

    // Only show halo if candle is not occluded (rough depth test)
    if (hitDist > zDist - 0.5 || !ht) {
      float halo = exp(-dist * dist / (haloSize * haloSize)) * mdCandleBright[c] * 0.25;
      col += candleGold * halo;
    }
  }

  // ═══════════════════════════════════════════════
  // GLOBAL MODULATIONS
  // ═══════════════════════════════════════════════

  // Climax: overall brightness lift
  col *= 1.0 + climaxBoost * 0.25;

  // Beat pulse: very subtle for this solemn shader
  col *= 1.0 + beatSnap * 0.06;

  // Vocal RMS warms overall tone slightly
  col = mix(col, col * vec3(1.04, 1.0, 0.96), vocalRms * 0.3);

  // ═══════════════════════════════════════════════
  // DEAD ICONOGRAPHY
  // ═══════════════════════════════════════════════

  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, slatePrimary, candleGold, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, slatePrimary, candleGold, _nf, uSectionIndex);

  // ═══════════════════════════════════════════════
  // POST PROCESS
  // ═══════════════════════════════════════════════

  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  // Lifted blacks: memorial scenes should never go pure black. Previously
  // floor was 0.025 which was barely above true black. Lifted to ~0.10 so
  // even the dimmest pixels show as deep visible twilight rather than void.
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.5, isBuild * clamp(uClimaxIntensity, 0.0, 1.0));
  col = max(col, vec3(0.09, 0.07, 0.10) * liftMult);

  gl_FragColor = vec4(col, 1.0);
  ${mdDepthAlpha}
}
`;
