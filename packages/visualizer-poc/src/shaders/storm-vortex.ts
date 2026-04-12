/**
 * Storm Vortex -- raymarched tornado funnel with debris, lightning, turbulent clouds.
 * Built for "Black Throated Wind" -- dark, driving, struggle and wind imagery.
 * Camera inside a massive storm system looking up into the vortex eye.
 *
 * Audio reactivity:
 *   uBass             -> vortex width pulsing, cloud density
 *   uEnergy           -> rotation speed, debris count, overall turbulence
 *   uDrumOnset        -> LIGHTNING FLASH (bright white burst + branching SDF)
 *   uVocalPresence    -> eye of storm visibility (calm center)
 *   uHarmonicTension  -> vortex tightening, grey -> green/purple warning colors
 *   uBeatSnap         -> thunder rumble brightness pulse
 *   uSectionType      -> jam=max turbulence, space=eye calm, chorus=full rotation
 *   uClimaxPhase      -> vortex touchdown, everything intensifies
 *   uSlowEnergy       -> overall storm movement speed
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const stormVortexVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomThresholdOffset: -0.05,
  caEnabled: true,
  dofEnabled: true,
  eraGradingEnabled: true,
  halationEnabled: true,
  bloomEnabled: true,
  beatPulseEnabled: true,
  lightLeakEnabled: false,
  grainStrength: "normal",
});

export const stormVortexFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;

#define TAU 6.28318530
#define PI 3.14159265

// ─── Hash helpers ───
float svHash(float n) { return fract(sin(n) * 43758.5453); }
float svHash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 svHash3(vec3 p) {
  return fract(sin(vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453);
}

// ─── Rotation matrix ───
mat2 svRot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

// ─── Vortex funnel SDF ───
// Inverted cone with noise displacement and spiral twist
float svVortex(vec3 p, float twist, float bassW, float tighten) {
  // Cylindrical coords
  float radial = length(p.xz);
  float height = p.y;

  // Cone profile: wider at bottom, narrows toward top (inverted funnel)
  float coneRadius = mix(2.8, 0.3, clamp((height + 2.0) / 8.0, 0.0, 1.0));
  coneRadius *= (1.0 + bassW * 0.25);
  coneRadius *= mix(1.0, 0.6, tighten); // tension tightens

  // Spiral twist: rotate xz around y-axis based on height
  float twistAngle = height * (1.2 + twist * 0.8) + twist * 2.0;
  vec2 twisted = svRot(twistAngle) * p.xz;

  // Noise displacement for turbulent walls
  float wallNoise = fbm3(vec3(twisted * 0.8, height * 0.5 + twist * 0.3)) * 0.6;
  wallNoise += ridgedMultifractal(vec3(twisted * 0.4, height * 0.3 + twist * 0.15), 3, 2.2, 0.5) * 0.3;

  // Distance to cone wall (negative = inside)
  float d = radial - coneRadius - wallNoise * 0.8;
  return d;
}

// ─── Cloud density field ───
// Volumetric turbulent clouds surrounding the vortex
float svCloud(vec3 p, float flowT, float bassDensity, float turbulence) {
  // Wind advection
  vec3 wp = p;
  wp.xz += vec2(sin(flowT * 0.2), cos(flowT * 0.15)) * 0.8;

  // Ridged multifractal for aggressive turbulent structure
  float density = ridgedMultifractal(wp * 0.25 + flowT * 0.04, 5, 2.1, 0.55);

  // Additional fbm layer for softer billowing
  density += fbm(wp * 0.4 + flowT * 0.06) * 0.4;

  // Bass thickens clouds
  density *= (0.6 + bassDensity * 0.6);

  // Turbulence from energy increases detail
  density += turbulence * fbm3(wp * 0.8 + flowT * 0.1) * 0.3;

  // Altitude masking: clouds exist in a band around the vortex
  float altMask = smoothstep(-3.0, -1.0, p.y) * smoothstep(6.0, 4.0, p.y);
  density *= altMask;

  // Vortex proximity: clouds thin near center, dense at walls
  float radial = length(p.xz);
  float vortexMask = smoothstep(0.5, 2.0, radial);
  density *= vortexMask;

  return clamp(density, 0.0, 1.0);
}

// ─── Lightning bolt SDF (branching) ───
// Creates a jagged branching bolt from top to bottom
float svLightning(vec3 p, float seed, float intensity) {
  if (intensity < 0.01) return 100.0;

  // Main bolt path: zigzag in xz plane descending along y
  float d = 100.0;
  vec3 boltP = p;
  float segLen = 0.8;
  float width = 0.04 + intensity * 0.03;
  float branchSeed = seed;

  // 6 segments of the main bolt
  vec3 prevPt = vec3(
    svHash(seed * 13.7) * 1.5 - 0.75,
    4.0,
    svHash(seed * 23.1) * 1.5 - 0.75
  );

  for (int seg = 0; seg < 6; seg++) {
    float fs = float(seg);
    branchSeed = svHash(branchSeed * 7.13 + fs * 3.17);
    float bx = (svHash(branchSeed * 11.3) - 0.5) * 1.8;
    float bz = (svHash(branchSeed * 17.9) - 0.5) * 1.8;
    vec3 nextPt = vec3(
      prevPt.x + bx * 0.6,
      prevPt.y - segLen - svHash(branchSeed * 5.3) * 0.4,
      prevPt.z + bz * 0.6
    );

    // Capsule SDF between prevPt and nextPt
    vec3 pa = boltP - prevPt;
    vec3 ba = nextPt - prevPt;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float segD = length(pa - ba * h) - width * (1.0 - fs * 0.1);
    d = min(d, segD);

    // Branch at some segments
    if (svHash(branchSeed * 31.7) > 0.45) {
      float brAngle = (svHash(branchSeed * 41.3) - 0.5) * 2.5;
      vec3 brEnd = mix(prevPt, nextPt, 0.5);
      brEnd.x += cos(brAngle) * 1.2;
      brEnd.z += sin(brAngle) * 1.2;
      brEnd.y -= 0.6;
      vec3 brPa = boltP - mix(prevPt, nextPt, 0.4);
      vec3 brBa = brEnd - mix(prevPt, nextPt, 0.4);
      float brH = clamp(dot(brPa, brBa) / dot(brBa, brBa), 0.0, 1.0);
      float brD = length(brPa - brBa * brH) - width * 0.5;
      d = min(d, brD);
    }

    prevPt = nextPt;
  }

  return d;
}

// ─── Debris SDF (rotating octahedra caught in wind) ───
float svDebris(vec3 p, float flowT, float energy, float count) {
  float d = 100.0;
  int numDebris = int(3.0 + count * 8.0);

  for (int i = 0; i < 11; i++) {
    if (i >= numDebris) break;
    float fi = float(i);
    float seed1 = svHash(fi * 17.3 + 5.7);
    float seed2 = svHash(fi * 23.1 + 11.3);
    float seed3 = svHash(fi * 31.7 + 7.1);

    // Spiral orbit around vortex axis
    float orbitR = 0.8 + seed1 * 2.5;
    float orbitSpeed = (0.5 + seed2 * 1.5) * (1.0 + energy * 0.8);
    float orbitAngle = flowT * orbitSpeed + fi * TAU / 11.0;
    float orbitY = -1.0 + seed3 * 6.0 + sin(flowT * 0.5 + fi) * 0.8;

    vec3 debrisPos = vec3(
      cos(orbitAngle) * orbitR,
      orbitY,
      sin(orbitAngle) * orbitR
    );

    vec3 dp = p - debrisPos;

    // Rotate the debris piece
    dp.xy = svRot(flowT * (1.0 + seed1 * 2.0)) * dp.xy;
    dp.yz = svRot(flowT * (0.8 + seed2 * 1.5)) * dp.yz;

    // Octahedron SDF
    vec3 ap = abs(dp);
    float size = 0.03 + seed1 * 0.05;
    float oct = (ap.x + ap.y + ap.z - size) * 0.57735;
    d = min(d, oct);
  }
  return d;
}

// ─── Rain streaks (elongated particles at angle) ───
float svRain(vec3 p, float flowT) {
  // Tile space for repeating rain
  vec3 rp = p;
  rp.y = mod(rp.y + flowT * 8.0, 3.0) - 1.5;
  rp.xz = mod(rp.xz + 0.75, 1.5) - 0.75;

  // Angle the rain with wind
  rp.x += rp.y * 0.3;
  rp.z += rp.y * 0.15;

  // Elongated capsule (tall, thin)
  float streak = length(vec2(length(rp.xz), max(abs(rp.y) - 0.15, 0.0))) - 0.005;
  return streak;
}

// ─── Combined scene SDF for raymarching ───
float svMap(vec3 p, float flowT, float bass, float energy, float tighten, float climB) {
  float twist = flowT * (0.4 + energy * 0.6);

  // Vortex funnel walls
  float vortex = svVortex(p, twist, bass, tighten);

  // Ground plane far below
  float ground = p.y + 3.0 + bass * 0.3;

  // Debris
  float debris = svDebris(p, flowT, energy, energy);

  // Combine
  float d = vortex;
  d = min(d, ground);
  d = min(d, debris);

  // Climax: vortex descends, ground rises
  if (climB > 0.1) {
    d = min(d, vortex - climB * 0.3);
  }

  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Audio clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOn = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float timbralFlux = clamp(uTimbralFlux, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Climax ───
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climB = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // ─── Flow time: storm movement speed ───
  float flowT = uDynamicTime * (0.15 + slowE * 0.12)
              * (1.0 + sJam * 0.5)
              * mix(1.0, 0.3, sSpace)
              * (1.0 + climB * 0.3);

  // ─── Palette: ominous storm colors ───
  float h1 = uPalettePrimary;
  vec3 stormCol = paletteHueColor(h1, 0.6, 0.85);
  // Desaturate toward dark grey-blue
  float stormLum = dot(stormCol, vec3(0.299, 0.587, 0.114));
  stormCol = mix(vec3(stormLum), stormCol, 0.35 + tension * 0.3);
  // Tension shifts toward ominous green/purple tornado warning colors
  vec3 warningGreen = vec3(0.15, 0.35, 0.12);
  vec3 warningPurple = vec3(0.25, 0.1, 0.35);
  vec3 warningCol = mix(warningGreen, warningPurple, sin(flowT * 0.2) * 0.5 + 0.5);
  stormCol = mix(stormCol, warningCol, tension * 0.5);

  float h2 = uPaletteSecondary;
  vec3 lightCol = paletteHueColor(h2, 0.85, 0.95);
  lightCol = mix(lightCol, vec3(0.9, 0.92, 1.0), 0.5); // push lightning toward blue-white

  // ─── Camera: inside the storm, looking up at the vortex ───
  float camSway = flowT * 0.15;
  vec3 ro = vec3(
    sin(camSway) * 0.3 + sin(flowT * 0.07) * 0.15,
    -0.5 + vocalP * 1.5 + sSpace * 2.0, // vocal presence lifts view toward calm eye
    cos(camSway) * 0.3
  );
  // Look up toward the vortex eye, with slow wander
  vec3 lookAt = vec3(
    sin(flowT * 0.05) * 0.2,
    3.5 + vocalP * 1.0,
    cos(flowT * 0.04) * 0.2
  );
  vec3 fw = normalize(lookAt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 upVec = cross(fw, ri);
  float fov = 0.75 + energy * 0.30 + climB * 0.2;
  vec3 rd = normalize(p.x * ri + p.y * upVec + fov * fw);

  // ─── Rotation speed from energy + section ───
  float rotSpeed = 0.4 + energy * 0.6 + sJam * 0.4 - sSpace * 0.3 + climB * 0.3;
  float twist = flowT * rotSpeed;

  // ─── Lightning state ───
  // Drum onset triggers flash; decays quickly
  float lightningFlash = drumOn;
  float lightningBrightness = pow(lightningFlash, 0.5) * 2.0;
  // Thunder rumble from beat snap
  float thunderPulse = uBeatSnap * 0.15;

  // Generate lightning bolt seed from musical time
  float boltSeed = floor(uMusicalTime * 2.0 + uSectionIndex * 100.0);
  float boltSeed2 = floor(uMusicalTime * 2.0 + uSectionIndex * 100.0 + 47.0);

  // ═══════════════════════════════════════════
  // VOLUMETRIC CLOUD RAYMARCH (primary pass)
  // ═══════════════════════════════════════════
  int maxSteps = int(mix(28.0, 96.0, energy)) + int(sJam * 12.0) - int(sSpace * 10.0);
  float stepSize = 0.16 - energy * 0.03;

  vec3 cloudAccum = vec3(0.0);
  float cloudAlpha = 0.0;
  float marchDist = 0.0;
  bool surfaceFound = false;
  vec3 surfacePos = ro;
  float totalDist = 0.0;

  for (int i = 0; i < 96; i++) {
    if (i >= maxSteps) break;
    float fi = float(i);
    float marchT = 0.3 + fi * stepSize;
    vec3 pos = ro + rd * marchT;
    totalDist = marchT;

    // Cloud density at this position
    float density = svCloud(pos, flowT, bass, energy + sJam * 0.3);

    // Drum onset injects density spikes
    density += drumOn * 0.4 * exp(-fi * 0.08);

    // Space section thins clouds dramatically
    density *= mix(1.0, 0.2, sSpace);

    // Climax thickens walls, thins eye
    float radial = length(pos.xz);
    float eyeThin = smoothstep(1.5, 0.3, radial) * climB * 0.5;
    density *= (1.0 + climB * 0.3 - eyeThin);

    // STORM BRIGHTNESS REWRITE: previous values (density *= 0.055,
    // cloudColor 0.35→0.08) rendered the storm essentially black. Lifted by
    // ~3x so the volumetric clouds are actually visible against the dark sky.
    density *= 0.18;

    if (density > 0.001) {
      float alpha = density * (1.0 - cloudAlpha);

      // Depth color: near is lighter, far is darker
      float depthFade = fi / float(maxSteps);
      vec3 cloudColor = mix(stormCol * 1.1, stormCol * 0.35, depthFade);

      // Lightning illumination: flash lights up cloud interiors
      if (lightningFlash > 0.05) {
        // Lightning bolt proximity
        float boltD1 = svLightning(pos, boltSeed, lightningFlash);
        float boltD2 = svLightning(pos, boltSeed2, lightningFlash * 0.6);
        float boltProx = 1.0 / (1.0 + boltD1 * boltD1 * 2.0);
        boltProx += 0.5 / (1.0 + boltD2 * boltD2 * 3.0);
        vec3 flashColor = mix(lightCol, vec3(1.0), 0.7);
        cloudColor += flashColor * boltProx * lightningBrightness * 1.5;

        // Global internal illumination from flash
        cloudColor += vec3(0.6, 0.65, 0.8) * lightningFlash * 0.3 * density * 3.0;
      }

      // Forward scatter toward storm eye (light from above)
      float scatter = max(0.0, rd.y) * 0.15;
      cloudColor += stormCol * 0.5 * scatter;

      // Timbral flux adds flickering brightness variation
      cloudColor *= (1.0 + timbralFlux * 0.2 * sin(fi * 3.7 + flowT * 5.0));

      cloudAccum += cloudColor * alpha;
      cloudAlpha += alpha;
    }

    // Early termination
    if (cloudAlpha > 0.95) break;
  }

  // ═══════════════════════════════════════════
  // VORTEX WALL GEOMETRY RAYMARCH
  // ═══════════════════════════════════════════
  float wallDist = 0.0;
  vec3 wallPos = ro;
  bool wallFound = false;
  for (int i = 0; i < 60; i++) {
    vec3 ps = ro + rd * wallDist;
    float vd = svVortex(ps, twist, bass, tension);
    // Also march against ground
    float gd = ps.y + 3.0;
    float d = min(abs(vd), gd);
    if (d < 0.005) { wallPos = ps; wallFound = true; break; }
    if (wallDist > 14.0) break;
    wallDist += max(d * 0.6, 0.02);
  }

  vec3 col = cloudAccum;

  // Vortex wall shading (behind clouds)
  if (wallFound && wallDist < totalDist * 1.2) {
    vec2 eps2 = vec2(0.003, 0.0);
    float base = svVortex(wallPos, twist, bass, tension);
    vec3 wallNorm = normalize(vec3(
      svVortex(wallPos + eps2.xyy, twist, bass, tension) - base,
      svVortex(wallPos + eps2.yxy, twist, bass, tension) - base,
      svVortex(wallPos + eps2.yyx, twist, bass, tension) - base
    ));

    // Dramatic top-down lighting
    vec3 lightDir = normalize(vec3(0.2, 0.8, 0.3));
    float diff = max(dot(wallNorm, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, wallNorm), -rd), 0.0), 16.0);
    float fresnel = pow(1.0 - max(dot(wallNorm, -rd), 0.0), 3.0);

    // Brightened wall lighting (was 0.08 * (0.05 + diff*0.3) which crushed
    // the vortex walls to black even when they were directly hit by rays).
    vec3 wallColor = stormCol * 0.45 * (0.18 + diff * 0.7);
    wallColor += lightCol * spec * 0.18;
    wallColor += stormCol * 0.6 * fresnel * 0.25;

    // Lightning illuminates walls
    if (lightningFlash > 0.05) {
      float boltD = svLightning(wallPos, boltSeed, lightningFlash);
      float boltGlow = 1.0 / (1.0 + boltD * boltD * 1.5);
      wallColor += mix(lightCol, vec3(1.0), 0.6) * boltGlow * lightningBrightness * 0.8;
    }

    // Depth fog on walls
    float wallFog = exp(-wallDist * 0.15);
    wallColor *= wallFog;

    // Blend behind clouds
    col = mix(wallColor, col, cloudAlpha);
  }

  // ═══════════════════════════════════════════
  // EYE OF THE STORM (clear sky / stars through top)
  // ═══════════════════════════════════════════
  if (cloudAlpha < 0.9 && rd.y > 0.0) {
    // Sky gradient: dark storm to clearer sky at vortex eye.
    // Brightened from previous near-black so the storm has a visible backdrop.
    float skyGrad = smoothstep(-0.1, 0.8, rd.y);
    vec3 skyHigh = mix(vec3(0.18, 0.22, 0.34), stormCol * 0.5, 0.4);
    vec3 skyLow  = mix(vec3(0.10, 0.12, 0.18), stormCol * 0.35, 0.4);
    vec3 skyColor = mix(skyLow, skyHigh, skyGrad);

    // Vocal presence reveals the calm eye
    float eyeReveal = vocalP * 0.6 + sSpace * 0.4;
    skyColor = mix(skyColor, vec3(0.30, 0.35, 0.55), eyeReveal * skyGrad);

    // Stars visible through the eye at high vocal presence
    if (eyeReveal > 0.15) {
      vec3 starGrid = floor(rd * 60.0);
      float starH = svHash2(starGrid.xy + starGrid.z * 13.7);
      float starBright = step(0.92, starH) * smoothstep(0.06, 0.01, length(fract(rd * 60.0).xy - 0.5));
      skyColor += vec3(0.8, 0.85, 1.0) * starBright * eyeReveal * 0.6;
    }

    // Blend sky behind everything
    col = mix(skyColor, col, cloudAlpha);
  }

  // Ground plane (barely visible through murk)
  if (cloudAlpha < 0.85 && rd.y < -0.1) {
    float groundT = (-3.0 - ro.y) / rd.y;
    if (groundT > 0.0 && groundT < 12.0) {
      vec3 gPos = ro + rd * groundT;
      float groundFog = exp(-groundT * 0.3);
      // Sparse ground: dark earth with noise texture
      float groundNoise = fbm3(vec3(gPos.xz * 0.5, flowT * 0.05));
      vec3 groundColor = vec3(0.03, 0.025, 0.02) * (0.5 + groundNoise * 0.5);

      // Lightning illuminates ground dramatically
      if (lightningFlash > 0.1) {
        groundColor += vec3(0.3, 0.32, 0.4) * lightningFlash * groundFog;
      }

      col = mix(col, groundColor * groundFog, (1.0 - cloudAlpha) * 0.4);
    }
  }

  // ═══════════════════════════════════════════
  // LIGHTNING BOLT SDF RENDERING (in front of everything)
  // ═══════════════════════════════════════════
  if (lightningFlash > 0.05) {
    // March a few samples along the ray to find bolt proximity
    float boltBrightness = 0.0;
    for (int lb = 0; lb < 8; lb++) {
      float lbt = 0.5 + float(lb) * 1.2;
      vec3 lbp = ro + rd * lbt;
      float bd1 = svLightning(lbp, boltSeed, lightningFlash);
      float bd2 = svLightning(lbp, boltSeed2, lightningFlash * 0.7);

      // Crisp core + wide glow
      float core1 = smoothstep(0.06, 0.0, bd1) * 2.0;
      float glow1 = 1.0 / (1.0 + bd1 * bd1 * 40.0);
      float core2 = smoothstep(0.08, 0.0, bd2) * 1.2;
      float glow2 = 1.0 / (1.0 + bd2 * bd2 * 60.0);

      float depth = exp(-lbt * 0.12);
      boltBrightness += (core1 + glow1 * 0.5 + core2 + glow2 * 0.3) * depth;
    }
    boltBrightness *= lightningBrightness * 0.3;

    // Lightning color: blue-white core, purple-blue fringe
    vec3 boltColor = mix(vec3(0.7, 0.75, 1.0), vec3(1.0, 0.98, 1.0), min(boltBrightness, 1.0));
    col += boltColor * boltBrightness;

    // Full-scene flash: brief white-out that illuminates everything
    float fullFlash = pow(lightningFlash, 2.0) * 0.25;
    col += vec3(0.4, 0.42, 0.55) * fullFlash;
  }

  // ═══════════════════════════════════════════
  // RAIN STREAKS
  // ═══════════════════════════════════════════
  {
    float rainBrightness = 0.0;
    for (int rs = 0; rs < 4; rs++) {
      float rst = 0.2 + float(rs) * 0.8;
      vec3 rsp = ro + rd * rst;
      float rainD = svRain(rsp, flowT);
      rainBrightness += smoothstep(0.02, 0.0, rainD) * exp(-rst * 0.4);
    }
    // Rain is only subtly visible, brighter during lightning
    float rainVis = 0.03 + lightningFlash * 0.15;
    col += vec3(0.5, 0.55, 0.65) * rainBrightness * rainVis * (0.5 + energy * 0.5);
  }

  // ═══════════════════════════════════════════
  // GOD RAYS through storm breaks
  // ═══════════════════════════════════════════
  {
    vec3 sunDir = normalize(vec3(0.3, 0.9, 0.2));
    float rayAccum = 0.0;
    for (int gr = 0; gr < 8; gr++) {
      float grt = 0.3 + float(gr) * 0.9;
      vec3 grp = ro + rd * grt;
      // Check cloud density along sun direction
      float shadowDensity = svCloud(grp + sunDir * 0.6, flowT, bass, energy);
      float cloudHere = svCloud(grp, flowT, bass, energy);
      // Ray visible where cloud thins but nearby clouds cast light
      float inscatter = cloudHere * exp(-shadowDensity * 5.0);
      rayAccum += inscatter * 0.04;
    }
    // Henyey-Greenstein phase function
    float sunDot = dot(rd, sunDir);
    float gParam = 0.7;
    float phase = (1.0 - gParam * gParam) / (4.0 * PI * pow(1.0 + gParam * gParam - 2.0 * gParam * sunDot, 1.5));
    vec3 rayColor = mix(vec3(0.6, 0.55, 0.4), lightCol * 0.5, 0.3);
    col += rayColor * rayAccum * phase * (0.4 + energy * 0.8 + climB * 0.6) * mix(1.0, 0.2, sSpace);
  }

  // ═══════════════════════════════════════════
  // ATMOSPHERIC SCATTERING (blue-grey volumetric fog)
  // ═══════════════════════════════════════════
  {
    float fogDensity = 0.08 + bass * 0.12 + energy * 0.02;
    vec3 fogColor = mix(vec3(0.06, 0.07, 0.1), stormCol * 0.15, 0.4);
    float fogAmount = 1.0 - exp(-totalDist * fogDensity * 0.1);
    col = mix(col, fogColor, fogAmount * 0.3);
  }

  // ─── Thunder rumble: beat snap brightness pulse ───
  col *= 1.0 + thunderPulse * (1.0 + climB * 0.5);

  // ─── Beat snap accent ───
  col *= 1.0 + uBeatSnap * 0.08;

  // ─── Climax intensification ───
  if (climB > 0.1) {
    // Overall brightness surge
    col *= 1.0 + climB * 0.35;
    // Vortex rotation visible as color intensity
    col += stormCol * 0.04 * climB;
    // Dynamic range pushes extremes
    col *= 1.0 + dynRange * climB * 0.15;
  }

  // ─── Vignette (heavy, storm-like) ───
  {
    float vig = 1.0 - dot(p * 0.75, p * 0.75);
    vig = smoothstep(0.0, 1.0, vig);
    col = mix(vec3(0.01, 0.01, 0.015), col, vig);
  }

  // ─── Brightness floor: storms are never pitch-black ───
  col = max(col, vec3(0.015, 0.013, 0.02));

  // ─── Dead Iconography ───
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, uBass, stormCol, lightCol, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, stormCol, lightCol, _nf, uSectionIndex);

  // ─── Post Process ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
