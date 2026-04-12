/**
 * Feedback Recursion Hall — raymarched infinite mirror corridor.
 * Two parallel mirrors face each other creating classic infinite regression.
 * Reflected images are slightly distorted, color-shifted, and delayed,
 * producing a psychedelic tunnel of recursive reflections stretching to infinity.
 * Camera stands between the mirrors looking down the infinite regression.
 *
 * Visual aesthetic:
 *   - Quiet: still corridor, deep infinite regression, cool ambient
 *   - Building: mirrors pulse closer, reflections intensify, hue shifts deepen
 *   - Peak: vivid deep recursion, maximum clarity, prismatic color per bounce
 *   - Release: mirrors drift apart, reflections fade to fog
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              → mirror distance pulsing (corridor breathing)
 *   uEnergy            → recursion depth/clarity, ray step count
 *   uDrumOnset         → ripple distortion through all reflections
 *   uVocalPresence     → warm ambient fill light between mirrors
 *   uHarmonicTension   → distortion per reflection bounce
 *   uSectionType       → jam=mirrors tilt creating spiral regression,
 *                         space=still/infinite, chorus=vivid deep recursion
 *   uClimaxPhase       → mirrors fold inward creating kaleidoscopic collapse
 *   uSlowEnergy        → drift speed of camera and reflections
 *   uMelodicPitch      → vertical camera drift
 *   uBeatStability     → reflection coherence (stable=clean, unstable=warped)
 *   uTimbralBrightness → specular intensity on mirror frames
 *   uSpaceScore        → infinite depth multiplier (deeper regression)
 *   uDynamicRange      → contrast between reflections and shadows
 *   uChromaHue         → base hue shift per bounce
 *   uStemBass          → floor vibration amplitude
 *   uSemanticPsychedelic → color saturation boost per bounce
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const feedbackRecursionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.06,
  caEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  beatPulseEnabled: true,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
  grainStrength: "normal",
});

export const feedbackRecursionFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Hash helpers ───
float frHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float frHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// ─── Smooth min ───
float frSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Box SDF ───
float frBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// ─── Rounded box SDF ───
float frRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// ─── Mirror frame SDF: ornate rectangular frame around each mirror ───
float frFrame(vec3 p, float mirrorHalf, float frameThick, float frameDepth) {
  // Outer box (full frame footprint)
  float outer = frRoundBox(p, vec3(1.4, 2.0, frameDepth), 0.04);
  // Inner cutout (mirror opening)
  float inner = frBox(p, vec3(1.4 - frameThick, 2.0 - frameThick, frameDepth + 0.1));
  // Frame = outer minus inner
  float frame = max(outer, -inner);

  // Decorative molding ridges along the frame edges
  float moldingX = sin(p.y * 12.0) * 0.008;
  float moldingY = sin(p.x * 8.0) * 0.006;
  frame -= (moldingX + moldingY) * smoothstep(0.0, 0.05, abs(frame - 0.02));

  return frame;
}

// ─── Floor SDF: polished reflective surface between mirrors ───
float frFloor(vec3 p, float bassVib) {
  float floorY = -2.2;
  float floorDist = p.y - floorY;
  // Bass vibration ripple on floor surface
  floorDist += sin(p.x * 3.0 + p.z * 2.0) * bassVib * 0.015;
  // Subtle tile pattern displacement
  float tile = smoothstep(0.48, 0.5, abs(fract(p.x * 0.5) - 0.5))
             + smoothstep(0.48, 0.5, abs(fract(p.z * 0.5) - 0.5));
  floorDist -= tile * 0.003;
  return floorDist;
}

// ─── Mirror plane SDF ───
// Returns distance to a mirror surface at given X offset, with optional tilt
float frMirrorPlane(vec3 p, float xPos, float tiltAngle, float climaxFold) {
  // Mirror is an XZ plane at x = xPos
  vec3 mp = p;
  mp.x -= xPos;

  // Tilt for jam mode: rotate around Y axis
  if (abs(tiltAngle) > 0.001) {
    float ct = cos(tiltAngle);
    float st = sin(tiltAngle);
    mp.xz = mat2(ct, st, -st, ct) * mp.xz;
  }

  // Climax fold: mirrors tilt inward around horizontal axis
  if (climaxFold > 0.01) {
    float foldAngle = climaxFold * 0.4;
    float cf = cos(foldAngle);
    float sf = sin(foldAngle);
    float signX = sign(xPos);
    mp.xy = mat2(cf, sf * signX, -sf * signX, cf) * mp.xy;
  }

  // Thin slab for the mirror surface
  return abs(mp.x) - 0.02;
}

// ─── Complete scene SDF ───
// Returns distance to nearest surface. Material ID via matId (out):
//   0 = floor, 1 = left mirror, 2 = right mirror, 3 = frame
float frMap(vec3 p, float mirrorDist, float tiltAngle, float climaxFold,
            float bassVib, float frameThick, out float matId) {
  float halfDist = mirrorDist * 0.5;

  // Mirror planes
  float leftMirror = frMirrorPlane(p, -halfDist, -tiltAngle, climaxFold);
  float rightMirror = frMirrorPlane(p, halfDist, tiltAngle, climaxFold);

  // Frames around mirrors (offset from mirror surfaces)
  vec3 leftFrameP = p - vec3(-halfDist - 0.03, 0.0, 0.0);
  vec3 rightFrameP = p - vec3(halfDist + 0.03, 0.0, 0.0);
  float leftFrame = frFrame(leftFrameP, halfDist, frameThick, 0.06);
  float rightFrame = frFrame(rightFrameP, halfDist, frameThick, 0.06);

  // Floor
  float floorD = frFloor(p, bassVib);

  // Find closest surface and assign material ID
  float scene = floorD;
  matId = 0.0;

  if (leftMirror < scene) { scene = leftMirror; matId = 1.0; }
  if (rightMirror < scene) { scene = rightMirror; matId = 2.0; }

  float frames = min(leftFrame, rightFrame);
  if (frames < scene) { scene = frames; matId = 3.0; }

  return scene;
}

// Overload without matId for normals / AO
float frMapSimple(vec3 p, float mirrorDist, float tiltAngle, float climaxFold,
                  float bassVib, float frameThick) {
  float dummy;
  return frMap(p, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick, dummy);
}

// ─── Normal via central differences ───
vec3 frNormal(vec3 p, float mirrorDist, float tiltAngle, float climaxFold,
              float bassVib, float frameThick) {
  vec2 eps = vec2(0.002, 0.0);
  float d0 = frMapSimple(p, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick);
  return normalize(vec3(
    frMapSimple(p + eps.xyy, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick) - d0,
    frMapSimple(p + eps.yxy, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick) - d0,
    frMapSimple(p + eps.yyx, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick) - d0
  ));
}

// ─── Ambient occlusion (4-sample) ───
float frAO(vec3 p, vec3 n, float mirrorDist, float tiltAngle, float climaxFold,
           float bassVib, float frameThick) {
  float occl = 1.0;
  for (int j = 1; j < 5; j++) {
    float aoDist = 0.15 * float(j);
    float aoSample = frMapSimple(p + n * aoDist, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick);
    occl -= (aoDist - aoSample) * (0.3 / float(j));
  }
  return clamp(occl, 0.15, 1.0);
}

// ─── Mirror bounce: simulate recursive reflections ───
// Traces the reflected view through the mirror corridor, accumulating
// color shifts, distortion, and fade per bounce.
vec3 frBounce(vec3 ro, vec3 rd, float mirrorDist, float energy, float tension,
              float drumRipple, float hueShift, float satBoost,
              float stability, float sSpace, float sChorus, float sJam,
              float tiltAngle, float climaxFold, vec3 palette1, vec3 palette2,
              float timbralSpec, float flowTime) {
  vec3 accumCol = vec3(0.0);
  float accumAlpha = 1.0;
  float halfDist = mirrorDist * 0.5;

  // Max bounces: driven by energy (4-12)
  int maxBounces = int(mix(4.0, 12.0, energy));
  // Space mode: extend to max bounces for infinite feel
  maxBounces = int(mix(float(maxBounces), 12.0, sSpace));
  // Chorus: push to deeper recursion
  maxBounces = int(mix(float(maxBounces), 14.0, sChorus * 0.5));

  vec3 bounceRo = ro;
  vec3 bounceRd = rd;
  float bounceHue = 0.0;

  for (int bounce = 0; bounce < 14; bounce++) {
    if (bounce >= maxBounces) break;
    if (accumAlpha < 0.02) break;

    float fb = float(bounce);

    // Distance to next mirror surface (simplified analytic for speed)
    float tToMirror;
    if (bounceRd.x > 0.001) {
      tToMirror = (halfDist - bounceRo.x) / bounceRd.x;
    } else if (bounceRd.x < -0.001) {
      tToMirror = (-halfDist - bounceRo.x) / bounceRd.x;
    } else {
      // Ray nearly parallel to mirrors — infinite corridor view
      tToMirror = 50.0;
    }

    tToMirror = max(tToMirror, 0.1);

    // Hit point on mirror
    vec3 mirrorHitPt = bounceRo + bounceRd * tToMirror;

    // ─── Drum onset ripple: sinusoidal UV distortion per bounce ───
    float ripplePhase = fb * 0.7 + flowTime * 4.0;
    float rippleAmt = drumRipple * 0.06 * exp(-fb * 0.3);
    mirrorHitPt.y += sin(mirrorHitPt.x * 8.0 + ripplePhase) * rippleAmt;
    mirrorHitPt.z += cos(mirrorHitPt.y * 6.0 + ripplePhase) * rippleAmt * 0.7;

    // ─── Tension distortion: warp increases per bounce ───
    float tensionWarp = tension * 0.03 * (fb + 1.0);
    mirrorHitPt.y += sin(mirrorHitPt.z * 3.0 + fb * 1.5) * tensionWarp;
    mirrorHitPt.z += cos(mirrorHitPt.y * 4.0 + fb * 2.0) * tensionWarp * 0.6;

    // ─── Stability: unstable = jittery reflection positions ───
    float jitter = (1.0 - stability) * 0.04 * sin(flowTime * 11.0 + fb * 3.7);
    mirrorHitPt.y += jitter;

    // ─── Color per bounce: progressive hue shift ───
    bounceHue += hueShift + fb * 0.04;
    float bounceSat = mix(0.4, 0.9, energy) * (1.0 + satBoost * 0.3);

    // Mix between palette colors with per-bounce rotation
    vec3 bounceColor = mix(palette1, palette2, 0.5 + 0.5 * sin(bounceHue * TAU));

    // Apply HSV-like hue rotation to the bounce color
    vec3 bounceHSV = rgb2hsv(bounceColor);
    bounceHSV.x = fract(bounceHSV.x + bounceHue * 0.15);
    bounceHSV.y = clamp(bounceHSV.y * bounceSat * 1.3, 0.0, 1.0);
    bounceColor = hsv2rgb(bounceHSV);

    // Chorus: vivid, saturated, deeper colors
    bounceColor = mix(bounceColor, bounceColor * 1.4, sChorus * 0.3);

    // ─── Reflection fade: deeper bounces progressively dimmer ───
    float fadePower = mix(0.35, 0.15, energy); // high energy = slower fade
    fadePower = mix(fadePower, 0.08, sSpace);  // space = very slow fade (infinite)
    float bounceFade = exp(-fb * fadePower);

    // ─── Depth fog between mirrors ───
    float fogDist = tToMirror * 0.08;
    vec3 fogColor = mix(vec3(0.01, 0.02, 0.04), vec3(0.03, 0.02, 0.05), fb * 0.1);
    float fogAmount = 1.0 - exp(-fogDist * fogDist);

    // ─── Pattern in each reflection: ghostly image in the mirror ───
    // Each bounce shows a slightly different noise pattern (the "reflected room")
    vec2 mirrorUV = mirrorHitPt.yz * 0.3;
    float mirrorNoise = fbm3(vec3(mirrorUV * (2.0 + fb * 0.5), flowTime * 0.1 + fb * 1.3));
    float mirrorPattern = smoothstep(-0.2, 0.6, mirrorNoise);

    // Glowing frame edges visible in reflections
    float frameGlow = smoothstep(1.3, 1.5, abs(mirrorHitPt.y))
                    + smoothstep(1.8, 2.1, abs(mirrorHitPt.z));
    frameGlow = clamp(frameGlow, 0.0, 1.0);

    // Specular highlight on mirror surface (timbral brightness drives intensity)
    float spec = pow(max(dot(reflect(bounceRd, vec3(sign(bounceRd.x), 0.0, 0.0)),
                         vec3(0.0, 0.3, -0.9)), 0.0), 12.0 + energy * 24.0);
    spec *= timbralSpec * 0.4;

    // Combine this bounce's contribution
    vec3 reflectionCol = bounceColor * mirrorPattern * 0.6;
    reflectionCol += bounceColor * frameGlow * 0.15;
    reflectionCol += vec3(1.0, 0.97, 0.92) * spec;
    reflectionCol = mix(reflectionCol, fogColor, fogAmount * 0.5);

    // Accumulate with progressive alpha falloff
    accumCol += reflectionCol * bounceFade * accumAlpha;
    accumAlpha *= (0.88 - fb * 0.03); // each bounce absorbs some light

    // ─── Reflect the ray for next bounce ───
    // Mirror normal points inward along X
    vec3 mirrorNorm = vec3(-sign(bounceRd.x), 0.0, 0.0);

    // Jam tilt: spiral the normal slightly per bounce
    if (abs(tiltAngle) > 0.001) {
      float tiltPer = tiltAngle * (1.0 + fb * 0.15);
      mirrorNorm.y += sin(tiltPer) * 0.15;
      mirrorNorm.z += cos(tiltPer * 0.7) * 0.1;
      mirrorNorm = normalize(mirrorNorm);
    }

    // Climax fold: progressive inward fold per bounce
    if (climaxFold > 0.01) {
      float foldPer = climaxFold * (0.3 + fb * 0.08);
      mirrorNorm.y += sin(foldPer * 2.0) * foldPer * 0.5;
      mirrorNorm = normalize(mirrorNorm);
    }

    bounceRd = reflect(bounceRd, mirrorNorm);
    bounceRo = mirrorHitPt + bounceRd * 0.05;
  }

  return accumCol;
}

// ─── Ambient volumetric glow between mirrors ───
vec3 frAmbientGlow(vec3 ro, vec3 rd, float maxDist, float vocalWarm,
                   float energy, float flowTime, vec3 warmColor) {
  vec3 glow = vec3(0.0);
  int steps = int(mix(6.0, 14.0, energy));

  for (int i = 0; i < 14; i++) {
    if (i >= steps) break;
    float fi = float(i);
    float t = (fi + frHash(fi * 3.7)) * maxDist / float(steps);
    vec3 samplePos = ro + rd * t;

    // Soft volumetric fog between mirrors
    float density = fbm3(samplePos * 0.4 + vec3(flowTime * 0.02, 0.0, flowTime * 0.03));
    density = smoothstep(-0.3, 0.5, density) * 0.02;

    // Vocal warmth drives ambient intensity
    density *= 0.3 + vocalWarm * 0.7;

    // Warm color with slight spatial variation
    vec3 fogCol = warmColor * (0.6 + 0.4 * sin(samplePos.z * 0.5 + flowTime * 0.1));

    float depthFade = exp(-t * 0.15);
    glow += fogCol * density * depthFade;
  }

  return glow;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Clamp audio uniforms ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);
  float timbralB = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceS = clamp(uSpaceScore, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float stemBass = clamp(uStemBass, 0.0, 1.0);
  float semPsych = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float chromaH = uChromaHue;

  // 7-band spectral
  float fftBass = texture2D(uFFTTexture, vec2(0.07, 0.5)).r;
  float fftMid = texture2D(uFFTTexture, vec2(0.36, 0.5)).r;
  float fftHigh = texture2D(uFFTTexture, vec2(0.78, 0.5)).r;

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);
  float climaxFold = climaxBoost; // mirrors fold inward

  // ─── Palette ───
  float h1 = uPalettePrimary + chromaH * 0.15;
  float h2 = uPaletteSecondary + chromaH * 0.1;
  float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;
  vec3 palette1 = hsv2rgb(vec3(h1, sat, 0.9));
  vec3 palette2 = hsv2rgb(vec3(h2, sat * 0.8, 0.7));
  vec3 warmTint = hsv2rgb(vec3(h1 + 0.05, sat * 0.4, 0.5));
  vec3 coolTint = hsv2rgb(vec3(h2 + 0.3, sat * 0.3, 0.3));

  // ─── Time / motion ───
  float flowTime = uDynamicTime * (0.05 + slowE * 0.03)
                 * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);

  // ─── Mirror distance: bass makes the corridor breathe ───
  float baseMirrorDist = 3.0;
  // Bass pulsing: corridor breathes with the rhythm
  float breathe = bass * 0.4 + fftBass * 0.2;
  float mirrorDist = baseMirrorDist + sin(flowTime * 1.5) * breathe * 0.5 - breathe * 0.15;
  // Climax: mirrors collapse inward
  mirrorDist *= mix(1.0, 0.4, climaxBoost);
  // Space: mirrors drift slightly apart for infinite feel
  mirrorDist *= mix(1.0, 1.3, sSpace);

  // ─── Jam mode: mirrors tilt creating spiral regression ───
  float tiltAngle = sJam * sin(flowTime * 0.8) * 0.15;
  // Solo: slight tilt for dramatic angle
  tiltAngle += sSolo * 0.06 * sin(flowTime * 0.5);

  // ─── Frame geometry parameters ───
  float frameThick = 0.12 + energy * 0.04;

  // ─── Bass vibration for floor ───
  float bassVib = stemBass * 0.5 + bass * 0.3;

  // ─── Camera: standing between mirrors, looking down the regression ───
  vec3 ro = vec3(
    sin(flowTime * 0.2) * 0.3 * (1.0 - sSpace * 0.7),  // gentle lateral drift
    -0.4 + melodicP * 0.6 + cos(flowTime * 0.15) * 0.1, // melodic pitch lifts view
    sin(flowTime * 0.08) * 0.5                            // subtle fore-aft drift
  );

  // Drum onset: camera jolt
  ro.y += drumOn * 0.12;
  ro.x += drumOn * 0.05 * sin(flowTime * 7.0);

  // Look direction: into the mirror regression
  vec3 lookTarget = vec3(
    mirrorDist * 0.4 * sign(sin(flowTime * 0.04)),  // alternate looking left/right
    0.0 + melodicP * 0.2,
    0.0
  );

  // Space: look straight down the corridor (no lateral bias)
  lookTarget.x = mix(lookTarget.x, 0.0, sSpace * 0.8);

  vec3 fw = normalize(lookTarget - ro);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  // Climax: camera tilts as mirrors fold
  float camTilt = climaxBoost * sin(flowTime * 2.0) * 0.15;
  worldUp = normalize(vec3(sin(camTilt), cos(camTilt), 0.0));
  vec3 ri = normalize(cross(fw, worldUp));
  vec3 camUp = cross(ri, fw);
  float fov = 0.8 + energy * 0.1 - sSpace * 0.15 + climaxBoost * 0.3;
  vec3 rd = normalize(p.x * ri + p.y * camUp + fov * fw);

  // ─── Raymarch the mirror corridor geometry ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  float hitMatId = -1.0;
  bool didHitGeom = false;
  int maxSteps = int(mix(48.0, 72.0, energy));

  for (int i = 0; i < 72; i++) {
    if (i >= maxSteps) break;
    vec3 pos = ro + rd * totalDist;
    float matId;
    float dist = frMap(pos, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick, matId);

    if (dist < 0.003) {
      hitPos = pos;
      hitMatId = matId;
      didHitGeom = true;
      break;
    }
    if (totalDist > 25.0) break;
    totalDist += dist * 0.75;
  }

  vec3 col = vec3(0.0);

  if (didHitGeom) {
    // ─── Surface normal ───
    vec3 norm = frNormal(hitPos, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick);

    // ─── Ambient occlusion ───
    float occl = frAO(hitPos, norm, mirrorDist, tiltAngle, climaxFold, bassVib, frameThick);

    // ─── Depth fog ───
    float depthFade = exp(-totalDist * 0.08);

    // ─── Lighting: overhead ambient + point lights between mirrors ───
    vec3 lightDir = normalize(vec3(0.3, 0.8, -0.3));
    float diff = max(dot(norm, lightDir), 0.0);

    // Vocal presence warm fill
    vec3 ambientLight = coolTint * 0.06 + warmTint * vocalP * 0.12;

    if (hitMatId < 0.5) {
      // ─── FLOOR: polished dark surface with reflections ───
      vec3 floorCol = vec3(0.04, 0.035, 0.03) * (1.0 + dynRange * 0.3);

      // Floor reflection: sample the mirror bounce from reflected angle
      vec3 floorReflDir = reflect(rd, vec3(0.0, 1.0, 0.0));
      vec3 floorRefl = frBounce(hitPos, floorReflDir, mirrorDist, energy * 0.5,
        tension, drumOn, chromaH * 0.15 + 0.02, semPsych, beatStab,
        sSpace, sChorus, sJam, tiltAngle, climaxFold,
        palette1 * 0.5, palette2 * 0.5, timbralB, flowTime);

      // Fresnel on floor (glancing angles more reflective)
      float floorFresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 4.0);

      col = floorCol * (ambientLight + diff * warmTint * 0.15) * occl;
      col += floorRefl * floorFresnel * 0.3;
      col *= depthFade;

    } else if (hitMatId < 2.5) {
      // ─── MIRROR SURFACES (left=1, right=2): recursive reflections ───

      // The mirror reflection — the heart of the shader
      vec3 reflDir = reflect(rd, norm);
      vec3 mirrorRefl = frBounce(hitPos, reflDir, mirrorDist, energy,
        tension, drumOn, chromaH * 0.15 + 0.03, semPsych, beatStab,
        sSpace, sChorus, sJam, tiltAngle, climaxFold,
        palette1, palette2, timbralB, flowTime);

      // Mirror surface: highly reflective with slight tint
      float mirrorFresnel = 0.85 + 0.15 * pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

      // Specular highlight on mirror glass
      vec3 specDir = reflect(-lightDir, norm);
      float spec = pow(max(dot(specDir, -rd), 0.0), 24.0 + energy * 48.0);

      col = mirrorRefl * mirrorFresnel;
      col += vec3(1.0, 0.97, 0.93) * spec * timbralB * 0.2;
      col += ambientLight * 0.05;
      col *= occl * depthFade;

    } else {
      // ─── FRAME: ornate border around mirrors ───
      vec3 frameCol = vec3(0.15, 0.1, 0.05); // dark wood/bronze
      frameCol += vec3(0.3, 0.22, 0.08) * (0.5 + 0.5 * fbm3(hitPos * 4.0)); // wood grain

      // Metallic specular on frame edges
      vec3 specDir = reflect(-lightDir, norm);
      float spec = pow(max(dot(specDir, -rd), 0.0), 16.0);
      float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

      col = frameCol * (ambientLight + diff * warmTint * 0.3) * occl;
      col += vec3(0.8, 0.65, 0.3) * spec * 0.15 * timbralB;
      col += warmTint * fresnel * 0.06;
      col *= depthFade;
    }

  } else {
    // ─── RAY MISS: deep corridor infinity ───
    // For rays that travel between mirrors without hitting geometry,
    // simulate the infinite regression directly
    vec3 infiniteRefl = frBounce(ro, rd, mirrorDist, energy,
      tension, drumOn, chromaH * 0.15 + 0.05, semPsych, beatStab,
      sSpace, sChorus, sJam, tiltAngle, climaxFold,
      palette1, palette2, timbralB, flowTime);

    col = infiniteRefl;

    // Deep space fade to dark
    float depthFog = exp(-totalDist * 0.04);
    col *= depthFog;
    col += coolTint * 0.02 * (1.0 - depthFog);
  }

  // ─── Ambient volumetric glow between mirrors ───
  float glowDist = didHitGeom ? totalDist : 12.0;
  vec3 ambGlow = frAmbientGlow(ro, rd, glowDist, vocalP, energy, flowTime, warmTint);
  col += ambGlow * (1.0 + climaxBoost * 0.4);

  // ─── Drum onset ripple flash: brief prismatic burst ───
  if (drumOn > 0.1) {
    float rippleRing = 0.5 + 0.5 * sin(length(p) * 15.0 - flowTime * 8.0);
    vec3 rippleCol = hsv2rgb(vec3(h1 + length(p) * 0.1, 0.9, 1.0));
    col += rippleCol * drumOn * rippleRing * 0.15;
  }

  // ─── Climax: kaleidoscopic collapse — mirrors fold, colors explode ───
  if (climaxBoost > 0.1) {
    // Kaleidoscopic UV fold
    vec2 kp = p;
    float kAngle = atan(kp.y, kp.x);
    float kRadius = length(kp);
    float foldCount = 3.0 + climaxBoost * 5.0;
    kAngle = abs(mod(kAngle, TAU / foldCount) - PI / foldCount);
    vec2 kUV = vec2(cos(kAngle), sin(kAngle)) * kRadius;

    float kNoise = fbm3(vec3(kUV * 4.0, flowTime * 0.3));
    vec3 kColor = hsv2rgb(vec3(h1 + kNoise * 0.3 + flowTime * 0.05, 0.9, 1.0));
    col = mix(col, col + kColor * 0.5, climaxBoost * 0.6);

    // Brightness surge
    col *= 1.0 + climaxBoost * 0.4;
  }

  // ─── Solo: heightened mirror contrast ───
  if (sSolo > 0.1) {
    float soloLuma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, col * 1.35, sSolo * 0.3);
  }

  // ─── Dynamic range: contrast between bright reflections and dark gaps ───
  {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    float contrast = mix(1.0, 1.3, dynRange);
    col = mix(vec3(luma), col, contrast);
  }

  // ─── Psychedelic semantic boost ───
  col *= 1.0 + semPsych * 0.15;

  // ─── Vignette: mirror corridor framing ───
  float vigStrength = mix(0.35, 0.25, energy);
  float vig = 1.0 - dot(p * vigStrength, p * vigStrength);
  vig = smoothstep(0.0, 1.0, vig);
  col = mix(vec3(0.01, 0.01, 0.02), col, vig);

  // ─── Dead iconography ───
  {
    float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
    col += iconEmergence(p, uTime, energy, bass, palette1, palette2, _nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, palette1, palette2, _nf, uSectionIndex);
  }

  // ─── Lifted blacks: corridor has ambient even in darkness ───
  float isBuild = step(0.5, uClimaxPhase) * step(uClimaxPhase, 1.5);
  float liftMult = mix(1.0, 0.3, isBuild * clamp(uClimaxIntensity, 0.0, 1.0));
  col = max(col, vec3(0.015, 0.012, 0.02) * liftMult);

  // ─── Post-process chain ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
