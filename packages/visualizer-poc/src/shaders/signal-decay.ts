/**
 * Signal Decay — raymarched 3D radio telescope array in deep space.
 *
 * Massive parabolic dish antennas as SDF geometry, receiving signals from the cosmos.
 * Signals manifest as volumetric wave patterns traveling between dishes.
 * Static/noise as volumetric particle interference. Signal degrades over distance.
 *
 * Audio reactivity:
 *   uBass              -> signal strength / wave amplitude
 *   uEnergy            -> dish count / signal clarity
 *   uDrumOnset         -> signal burst reception
 *   uVocalPresence     -> warm signal glow
 *   uHarmonicTension   -> signal-to-noise ratio (high tension = more noise)
 *   uSectionType       -> jam=multiple signals crossing, space=silence/searching,
 *                          chorus=strong clear signal
 *   uClimaxPhase       -> massive signal from deep space floods all dishes
 *   uSlowEnergy        -> dish rotation speed
 *   uMelodicPitch      -> signal frequency / wave spacing
 *   uBeatStability     -> dish tracking stability
 *   uChordIndex        -> signal color hue
 *   uTimbralBrightness -> signal brightness / emission intensity
 *   uSpaceScore        -> ambient starfield density
 *   uImprovisationScore -> signal scatter / interference patterns
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const signalDecayVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const sd2NormalGLSL = buildRaymarchNormal("sd2Map($P, energy, bass, trackStability, flowTime, dishCount).x", { eps: 0.002, name: "sd2CalcNormal" });
const sd2AOGLSL = buildRaymarchAO("sd2Map($P, energy, bass, trackStability, flowTime, dishCount).x", { steps: 4, stepBase: -0.10, stepScale: 0.12, weightDecay: 0.7, finalMult: 3.0, name: "sd2CalcOcclusion" });

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  bloomThresholdOffset: -0.1,
  halationEnabled: true,
  caEnabled: true,
  lensDistortionEnabled: true,
  dofEnabled: true,
});

export const signalDecayFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 60.0
#define SURF_DIST 0.005

// ─── Hash helpers ───
float sd2Hash(float n) {
  return fract(sin(n) * 43758.5453);
}

float sd2Hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 sd2Hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}

// ─── SDF Primitives ───

// Parabolic dish: revolution of y = k*x^2 around Y axis
// Returns distance to the paraboloid shell
float sd2Paraboloid(vec3 p, float radius, float depth) {
  // Cylindrical coords
  float r = length(p.xz);
  // Parabola: y = (depth / radius^2) * r^2
  float k = depth / (radius * radius);
  float parabolaY = k * r * r;
  // Distance to parabola surface
  float dy = p.y - parabolaY;
  // Shell thickness
  float shell = abs(dy) - 0.04;
  // Clamp to dish radius
  float rimCut = r - radius;
  return max(shell, rimCut);
}

// Full dish antenna with support struts and base
float sd2Dish(vec3 p, float scale) {
  vec3 lp = p / scale;
  float dish = sd2Paraboloid(lp, 1.2, 0.5);

  // Feed horn at focal point (small sphere on a thin cylinder)
  float focalY = 1.2;
  float feedHorn = length(lp - vec3(0.0, focalY, 0.0)) - 0.08;

  // Support struts: 3 thin cylinders from dish rim to feed horn
  float struts = 1e10;
  for (int i = 0; i < 3; i++) {
    float angle = float(i) * TAU / 3.0;
    vec3 rimPt = vec3(cos(angle) * 1.0, 0.5, sin(angle) * 1.0);
    vec3 focalPt = vec3(0.0, focalY, 0.0);
    // Line segment SDF
    vec3 ba = focalPt - rimPt;
    vec3 pa = lp - rimPt;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float strutDist = length(pa - ba * h) - 0.02;
    struts = min(struts, strutDist);
  }

  // Pedestal: vertical cylinder below dish
  float pedR = length(lp.xz) - 0.12;
  float pedH = max(-lp.y, lp.y + 2.0) - 2.0;
  float pedestal = max(pedR, pedH);

  // Base plate: flat cylinder
  float baseR = length(lp.xz) - 0.5;
  float baseH = abs(lp.y + 2.0) - 0.05;
  float basePlate = max(baseR, baseH);

  float d = min(dish, min(feedHorn, min(struts, min(pedestal, basePlate))));
  return d * scale;
}

// Volumetric signal wave: returns density of signal energy at point
float sd2SignalWave(vec3 p, vec3 srcPos, vec3 dstPos, float freq, float amplitude,
                    float timeOffset, float decayRate) {
  // Direction vector between dishes
  vec3 axis = dstPos - srcPos;
  float axisLen = length(axis);
  vec3 axisDir = axis / max(axisLen, 0.001);

  // Project point onto axis
  vec3 toP = p - srcPos;
  float proj = dot(toP, axisDir);
  float projClamped = clamp(proj, 0.0, axisLen);

  // Radial distance from axis
  vec3 closestOnAxis = srcPos + axisDir * projClamped;
  float radialDist = length(p - closestOnAxis);

  // Wave pattern along axis
  float normalizedProj = proj / max(axisLen, 0.001);
  float wave = sin(normalizedProj * freq * TAU + timeOffset) * amplitude;

  // Signal strength decays with distance from source
  float decay = exp(-normalizedProj * decayRate);

  // Radial falloff: signal is a tube with wave modulation
  float tubeRadius = 0.15 + wave * 0.12 * decay;
  float density = smoothstep(tubeRadius + 0.15, tubeRadius - 0.05, radialDist);

  // Fade at endpoints
  float endFade = smoothstep(0.0, 0.08, normalizedProj) * smoothstep(1.0, 0.92, normalizedProj);

  return density * decay * endFade;
}

// Static / noise interference volume
float sd2Interference(vec3 p, float noiseTime, float intensity) {
  float n = fbm3(vec3(p * 3.0 + noiseTime * 0.3));
  float n2 = snoise(vec3(p * 8.0 + noiseTime * 0.7));
  float sparkle = step(0.85, abs(n2)) * intensity;
  return (n * 0.3 + sparkle) * intensity;
}

// ─── Scene Map ───

// Dish positions (up to 5 dishes based on energy)
vec3 sd2DishPos(int idx) {
  if (idx == 0) return vec3(0.0, 0.0, 0.0);
  if (idx == 1) return vec3(-6.0, -0.3, 2.0);
  if (idx == 2) return vec3(5.5, 0.2, -1.5);
  if (idx == 3) return vec3(-3.0, -0.1, -5.0);
  return vec3(4.0, 0.1, 5.0);
}

// Dish rotation: tilt angle based on tracking
vec3 sd2RotateDish(vec3 p, float tiltX, float tiltZ) {
  float cx = cos(tiltX); float sx = sin(tiltX);
  float cz = cos(tiltZ); float sz = sin(tiltZ);
  // Rotate around X then Z
  vec3 q = p;
  q.yz = vec2(cx * q.y - sx * q.z, sx * q.y + cx * q.z);
  q.xy = vec2(cz * q.x - sz * q.y, sz * q.x + cz * q.y);
  return q;
}

// Returns vec2(distance, materialID)
// materialID: 0=dish metal, 1=ground plane, 2=nothing
vec2 sd2Map(vec3 p, float energy, float bass, float trackStability,
            float flowTime, int dishCount) {
  float d = MAX_DIST;
  float matID = 0.0;

  // Ground plane: vast flat desert/tarmac
  float ground = p.y + 2.2;
  if (ground < d) {
    d = ground;
    matID = 1.0;
  }

  // Dishes
  for (int i = 0; i < 5; i++) {
    if (i >= dishCount) break;
    vec3 dishPos = sd2DishPos(i);
    vec3 lp = p - dishPos;

    // Dish tilts toward the sky, tracking signal
    float trackAngle = -0.4 + sin(flowTime * 0.12 + float(i) * 1.5) * 0.15 * (1.0 - trackStability);
    float trackSway = sin(flowTime * 0.08 + float(i) * 2.7) * 0.1 * (1.0 - trackStability);
    lp = sd2RotateDish(lp, trackAngle, trackSway);

    float dish = sd2Dish(lp, 1.0 + float(i == 0) * 0.3); // central dish is larger
    if (dish < d) {
      d = dish;
      matID = 0.0;
    }
  }

  return vec2(d, matID);
}

// ─── Starfield ───
vec3 sd2Starfield(vec3 rd, float spaceScore) {
  vec3 stars = vec3(0.0);
  // Layer 1: dense small stars
  vec3 cell = floor(rd * 80.0);
  vec3 frac = fract(rd * 80.0) - 0.5;
  float starDist = length(frac);
  float starBright = smoothstep(0.08, 0.0, starDist) * sd2Hash(dot(cell, vec3(113.1, 47.2, 29.3)));
  starBright *= step(0.7, sd2Hash(dot(cell, vec3(71.1, 33.7, 91.2)))); // sparse
  stars += vec3(0.9, 0.92, 1.0) * starBright * 2.0;

  // Layer 2: bright landmark stars with color
  vec3 cell2 = floor(rd * 30.0);
  vec3 frac2 = fract(rd * 30.0) - 0.5;
  float star2Dist = length(frac2);
  float star2Bright = smoothstep(0.06, 0.0, star2Dist) * sd2Hash(dot(cell2, vec3(53.7, 91.1, 17.3)));
  star2Bright *= step(0.92, sd2Hash(dot(cell2, vec3(31.5, 67.3, 83.1))));
  vec3 starColor = mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.7, 0.5),
                        sd2Hash(dot(cell2, vec3(17.5, 43.1, 71.9))));
  stars += starColor * star2Bright * 3.0;

  // Space score increases background nebula glow
  float nebulaGlow = fbm3(vec3(rd * 2.0)) * 0.5 + 0.5;
  vec3 nebulaColor = mix(vec3(0.05, 0.02, 0.08), vec3(0.02, 0.04, 0.1), nebulaGlow);
  stars += nebulaColor * (0.3 + spaceScore * 0.5);

  return stars;
}

${sd2NormalGLSL}
${sd2AOGLSL}

// ─── Signal wave color ───
vec3 sd2SignalColor(float density, float warmth, vec3 tint, float burst) {
  vec3 cold = vec3(0.2, 0.5, 1.0) * tint;
  vec3 warm = vec3(1.0, 0.6, 0.2) * tint;
  vec3 col = mix(cold, warm, warmth);
  // Burst reception: bright white flash
  col += vec3(1.0, 0.95, 0.9) * burst * 2.0;
  return col * density;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float sectionT = uSectionType;
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float chordHue = float(int(uChordIndex)) / 24.0;

  // ─── Section type decomposition ───
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxIntensity;

  float flowTime = uDynamicTime * (0.06 + slowE * 0.03);

  // ─── Palette ───
  float hue1 = uPalettePrimary + chordHue * 0.15;
  float hue2 = uPaletteSecondary + chordHue * 0.08;
  vec3 signalTint = paletteHueColor(hue1, 0.7, 0.9);
  vec3 secondaryTint = paletteHueColor(hue2, 0.7, 0.9);

  // ─── Dish count: energy + section-driven ───
  int dishCount = 2 + int(energy * 3.0); // 2-5 dishes
  dishCount = min(dishCount + int(sJam * 2.0), 5); // jam: more dishes
  dishCount = max(dishCount - int(sSpace * 2.0), 1); // space: fewer dishes

  // Tracking stability: bass + beat stability
  float trackStability = beatStab * 0.6 + bass * 0.4;
  trackStability = mix(trackStability, 0.3, sSpace); // space: dishes wander
  trackStability = mix(trackStability, 0.9, sChorus); // chorus: locked on

  // ─── Camera setup ───
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // ─── Raymarch ───
  float totalDist = 0.0;
  float closestMat = -1.0;
  vec3 marchPos = ro;
  bool marchHasHit = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    vec2 mapResult = sd2Map(marchPos, energy, bass, trackStability, flowTime, dishCount);
    float dist = mapResult.x;

    if (dist < SURF_DIST) {
      closestMat = mapResult.y;
      marchHasHit = true;
      break;
    }
    if (totalDist > MAX_DIST) break;

    totalDist += dist * 0.8; // slight slowdown for accuracy
  }

  // ─── Background: deep space ───
  vec3 col = sd2Starfield(rd, spaceScore);

  // Distant nebula glow reacting to bass
  float nebulaField = fbm6(vec3(rd.xy * 3.0, flowTime * 0.05));
  vec3 nebulaTint = mix(signalTint * 0.1, secondaryTint * 0.15, nebulaField * 0.5 + 0.5);
  col += nebulaTint * (0.1 + bass * 0.15);

  // ─── Surface shading ───
  if (marchHasHit) {
    vec3 nor = sd2CalcNormal(marchPos);
    float occVal = sd2CalcOcclusion(marchPos, nor);

    // Key light: from above-right (moonlight / distant star)
    vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
    float diff = max(dot(nor, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, nor), -rd), 0.0), 32.0);

    // Fill light: dim blue from below (space ambient)
    float fillDiff = max(dot(nor, vec3(0.0, -0.5, 0.5)), 0.0) * 0.15;

    if (closestMat < 0.5) {
      // Dish metal: reflective, cold blue-silver
      vec3 metalBase = vec3(0.5, 0.55, 0.65);
      // Tint metal slightly with palette
      metalBase = mix(metalBase, signalTint * 0.4, 0.15);

      // Fresnel: dish rims glow brighter
      float fresnel = pow(1.0 - max(dot(nor, -rd), 0.0), 3.0);
      vec3 fresnelColor = mix(vec3(0.3, 0.4, 0.6), signalTint, 0.3);

      vec3 surfCol = metalBase * (diff * 0.6 + fillDiff + 0.08);
      surfCol += vec3(0.9, 0.92, 1.0) * spec * 0.8; // specular highlight
      surfCol += fresnelColor * fresnel * 0.4;
      surfCol *= occVal;

      // Signal reception glow: dish interior glows when receiving
      float signalGlow = bass * 0.3 + drumOnset * 0.5;
      signalGlow *= (1.0 + climaxBoost * 2.0);
      // More glow on upward-facing normals (dish interior)
      float interiorMask = smoothstep(0.0, 0.5, nor.y);
      surfCol += signalTint * signalGlow * interiorMask * 0.6;

      // Vocal warmth glow
      surfCol += vec3(1.0, 0.7, 0.4) * vocalPresence * interiorMask * 0.15;

      col = surfCol;
    } else {
      // Ground plane: dark terrain with subtle grid pattern
      vec3 groundCol = vec3(0.04, 0.035, 0.05);

      // Subtle grid lines (concrete pad markings)
      float gridX = smoothstep(0.02, 0.0, abs(fract(marchPos.x * 0.5) - 0.5) - 0.48);
      float gridZ = smoothstep(0.02, 0.0, abs(fract(marchPos.z * 0.5) - 0.5) - 0.48);
      float gridMask = max(gridX, gridZ);
      groundCol += vec3(0.06, 0.07, 0.1) * gridMask;

      groundCol *= diff * 0.4 + 0.05;
      groundCol *= occVal;

      // Ground reflects signal glow near dish bases
      for (int di = 0; di < 5; di++) {
        if (di >= dishCount) break;
        vec3 dPos = sd2DishPos(di);
        float distToDish = length(marchPos.xz - dPos.xz);
        float poolGlow = smoothstep(3.0, 0.5, distToDish) * bass * 0.1;
        groundCol += signalTint * poolGlow * (1.0 + climaxBoost);
      }

      col = groundCol;
    }

    // Distance fog
    float fogDist = length(marchPos - ro);
    float fogAmount = 1.0 - exp(-fogDist * 0.02);
    vec3 fogColor = vec3(0.02, 0.015, 0.04) + secondaryTint * 0.02;
    col = mix(col, fogColor, fogAmount);
  }

  // ─── Volumetric signal waves (additive pass) ───
  {
    vec3 signalAccum = vec3(0.0);
    int signalSteps = 24 + int(energy * 16.0);
    float stepLen = MAX_DIST / float(signalSteps);

    // Signal paths: between dish pairs
    // Number of active signals depends on section type
    int numSignals = 1 + int(sChorus) + int(sJam * 3.0) + int(climaxBoost * 2.0);
    numSignals = min(numSignals, 4);
    numSignals = max(numSignals - int(sSpace * 2.0), 0); // space: no signals

    // Climax: massive cosmic signal from deep space
    float cosmicSignal = climaxBoost;

    for (int si = 0; si < 32; si++) {
      if (si >= signalSteps) break;
      float marchedT = float(si) * stepLen;
      vec3 samplePos = ro + rd * marchedT;

      float totalDensity = 0.0;

      // Inter-dish signals
      for (int sig = 0; sig < 4; sig++) {
        if (sig >= numSignals) break;

        vec3 srcPos = sd2DishPos(sig);
        vec3 dstPos = sd2DishPos((sig + 1) % dishCount);
        // Raise signal paths to dish feed horn level
        srcPos.y += 1.2;
        dstPos.y += 1.2;

        float freq = 3.0 + melodicPitch * 5.0;
        float amp = 0.3 + bass * 0.7;
        float timeOff = flowTime * (2.0 + float(sig) * 0.7);
        float decayR = 0.5 + tension * 1.5; // tension = more decay = noisier

        float waveDensity = sd2SignalWave(samplePos, srcPos, dstPos, freq, amp,
                                           timeOff, decayR);
        totalDensity += waveDensity;
      }

      // Cosmic signal from deep space (climax): vertical beam flooding all dishes
      if (cosmicSignal > 0.01) {
        vec3 cosmicSrc = vec3(0.0, 40.0, 0.0);
        vec3 cosmicDst = sd2DishPos(0);
        cosmicDst.y += 1.2;
        float cosmicDensity = sd2SignalWave(samplePos, cosmicSrc, cosmicDst,
                                             2.0, 1.0, flowTime * 1.5, 0.1);
        totalDensity += cosmicDensity * cosmicSignal * 3.0;
      }

      // Drum onset burst: expanding spherical wave from central dish
      if (drumOnset > 0.1) {
        vec3 burstCenter = sd2DishPos(0);
        burstCenter.y += 1.2;
        float burstRadius = drumOnset * 8.0;
        float burstDist = abs(length(samplePos - burstCenter) - burstRadius);
        float burstDensity = smoothstep(0.5, 0.0, burstDist) * drumOnset;
        totalDensity += burstDensity * 0.5;
      }

      // Static interference: tension increases noise
      float interferenceAmt = tension * 0.5 + improv * 0.3;
      float interference = sd2Interference(samplePos, flowTime,
                                            interferenceAmt * (1.0 - sChorus * 0.7));
      totalDensity += interference * 0.15;

      if (totalDensity > 0.001) {
        float alpha = totalDensity * stepLen * 0.3;

        // Signal color: warm when vocal, cool when instrumental
        vec3 sigColor = sd2SignalColor(1.0, vocalPresence,
                                        signalTint, drumOnset * 0.3);
        // Timbral brightness modulates emission intensity
        sigColor *= 0.5 + timbralBright * 0.8;

        // Cosmic signal is brighter, more white
        if (cosmicSignal > 0.01) {
          vec3 cosmicColor = mix(sigColor, vec3(1.0, 0.95, 0.85), cosmicSignal * 0.6);
          sigColor = mix(sigColor, cosmicColor, cosmicSignal);
        }

        signalAccum += sigColor * alpha;
      }
    }

    col += signalAccum * (1.0 + climaxBoost * 1.5);
  }

  // ─── Searching sweep during space sections ───
  if (sSpace > 0.1) {
    // Dish sweep beam: rotating searchlight from central dish
    vec3 sweepOrigin = sd2DishPos(0);
    sweepOrigin.y += 1.2;
    float sweepAngle = flowTime * 0.5;
    vec3 sweepDir = normalize(vec3(cos(sweepAngle), 0.8, sin(sweepAngle)));
    float sweepDot = max(dot(rd, sweepDir), 0.0);
    float sweepBeam = pow(sweepDot, 32.0) * sSpace * 0.4;
    col += secondaryTint * sweepBeam;
  }

  // ─── Jam section: crossing signal interference pattern ───
  if (sJam > 0.1) {
    // Extra visual complexity: Moire-like interference from crossing signals
    float moirePattern = sin(p.x * 30.0 + flowTime * 3.0) *
                         sin(p.y * 30.0 + flowTime * 2.5);
    moirePattern = smoothstep(0.8, 1.0, abs(moirePattern));
    col += signalTint * moirePattern * sJam * 0.08 * energy;
  }

  // ─── Beat pulse on signal elements ───
  col *= 1.0 + uBeatSnap * 0.1 * (1.0 + climaxBoost * 0.3);

  // ─── Climax: overall luminance flood ───
  col += vec3(0.08, 0.06, 0.12) * climaxBoost;

  // ─── Secondary glow layer ───
  float glowNoise = fbm3(vec3(p * 2.0, flowTime * 0.12));
  vec3 glowLayer = mix(signalTint, secondaryTint, glowNoise * 0.5 + 0.5) * 0.03;
  col += glowLayer * (0.2 + energy * 0.15);

  // ─── Icon emergence ───
  {
    float nf = fbm3(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, bass, signalTint, secondaryTint, nf,
                          uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, signalTint, secondaryTint, nf,
                              uSectionIndex);
  }

  // ─── Post-processing ───
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
