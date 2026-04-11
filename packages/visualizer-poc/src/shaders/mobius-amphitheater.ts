/**
 * Mobius Amphitheater — raymarched twisted torus / Mobius strip interior.
 * Camera travels along the inner surface of a 180-degree-twisted band.
 * Audience silhouettes as SDF dots. Stage lights as volumetric cone beams.
 * Geometry morphs wildly during jams. Infinite, non-orientable, mind-bending.
 *
 * For "Playing In The Band" — the ultimate jam vehicle. The Mobius strip IS
 * the song: infinite, non-orientable, always returning but upside down.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             -> strip width pulsing, haze density
 *   uEnergy           -> light beam intensity, crowd density, geometric complexity
 *   uDrumOnset        -> light beam sweep, stage flash
 *   uVocalPresence    -> spotlight cone (single bright beam toward stage area)
 *   uHarmonicTension  -> strip twist rate (more tension = tighter twist)
 *   uMelodicPitch     -> light beam color temperature
 *   uSectionType      -> jam=geometry melts, space=floating void, chorus=full arena, solo=spotlight
 *   uClimaxPhase      -> strip breaks open into cosmic void, then reforms
 *   uBeatSnap         -> strobe flash
 *   uSlowEnergy       -> camera travel speed along the strip
 *   uJamPhase         -> exploration=loose, building=tighten, peak=dissolve, resolution=reform
 *   uSemanticPsychedelic -> twist intensity multiplier
 *   uJamDensity       -> architectural detail density
 *   uTimbralBrightness -> specular sharpness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const mobiusAmphitheaterVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  lightLeakEnabled: true,
  grainStrength: "normal",
  eraGradingEnabled: true,
  lensDistortionEnabled: true,
});

const maNormalGLSL = buildRaymarchNormal("maMap($P, energy, bass, maTime, tension, twistMult, morphAmt, sJam, sSpace, climB, halfW, halfH, majorR)", { eps: 0.003, name: "maNormal" });
const maAOGLSL = buildRaymarchAO("maMap($P, energy, bass, maTime, tension, twistMult, morphAmt, sJam, sSpace, climB, halfW, halfH, majorR)", { steps: 3, stepBase: 0.0, stepScale: 0.12, weightDecay: 0.7, finalMult: 3.0, name: "maAO" });

export const mobiusAmphitheaterFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;

#define MA_TAU 6.28318530
#define MA_PI 3.14159265
#define MA_HALF_PI 1.57079632

// ─── Hash helpers ───
float maHash(float n) { return fract(sin(n) * 43758.5453); }
float maHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 maHash3(vec3 p) {
  return fract(sin(vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453);
}

// ─── Smooth minimum (polynomial) ───
float maSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Rotation matrix 2D ───
mat2 maRot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// ─── Mobius strip parametric position + frame ───
// Returns position on the strip centerline at angle theta,
// plus the local normal and tangent frame.
// The strip has major radius R, twists by half-turn over one revolution.
vec3 maMobiusCenterline(float theta, float majorR) {
  float ct = cos(theta), st = sin(theta);
  return vec3(majorR * ct, majorR * st, 0.0);
}

// Local frame on the Mobius strip at parameter theta:
// The strip normal rotates by theta/2 as we go around (half-twist).
// Returns: tangent T, normal N, binormal B
void maMobiusFrame(float theta, float majorR, out vec3 frameT, out vec3 frameN, out vec3 frameB) {
  float ct = cos(theta), st = sin(theta);
  // Tangent: derivative of centerline
  frameT = normalize(vec3(-st, ct, 0.0));
  // The half-twist: normal rotates by theta/2 in the plane perpendicular to the centerline
  float halfAngle = theta * 0.5;
  float ch = cos(halfAngle), sh = sin(halfAngle);
  // Radial direction (outward from center of torus)
  vec3 radial = vec3(ct, st, 0.0);
  // Vertical direction
  vec3 vertical = vec3(0.0, 0.0, 1.0);
  // Normal is a mix of radial and vertical, rotating with the half-twist
  frameN = normalize(ch * radial + sh * vertical);
  frameB = normalize(cross(frameT, frameN));
}

// ─── Mobius strip SDF ───
// Point p, major radius R, strip half-width W, strip half-thickness H.
// Returns signed distance to the strip surface.
// Also outputs the closest theta and local cross-section coords for texturing.
float maMobiusSDF(vec3 pos, float majorR, float halfW, float halfH,
                  float twistMult, float noiseMorph,
                  out float outTheta, out vec2 outLocal) {
  // Find closest point on the centerline circle (project onto XY plane)
  float theta = atan(pos.y, pos.x);
  // Refine: search two candidates (atan can miss near wrapping)
  float bestDist = 1e10;
  float bestTheta = theta;
  vec2 bestLocal = vec2(0.0);

  for (int i = -1; i <= 1; i++) {
    float th = theta + float(i) * MA_TAU;
    // Centerline position
    float ct = cos(th), st = sin(th);
    vec3 center = vec3(majorR * ct, majorR * st, 0.0);
    vec3 diff = pos - center;

    // Local frame with twist
    float halfAngle = th * 0.5 * twistMult;
    float ch = cos(halfAngle), sh = sin(halfAngle);
    vec3 radial = vec3(ct, st, 0.0);
    vec3 vertical = vec3(0.0, 0.0, 1.0);
    vec3 localN = ch * radial + sh * vertical;
    vec3 localB = -sh * radial + ch * vertical;

    // Project diff onto local cross-section
    float localU = dot(diff, localN);  // across width
    float localV = dot(diff, localB);  // across thickness

    // Box cross-section SDF
    vec2 q = abs(vec2(localU, localV)) - vec2(halfW, halfH);
    float boxDist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);

    if (boxDist < bestDist) {
      bestDist = boxDist;
      bestTheta = th;
      bestLocal = vec2(localU, localV);
    }
  }

  outTheta = bestTheta;
  outLocal = bestLocal;
  return bestDist;
}

// ─── Tiered seating rows (stepped ridges on the strip surface) ───
float maSeatingRidges(vec2 localCoord, float halfW, float energy) {
  float u = localCoord.x; // across strip width
  // Create stepped tiers: 6-10 rows
  float numRows = 7.0 + energy * 3.0;
  float rowPos = (u / halfW) * 0.5 + 0.5; // normalize to 0-1
  float row = floor(rowPos * numRows);
  float rowFrac = fract(rowPos * numRows);
  // Step profile: flat seats with risers
  float riser = smoothstep(0.0, 0.15, rowFrac) * 0.03;
  return riser;
}

// ─── Stage platform SDF: a raised section at theta ~ 0 ───
float maStagePlatform(float theta, vec2 localCoord, float halfW) {
  // Stage is at theta=0, spans about 30 degrees
  float stageAngle = smoothstep(0.3, 0.0, abs(mod(theta + MA_PI, MA_TAU) - MA_PI));
  // Raised platform: only in the center strip area
  float centerMask = smoothstep(halfW * 0.4, halfW * 0.2, abs(localCoord.x));
  return stageAngle * centerMask * 0.08;
}

// ─── Columns/arches along strip edges ───
float maColumns(vec3 pos, float theta, float majorR, float halfW, float twistMult, float maTime) {
  // Place columns at regular angular intervals along both edges
  float colSpacing = MA_PI / 6.0; // 12 columns per revolution
  float colTheta = mod(theta + colSpacing * 0.5, colSpacing) - colSpacing * 0.5;

  // Column center position on the strip edge
  float snapTheta = theta - colTheta;
  float ct = cos(snapTheta), st = sin(snapTheta);
  vec3 center = vec3(majorR * ct, majorR * st, 0.0);

  float halfAngle = snapTheta * 0.5 * twistMult;
  float ch = cos(halfAngle), sh = sin(halfAngle);
  vec3 radial = vec3(ct, st, 0.0);
  vec3 vertical = vec3(0.0, 0.0, 1.0);
  vec3 localN = ch * radial + sh * vertical;
  vec3 localB = -sh * radial + ch * vertical;

  // Two columns: one on each edge of the strip
  float colR = 0.06 + 0.01 * sin(maTime * 0.1 + snapTheta * 3.0);
  vec3 edgeA = center + localN * halfW * 0.85;
  vec3 edgeB = center - localN * halfW * 0.85;

  float dA = length(pos - edgeA) - colR;
  float dB = length(pos - edgeB) - colR;

  // Arch between columns (simplified: sphere blend at top)
  vec3 archTop = center + localB * halfW * 0.5;
  float archD = length(pos - archTop) - halfW * 0.35;

  return min(min(dA, dB), archD);
}

// ─── Crowd: audience silhouettes as tiny spheres on seating tiers ───
float maCrowd(vec3 pos, float theta, float majorR, float halfW, float halfH,
              float twistMult, float energy, float maTime) {
  float crowdDist = 1e10;
  // Sample 5 angular slices near the camera, 4 rows per slice
  float thetaSlice = MA_TAU / 30.0;
  float snapTheta = floor(theta / thetaSlice) * thetaSlice;

  int numVisible = int(3.0 + energy * 4.0); // more crowd with energy

  for (int s = -2; s <= 2; s++) {
    float sliceTheta = snapTheta + float(s) * thetaSlice;
    float ct = cos(sliceTheta), st = sin(sliceTheta);
    vec3 sliceCenter = vec3(majorR * ct, majorR * st, 0.0);

    float halfAngle = sliceTheta * 0.5 * twistMult;
    float ch = cos(halfAngle), sh = sin(halfAngle);
    vec3 radial = vec3(ct, st, 0.0);
    vec3 vertical = vec3(0.0, 0.0, 1.0);
    vec3 localN = ch * radial + sh * vertical;
    vec3 localB = -sh * radial + ch * vertical;

    for (int r = 0; r < 7; r++) {
      if (r >= numVisible) break;
      // Place along the width at hash-driven positions
      float rowSeed = maHash(sliceTheta * 100.0 + float(r) * 7.13);
      float rowU = (rowSeed - 0.5) * halfW * 1.4;
      // Alternate sides, skip center (that's the stage area)
      if (abs(rowU) < halfW * 0.15) continue;

      // Height above strip surface
      float seatHeight = halfH + 0.02 + abs(rowU / halfW) * 0.06;

      vec3 crowdPos = sliceCenter + localN * rowU + localB * seatHeight;
      // Head: small sphere
      float headR = 0.018 + 0.004 * maHash(rowSeed * 31.0);
      // Sway with the music
      float sway = sin(maTime * 1.5 + rowSeed * MA_TAU) * 0.005 * energy;
      crowdPos += localB * sway;

      float headD = length(pos - crowdPos) - headR;
      // Body: elongated sphere below head
      vec3 bodyPos = crowdPos - localB * 0.025;
      float bodyD = length((pos - bodyPos) * vec3(1.0, 1.0, 1.5)) - headR * 1.3;

      crowdDist = min(crowdDist, min(headD, bodyD));
    }
  }
  return crowdDist;
}

// ─── Stage light cone SDF ───
float maLightCone(vec3 pos, vec3 apex, vec3 coneDir, float coneAngle, float coneLen) {
  vec3 diff = pos - apex;
  float projLen = dot(diff, coneDir);
  if (projLen < 0.0 || projLen > coneLen) return 1e10;
  float projR = length(diff - coneDir * projLen);
  float coneR = projLen * tan(coneAngle);
  return projR - coneR;
}

// ─── Full scene SDF ───
float maMap(vec3 pos, float energy, float bass, float maTime, float tension,
            float twistMult, float morphAmt, float sJam, float sSpace,
            float climB, float halfW, float halfH, float majorR) {

  // Noise displacement for jam morphing
  float noiseDisp = 0.0;
  if (morphAmt > 0.01) {
    noiseDisp = fbm3(pos * 1.5 + maTime * 0.3) * morphAmt;
  }

  float outTheta;
  vec2 outLocal;
  float stripDist = maMobiusSDF(pos, majorR, halfW, halfH, twistMult, morphAmt, outTheta, outLocal);

  // Add seating ridges as surface detail (inset)
  float ridges = maSeatingRidges(outLocal, halfW, energy);
  stripDist -= ridges;

  // Stage platform: raised area
  float stageBump = maStagePlatform(outTheta, outLocal, halfW);
  stripDist -= stageBump;

  // Noise displacement during jams
  stripDist += noiseDisp;

  // Climax: strip fractures
  if (climB > 0.1) {
    float fracture = ridged4(pos * 3.0 + maTime * 2.5) * climB * 0.2;
    stripDist += fracture;
  }

  // Columns along edges
  float colDist = maColumns(pos, outTheta, majorR, halfW, twistMult, maTime);
  float scene = min(stripDist, colDist);

  // Crowd (only when energy is moderate — performance optimization)
  if (energy > 0.15) {
    float crowd = maCrowd(pos, outTheta, majorR, halfW, halfH, twistMult, energy, maTime);
    scene = min(scene, crowd);
  }

  // Space sections: push geometry away, leaving void
  scene += sSpace * 0.5;

  return scene;
}

// Normal & AO — generated by shared raymarching utilities
${maNormalGLSL}
${maAOGLSL}

// ─── Volumetric stage light accumulation ───
vec3 maStageLights(vec3 ro, vec3 rd, float totalDist, bool wasHit, float maTime,
                   float energy, float bass, float drumOn, float vocalP,
                   float melPitch, float majorR, vec3 colLight, vec3 colSpot) {
  vec3 accumLight = vec3(0.0);

  // 3 stage light positions: sweeping around the stage area (theta ~ 0)
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float lightTheta = (fi - 1.0) * 0.15 + sin(maTime * 0.2 + fi * 2.094) * 0.1;
    lightTheta += drumOn * 0.3 * sin(fi * 1.7); // sweep on drum hits
    float ct = cos(lightTheta), st = sin(lightTheta);
    vec3 lightBase = vec3(majorR * ct, majorR * st, 0.0);

    // Half-twist at this theta
    float halfAngle = lightTheta * 0.5;
    float ch = cos(halfAngle), sh = sin(halfAngle);
    vec3 radial = vec3(ct, st, 0.0);
    vec3 vertical = vec3(0.0, 0.0, 1.0);
    vec3 localB = -sh * radial + ch * vertical;

    // Light apex is above the stage surface
    vec3 apex = lightBase + localB * 0.3;
    // Light points inward and slightly along the strip
    vec3 coneDir = normalize(-localB + vec3(sin(maTime * 0.15 + fi * 2.0) * 0.3, 0.0, 0.0));

    // Color: modulated by melodic pitch (warm to cool)
    float warmth = mix(0.3, 1.0, melPitch);
    vec3 beamColor = mix(colLight, colSpot, warmth) * (fi == 1.0 ? 1.0 : 0.7);

    // Vocal spotlight: one beam gets much brighter with vocals
    if (i == 1) {
      beamColor *= 1.0 + vocalP * 2.0;
    }

    // March along ray, accumulate in-cone light
    for (int g = 0; g < 8; g++) {
      float stepDist = 0.2 + float(g) * 0.4;
      if (stepDist > totalDist && wasHit) break;
      if (stepDist > 6.0) break;
      vec3 samplePos = ro + rd * stepDist;

      // Cone test
      vec3 toSample = samplePos - apex;
      float projLen = dot(toSample, coneDir);
      if (projLen < 0.0 || projLen > 3.0) continue;
      float projR = length(toSample - coneDir * projLen);
      float coneR = projLen * 0.35; // ~20 degree cone
      float inCone = smoothstep(coneR, coneR * 0.5, projR);

      // Haze: fbm fog density
      float haze = fbm3(samplePos * 0.5 + maTime * 0.04) * (0.1 + bass * 0.15);
      float attenuation = 1.0 / (1.0 + projLen * projLen * 0.5);

      accumLight += beamColor * inCone * (0.008 + haze * 0.005) * attenuation * energy;
    }
  }

  return accumLight;
}

// ─── Concert haze: thin volumetric fog ───
vec3 maHaze(vec3 ro, vec3 rd, float totalDist, bool wasHit, float maTime,
            float bass, float energy, vec3 hazeColor) {
  vec3 haze = vec3(0.0);
  float maxDist = wasHit ? min(totalDist, 8.0) : 8.0;
  for (int i = 0; i < 6; i++) {
    float stepDist = 0.5 + float(i) * 1.0;
    if (stepDist > maxDist) break;
    vec3 samplePos = ro + rd * stepDist;
    float density = fbm3(samplePos * 0.2 + maTime * 0.02);
    density = max(density, 0.0) * (0.02 + bass * 0.02);
    float attenuation = exp(-stepDist * 0.15);
    haze += hazeColor * density * attenuation;
  }
  return haze;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Clamp all uniforms ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float psyche = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float jamDensity = clamp(uJamDensity, 0.0, 1.0);
  float jamPhase = uJamPhase; // -1 to 3

  // Section type parsing
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // Climax
  float climB = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5) * clamp(uClimaxIntensity, 0.0, 1.0);

  // Jam phase interpretation
  float jpExplore = max(0.0, 1.0 - abs(jamPhase - 0.0)); // phase 0
  float jpBuild = max(0.0, 1.0 - abs(jamPhase - 1.0));   // phase 1
  float jpPeak = max(0.0, 1.0 - abs(jamPhase - 2.0));     // phase 2
  float jpResolve = max(0.0, 1.0 - abs(jamPhase - 3.0));  // phase 3

  // ─── Mobius geometry parameters ───
  float majorR = 2.0; // major radius of the torus/strip centerline
  float halfW = 0.6 + bass * 0.08; // strip half-width (bass breathing)
  float halfH = 0.04 + energy * 0.01; // strip half-thickness

  // Twist multiplier: 1.0 = standard Mobius (180 degree twist per revolution)
  // Tension increases twist, psychedelic amplifies it
  float twistMult = 1.0 + tension * 0.5 * (1.0 + psyche * 0.8);
  // Jam peak: extreme twist
  twistMult += jpPeak * 0.8 * sJam;

  // Morphing amount: how much the geometry dissolves
  float morphAmt = sJam * (0.05 + jpPeak * 0.15 + jpExplore * 0.03);
  morphAmt += climB * 0.2;

  // Dynamic time
  float maTime = uDynamicTime * (0.05 + slowE * 0.04) * (1.0 + sJam * 0.4 - sSpace * 0.3);

  // ─── Palette ───
  float h1 = uPalettePrimary;
  vec3 palPrimary = paletteHueColor(h1, 0.85, 0.95);
  float h2 = uPaletteSecondary;
  vec3 palSecondary = paletteHueColor(h2, 0.85, 0.95);

  // Concert venue colors: deep purples, amber lights, cool blues
  vec3 venueAmber = vec3(1.0, 0.75, 0.3);
  vec3 venuePurple = vec3(0.3, 0.1, 0.5);
  vec3 venueBlue = vec3(0.15, 0.25, 0.6);
  vec3 venueDark = vec3(0.03, 0.02, 0.04);

  // Mix palette with venue colors (50/50 for identity + atmosphere)
  vec3 colSurface = mix(palPrimary * 0.25, venuePurple, 0.5);
  vec3 colLight = mix(palSecondary, venueAmber, 0.4);
  vec3 colSpotlight = mix(vec3(1.0, 0.95, 0.85), venueAmber, melPitch * 0.5);
  vec3 colHaze = mix(venueBlue * 0.3, venuePurple * 0.3, 0.5 + 0.5 * sin(maTime * 0.05));
  vec3 colCrowd = venueDark * 2.0;

  // Chorus: vivid full arena burst
  colLight *= 1.0 + sChorus * 0.5;
  colSurface *= 1.0 + sChorus * 0.2;

  // ─── Camera: travels along the Mobius strip ───
  // Camera angle advances along the strip, speed modulated by slowEnergy
  float camTheta = maTime * 1.2;
  // Sway: gentle lateral movement
  float swayX = sin(maTime * 0.08) * 0.1 * (1.0 - sSpace * 0.7);
  float swayY = cos(maTime * 0.06) * 0.06;

  // Camera position: on the inner surface of the strip
  float ct = cos(camTheta), st = sin(camTheta);
  vec3 camCenter = vec3(majorR * ct, majorR * st, 0.0);

  // Get the local frame at camera position
  float camHalf = camTheta * 0.5 * twistMult;
  float ch = cos(camHalf), sh = sin(camHalf);
  vec3 camRadial = vec3(ct, st, 0.0);
  vec3 camVertical = vec3(0.0, 0.0, 1.0);
  vec3 camLocalN = ch * camRadial + sh * camVertical;
  vec3 camLocalB = -sh * camRadial + ch * camVertical;
  vec3 camLocalT = normalize(vec3(-st, ct, 0.0)); // tangent along strip

  // Position camera slightly above the strip surface, offset inward
  vec3 ro = camCenter + camLocalB * (halfH + 0.15) + camLocalN * swayX + camLocalT * swayY;

  // Space section: float away from the strip into the void
  ro += camLocalB * sSpace * 0.8;

  // Drum onset: camera jolt forward
  ro += camLocalT * drumOn * 0.15;

  // Look direction: forward along the strip, slightly inward
  vec3 lookAhead = vec3(majorR * cos(camTheta + 0.4), majorR * sin(camTheta + 0.4), 0.0);
  lookAhead += camLocalB * (halfH + 0.1);
  // Solo: look toward stage area
  vec3 stageDir = vec3(majorR, 0.0, 0.0) - ro;
  lookAhead = mix(lookAhead, ro + normalize(stageDir) * 2.0, sSolo * 0.5);

  vec3 fw = normalize(lookAhead - ro);
  // Construct camera basis — avoid degenerate cross product
  vec3 worldUp = abs(dot(fw, vec3(0.0, 0.0, 1.0))) > 0.99
    ? vec3(0.0, 1.0, 0.0)
    : vec3(0.0, 0.0, 1.0);
  vec3 ri = normalize(cross(worldUp, fw));
  vec3 camUp = cross(fw, ri);

  // Roll with the twist (the Mobius magic — camera tilts as it travels)
  float rollAngle = camHalf * 0.4; // partial roll to suggest the twist
  vec3 riRolled = ri * cos(rollAngle) + camUp * sin(rollAngle);
  vec3 upRolled = -ri * sin(rollAngle) + camUp * cos(rollAngle);

  float fov = 0.75 + energy * 0.12 + climB * 0.2;
  vec3 rd = normalize(p.x * riRolled + p.y * upRolled + fov * fw);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 hitPos = ro;
  bool wasHit = false;
  int maxSteps = int(mix(48.0, 72.0, energy));

  for (int i = 0; i < 72; i++) {
    if (i >= maxSteps) break;
    vec3 marchPos = ro + rd * totalDist;
    float dist = maMap(marchPos, energy, bass, maTime, tension,
                       twistMult, morphAmt, sJam, sSpace, climB,
                       halfW, halfH, majorR);

    // Climax perturbation
    dist += climB * 0.3 * (0.5 + 0.5 * snoise(marchPos * 2.0 + maTime * 3.0)) * 0.08;

    if (dist < 0.003) {
      hitPos = marchPos;
      wasHit = true;
      break;
    }
    if (totalDist > 12.0) break;
    totalDist += dist * 0.7;
  }

  vec3 col = vec3(0.0);

  if (wasHit) {
    // ─── Normal via shared raymarching utilities ───
    vec3 norm = maNormal(hitPos);

    // ─── Lighting ───
    // Key light: bright stage-style light from ahead
    float keyTheta = camTheta + 0.3;
    vec3 keyPos = vec3(majorR * cos(keyTheta), majorR * sin(keyTheta), 0.3);
    vec3 keyDir = normalize(keyPos - hitPos);
    float diffuse = max(dot(norm, keyDir), 0.0);

    // Fill light: ambient from opposite direction
    vec3 fillDir = normalize(vec3(-keyDir.x, -keyDir.y, 0.5));
    float fillDiff = max(dot(norm, fillDir), 0.0) * 0.12;

    // Specular: timbral brightness controls sharpness
    float specPow = 24.0 + timbralBright * 48.0 + energy * 24.0;
    float spec = pow(max(dot(reflect(-keyDir, norm), -rd), 0.0), specPow);

    // Fresnel: rim glow on the twisted surface
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.5);

    // ─── Ambient Occlusion via shared raymarching utilities ───
    float maAOVal = maAO(hitPos, norm);

    // ─── Depth fog ───
    float depthFade = clamp(totalDist / 10.0, 0.0, 1.0);

    // ─── Identify what we hit ───
    // Re-query the strip SDF for closest theta / local coords
    float hitTheta;
    vec2 hitLocal;
    float stripOnly = maMobiusSDF(hitPos, majorR, halfW, halfH, twistMult, morphAmt, hitTheta, hitLocal);
    float isStrip = smoothstep(0.05, 0.01, stripOnly);

    // Surface color varies by what was hit
    vec3 surfaceCol = colSurface;

    // Strip surface: darker concrete/stone texture
    if (isStrip > 0.5) {
      float stripNoise = fbm3(hitPos * 4.0) * 0.15;
      surfaceCol = mix(colSurface, venueDark * 3.0, 0.3 + stripNoise);
      // Seating rows: subtle variation per tier
      float rowVar = maHash(floor(hitLocal.x * 10.0 / halfW));
      surfaceCol *= 0.8 + rowVar * 0.3;
    }

    // Stage area: warmer, brighter
    float stageProx = smoothstep(0.3, 0.0, abs(mod(hitTheta + MA_PI, MA_TAU) - MA_PI));
    surfaceCol = mix(surfaceCol, colSurface * 1.5 + venueAmber * 0.1, stageProx * 0.4);

    // Crowd members: dark silhouettes with slight color
    float crowdProx = smoothstep(0.05, 0.01, maCrowd(hitPos, hitTheta, majorR, halfW, halfH, twistMult, energy, maTime));
    surfaceCol = mix(surfaceCol, colCrowd, crowdProx * 0.6);

    // Jam morphing: surface gets iridescent during peak dissolution
    if (sJam > 0.1 && jpPeak > 0.1) {
      float iri = sin(hitPos.x * 30.0 + hitPos.y * 20.0 + hitPos.z * 15.0 + maTime * 2.0) * 0.5 + 0.5;
      vec3 iriColor = 0.5 + 0.5 * cos(MA_TAU * (iri + vec3(0.0, 0.33, 0.67)));
      surfaceCol = mix(surfaceCol, iriColor * 0.3, jpPeak * sJam * 0.4);
    }

    // Depth fade
    surfaceCol = mix(surfaceCol, venueDark, depthFade * 0.5);

    // ─── Compose surface ───
    col = surfaceCol * (0.04 + diffuse * 0.30 + fillDiff) * maAOVal;
    col += colLight * spec * 0.20 * (1.0 + energy * 0.4);
    col += colLight * fresnel * 0.08 * (1.0 + vocalP * 0.4);
    col *= 1.0 + energy * 0.25;

    // Crowd: subtle audience glow (phone lights, lighter flames)
    if (crowdProx > 0.1 && energy > 0.3) {
      float flickerSeed = maHash(floor(hitPos.x * 50.0) + floor(hitPos.y * 50.0));
      float flicker = step(0.85, flickerSeed) * (0.5 + 0.5 * sin(maTime * 3.0 + flickerSeed * 100.0));
      col += vec3(1.0, 0.9, 0.6) * flicker * 0.03 * energy;
    }

  } else {
    // ─── Background: deep venue darkness / cosmic void ───
    col = venueDark * 0.02;
    // Distant strip glow
    float stripGlow = exp(-length(p) * 1.5) * 0.03;
    col += colSurface * stripGlow * (0.4 + energy * 0.6);

    // Climax: stars emerge as the strip breaks open
    if (climB > 0.1) {
      vec3 starCell = floor(rd * 35.0);
      float starHash = fract(sin(dot(starCell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      float starBright = step(0.90, starHash) * smoothstep(0.05, 0.01, length(fract(rd * 35.0) - 0.5));
      // Star colors: warm to cool
      vec3 starColor = mix(venueAmber, venueBlue, starHash);
      col += starColor * starBright * climB * 0.5;
    }

    // Space section: nebula glow in the void
    if (sSpace > 0.1) {
      float nebula = fbm(rd * 2.0 + maTime * 0.02);
      nebula = max(nebula, 0.0);
      vec3 nebColor = mix(venuePurple, venueBlue, nebula);
      col += nebColor * nebula * sSpace * 0.06;
    }
  }

  // ─── Stage lights: volumetric cone beams ───
  col += maStageLights(ro, rd, totalDist, wasHit, maTime, energy, bass,
                       drumOn, vocalP, melPitch, majorR, colLight, colSpotlight);

  // ─── Concert haze ───
  col += maHaze(ro, rd, totalDist, wasHit, maTime, bass, energy, colHaze);

  // ─── Drum onset flash: whole venue strobes ───
  col += venueAmber * drumOn * 0.04 * energy;

  // ─── Ambient floor: never fully black ───
  col += venueDark * 0.015;

  // ─── Beat snap brightness kick ───
  col *= 1.0 + uBeatSnap * 0.12;

  // ─── Climax boost: brighter, more saturated ───
  col *= 1.0 + climB * 0.3;

  // ─── Vignette: deep venue darkness at edges ───
  float vigDist = 1.0 - dot(p * 0.3, p * 0.3);
  float vig = smoothstep(0.0, 1.0, vigDist);
  col = mix(venueDark * 0.01, col, vig * mix(0.7, 1.0, vig));

  // ─── Icon emergence ───
  float noiseField = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, colLight, palSecondary, noiseField, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, colLight, palSecondary, noiseField, uSectionIndex);

  // ─── Floor: never fully black ───
  col = max(col, vec3(0.02, 0.015, 0.03));

  // ─── Post-process ───
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
}
`;
