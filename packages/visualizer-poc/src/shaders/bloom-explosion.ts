/**
 * Bloom Explosion — raymarched magnolia blossom SDF for "Sugar Magnolia" /
 * "Sunshine Daydream". Pure joy, love, celebration in shader form.
 *
 * Central magnolia blossom: 8+ petal layers arranged on Fibonacci golden-angle
 * spirals unfurling from bud to full bloom. Stamen/pistil cluster at center.
 * Pollen particles burst outward on drum onsets. Sunshine volumetric god rays
 * from behind/above. Secondary flowers at varying distances. Green leaves.
 *
 * The Sunshine Daydream coda (climax): the flower EXPLODES — petals fly outward
 * in a spiral storm, sunshine floods everything, pure white-gold ecstasy.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass              -> flower breathing (scale pulse)
 *   uEnergy            -> bloom state (bud -> full -> explosion)
 *   uDrumOnset         -> pollen burst
 *   uVocalPresence     -> sunshine intensity
 *   uHarmonicTension   -> petal curl (relaxed -> tight)
 *   uMelodicPitch      -> flower height
 *   uSectionType       -> jam=petals spiral fractally, space=single bud,
 *                          chorus=FULL BLOOM
 *   uClimaxPhase       -> SUNSHINE DAYDREAM EXPLOSION
 *   uBeatSnap          -> sunshine flash
 *   uSemanticTriumphant -> joy multiplier
 *   uSlowEnergy        -> drift speed
 *   uClimaxIntensity   -> explosion force
 *   uBeatStability     -> petal symmetry
 *   uDynamicRange      -> contrast in petal layers
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const bloomExplosionVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  halationEnabled: true,
  caEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
  grainStrength: "light",
});

export const bloomExplosionFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define GOLDEN_ANGLE 2.39996323 // 137.5 degrees in radians
#define PHI 1.61803399

// ─── SDF Primitives ───

float beSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float beEllipsoid(vec3 pos, vec3 radii) {
  float k0 = length(pos / radii);
  float k1 = length(pos / (radii * radii));
  return k0 * (k0 - 1.0) / k1;
}

float beCylinder(vec3 pos, float radius, float halfHeight) {
  vec2 d = abs(vec2(length(pos.xz), pos.y)) - vec2(radius, halfHeight);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float beCapsule(vec3 pos, vec3 a, vec3 b, float radius) {
  vec3 pa = pos - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - radius;
}

// Smooth min for organic SDF blending
float beSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Petal SDF ───
// Elongated ellipsoid with curvature, curling based on harmonic tension.
// petalPhase: 0=closed bud, 1=full bloom, 2+=explosion
float bePetal(vec3 pos, float petalAngle, float petalRing, float petalPhase,
              float curlAmount, float explodeForce, float flowTime) {
  // Golden angle rotation for Fibonacci arrangement
  float angle = petalAngle * GOLDEN_ANGLE + petalRing * 0.618;
  float ca = cos(angle);
  float sa = sin(angle);

  // Rotate into petal local space
  vec3 lp = pos;
  lp.xz = vec2(ca * pos.x + sa * pos.z, -sa * pos.x + ca * pos.z);

  // Unfurl: petal tips lift outward and upward as petalPhase increases
  float unfurl = clamp(petalPhase - petalRing * 0.15, 0.0, 1.0);
  float petalLength = 0.25 + petalRing * 0.08;
  float petalReach = petalLength * unfurl;

  // Petal center position: radiates outward, lifts with bloom
  float radialDist = 0.08 + petalRing * 0.06 + petalReach * 0.6;
  float liftAngle = mix(1.2, 0.15, unfurl) - curlAmount * 0.4;

  // During explosion, petals fly outward in spiral
  float explodeDist = explodeForce * (0.8 + petalRing * 0.3);
  float explodeSpin = explodeForce * 3.0 * (1.0 + sin(petalAngle * 3.0) * 0.5);
  float explodeTumble = explodeForce * 2.0;

  // Petal pivot point
  vec3 petalCenter = vec3(
    (radialDist + explodeDist) * cos(liftAngle + explodeTumble * 0.3),
    (radialDist + explodeDist) * sin(liftAngle) + explodeDist * 0.5,
    explodeDist * sin(explodeSpin) * 0.3
  );

  // Additional spin during explosion
  if (explodeForce > 0.01) {
    float spinA = explodeSpin;
    float cs = cos(spinA);
    float ss = sin(spinA);
    vec3 offset = lp - petalCenter;
    offset.xy = vec2(cs * offset.x - ss * offset.y, ss * offset.x + cs * offset.y);
    lp = petalCenter + offset;
  }

  vec3 petalPos = lp - petalCenter;

  // Petal shape: flattened elongated ellipsoid with taper
  float petalWidth = (0.04 + petalRing * 0.015) * (1.0 + unfurl * 0.3);
  float petalThick = 0.012 + petalRing * 0.003;
  petalLength *= (0.3 + unfurl * 0.7);

  // Curl: tip curves inward based on tension
  float tipCurl = curlAmount * 0.6 * max(0.0, petalPos.x - petalLength * 0.3);
  petalPos.y += tipCurl * tipCurl * 8.0;

  // Taper: narrower at tip
  float taper = 1.0 - smoothstep(0.0, petalLength, petalPos.x) * 0.5;

  return beEllipsoid(petalPos, vec3(petalLength, petalThick, petalWidth * taper));
}

// ─── Stamen SDF ───
// Cluster of thin filaments with anthers at tips
float beStamen(vec3 pos, float energy, float flowTime) {
  float d = 1e10;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float stAngle = fi * GOLDEN_ANGLE * 0.7;
    float stHeight = 0.08 + fi * 0.008 + energy * 0.02;
    float stRadius = 0.015 + fi * 0.004;

    vec3 stBase = vec3(cos(stAngle) * stRadius, 0.0, sin(stAngle) * stRadius);
    vec3 stTip = vec3(
      cos(stAngle + flowTime * 0.3) * stRadius * 1.3,
      stHeight + sin(flowTime * 0.5 + fi) * 0.01,
      sin(stAngle + flowTime * 0.3) * stRadius * 1.3
    );

    // Filament
    float filament = beCapsule(pos, stBase, stTip, 0.003);
    // Anther (pollen sac) at tip
    float anther = beSphere(pos - stTip, 0.008 + energy * 0.004);
    d = min(d, min(filament, anther));
  }
  return d;
}

// ─── Pollen Particle SDF ───
// Golden sphere particles bursting outward from center on drum onset
float bePollen(vec3 pos, float drumOnset, float flowTime, float energy) {
  float d = 1e10;
  float burstStr = drumOnset * 2.0 + energy * 0.3;
  if (burstStr < 0.01) return d;

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = fi * 7.31 + 3.17;
    float pAngle = fi * GOLDEN_ANGLE;
    float pPhi = acos(1.0 - 2.0 * fract(sin(seed) * 43758.5453));

    // Burst outward from center with gravity
    float burstDist = burstStr * (0.15 + fract(sin(seed * 2.71) * 12345.6) * 0.3);
    float gravity = burstDist * burstDist * 0.4;

    vec3 pDir = vec3(
      sin(pPhi) * cos(pAngle),
      sin(pPhi) * sin(pAngle) - gravity,
      cos(pPhi)
    );

    vec3 pPos = pDir * burstDist;
    float pRadius = 0.006 + energy * 0.003;
    // Pollen fades with distance
    float fade = smoothstep(0.6, 0.0, burstDist);
    d = min(d, beSphere(pos - pPos, pRadius * fade));
  }
  return d;
}

// ─── Leaf SDF ───
float beLeaf(vec3 pos, float leafAngle, float stemHeight) {
  float ca = cos(leafAngle);
  float sa = sin(leafAngle);
  vec3 lp = pos;
  lp.xz = vec2(ca * pos.x + sa * pos.z, -sa * pos.x + ca * pos.z);

  // Leaf attaches partway up stem
  lp.y -= stemHeight * 0.4;
  lp.x -= 0.06;

  // Leaf shape: thin flat ellipsoid angled outward
  float tilt = 0.5;
  float ct = cos(tilt);
  float st = sin(tilt);
  float tmpY = lp.y;
  lp.y = ct * tmpY - st * lp.x;
  lp.x = st * tmpY + ct * lp.x;

  return beEllipsoid(lp, vec3(0.12, 0.005, 0.04));
}

// ─── Stem SDF ───
float beStem(vec3 pos, float stemHeight) {
  return beCylinder(pos - vec3(0.0, stemHeight * 0.5, 0.0), 0.012, stemHeight * 0.5);
}

// ─── Full Flower Map ───
// Returns vec2: x=distance, y=material ID (0=petal, 1=stamen, 2=pollen, 3=stem, 4=leaf)
vec2 beFlowerMap(vec3 pos, float bloomState, float curlAmount, float explodeForce,
                 float drumOnset, float energy, float flowTime, float stemHeight) {
  // Raise flower to stem height
  vec3 flowerPos = pos - vec3(0.0, stemHeight, 0.0);

  float petalDist = 1e10;

  // 3 rings of petals, 8 petals per ring = 24 petals
  for (int ring = 0; ring < 3; ring++) {
    float fRing = float(ring);
    for (int pIdx = 0; pIdx < 8; pIdx++) {
      float fPetal = float(pIdx) + fRing * 8.0;
      float pd = bePetal(flowerPos, fPetal, fRing, bloomState, curlAmount,
                         explodeForce, flowTime);
      petalDist = min(petalDist, pd);
    }
  }

  // Stamen cluster
  float stamenDist = beStamen(flowerPos, energy, flowTime);

  // Pollen burst
  float pollenDist = bePollen(flowerPos, drumOnset, flowTime, energy);

  // Stem
  float stemDist = beStem(pos, stemHeight);

  // Leaves
  float leafDist = min(
    beLeaf(pos, 0.8, stemHeight),
    beLeaf(pos, -1.2, stemHeight)
  );

  // Combine with material IDs
  vec2 result = vec2(petalDist, 0.0);
  if (stamenDist < result.x) result = vec2(stamenDist, 1.0);
  if (pollenDist < result.x) result = vec2(pollenDist, 2.0);
  if (stemDist < result.x) result = vec2(stemDist, 3.0);
  if (leafDist < result.x) result = vec2(leafDist, 4.0);

  return result;
}

// ─── Scene Map ───
// Main flower + secondary background flowers
vec2 beMap(vec3 pos, float bloomState, float curlAmount, float explodeForce,
           float drumOnset, float energy, float flowTime, float melodicPitch) {
  float stemHeight = 0.3 + melodicPitch * 0.15;

  // Main central flower
  vec2 d = beFlowerMap(pos, bloomState, curlAmount, explodeForce,
                       drumOnset, energy, flowTime, stemHeight);

  // Secondary flowers at varying distances (smaller, simpler)
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float secAngle = fi * GOLDEN_ANGLE * 2.0 + flowTime * 0.02;
    float secDist = 0.6 + fi * 0.35;
    float secScale = 0.4 + fi * 0.1;
    vec3 secOffset = vec3(cos(secAngle) * secDist, -0.1 - fi * 0.05,
                          sin(secAngle) * secDist);
    vec3 secPos = (pos - secOffset) / secScale;
    float secBloom = bloomState * (0.6 + fi * 0.1);

    // Simplified: only petals for background flowers (cheaper)
    float secPetalDist = 1e10;
    float secStemH = 0.2 + melodicPitch * 0.08;
    vec3 secFlowerPos = secPos - vec3(0.0, secStemH, 0.0);
    for (int ring = 0; ring < 2; ring++) {
      float fRing = float(ring);
      for (int pIdx = 0; pIdx < 6; pIdx++) {
        float fPetal = float(pIdx) + fRing * 6.0;
        float pd = bePetal(secFlowerPos, fPetal, fRing, secBloom,
                           curlAmount * 0.5, explodeForce * 0.3, flowTime);
        secPetalDist = min(secPetalDist, pd);
      }
    }
    secPetalDist *= secScale; // scale back to world space
    float secStem = beStem(secPos, secStemH) * secScale;

    if (secPetalDist < d.x) d = vec2(secPetalDist, 0.0);
    if (secStem < d.x) d = vec2(secStem, 3.0);
  }

  return d;
}

// ─── Normal Estimation ───
vec3 beNormal(vec3 pos, float bloomState, float curlAmount, float explodeForce,
              float drumOnset, float energy, float flowTime, float melodicPitch) {
  vec2 offset = vec2(0.002, 0.0);
  float base = beMap(pos, bloomState, curlAmount, explodeForce, drumOnset,
                     energy, flowTime, melodicPitch).x;
  return normalize(vec3(
    beMap(pos + offset.xyy, bloomState, curlAmount, explodeForce, drumOnset,
          energy, flowTime, melodicPitch).x - base,
    beMap(pos + offset.yxy, bloomState, curlAmount, explodeForce, drumOnset,
          energy, flowTime, melodicPitch).x - base,
    beMap(pos + offset.yyx, bloomState, curlAmount, explodeForce, drumOnset,
          energy, flowTime, melodicPitch).x - base
  ));
}

// ─── Sunshine Volumetrics ───
// God rays from behind/above the flower, intensity driven by vocal presence
float beSunRays(vec3 ro, vec3 rd, vec3 sunPos, float vocalPresence, float energy,
                float climaxBoost) {
  float godRayAccum = 0.0;
  vec3 sunDir = normalize(sunPos - ro);
  float sunDot = dot(rd, sunDir);

  // Henyey-Greenstein phase function (forward scatter g=0.82 for strong sun streaks)
  float g = 0.82;
  float phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * sunDot, 1.5));

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float stepDist = 0.3 + fi * 0.5;
    vec3 samplePos = ro + rd * stepDist;

    // Atmospheric density with noise
    float density = fbm3(samplePos * 0.8 + vec3(0.0, 0.0, fi * 0.3)) * 0.3 + 0.15;

    // Light absorption toward sun
    vec3 toSun = normalize(sunPos - samplePos);
    float lightOcclusion = fbm3((samplePos + toSun * 0.5) * 0.6) * 0.5;
    float inscatter = density * exp(-lightOcclusion * 3.0);

    godRayAccum += inscatter * 0.04;
  }

  float sunIntensity = 0.5 + vocalPresence * 1.5 + energy * 0.5 + climaxBoost * 2.0;
  return godRayAccum * phase * sunIntensity;
}

// ─── Sunshine Halo ───
// Bright disc behind flower simulating direct sunlight
vec3 beSunDisc(vec3 rd, vec3 sunDir, float climaxBoost, float joyMult) {
  float sunDot = max(0.0, dot(rd, sunDir));

  // Sun disc: tight core + soft corona
  float core = pow(sunDot, 128.0) * (2.0 + climaxBoost * 4.0);
  float corona = pow(sunDot, 8.0) * (0.3 + climaxBoost * 1.5);
  float halo = pow(sunDot, 2.0) * (0.05 + climaxBoost * 0.3);

  // Warm sunshine colors with joy multiplier
  vec3 sunColor = vec3(1.0, 0.95, 0.7) * core
                + vec3(1.0, 0.85, 0.5) * corona
                + vec3(1.0, 0.8, 0.4) * halo;

  return sunColor * (1.0 + joyMult * 0.5);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float triumphant = clamp(uSemanticTriumphant, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === JOY MULTIPLIER ===
  // Sugar Magnolia is pure joy. Triumphant semantic + energy + chorus = MAXIMUM JOY
  float joyMult = triumphant * 0.5 + energy * 0.3 + sChorus * 0.3 + beatStab * 0.1;
  joyMult = clamp(joyMult, 0.0, 1.5);

  // === BLOOM STATE ===
  // 0=tight bud, 1=full bloom, 2+=explosion
  // Energy drives primary bloom. Section type overrides.
  float bloomState = energy * 1.2;
  bloomState = mix(bloomState, 0.2, sSpace);           // space: closed bud
  bloomState = mix(bloomState, 1.0, sChorus * 0.8);    // chorus: FULL BLOOM
  bloomState += sJam * 0.3;                             // jam: extra fractal spiral
  bloomState += sSolo * 0.15;                           // solo: dramatic partial bloom

  // === CLIMAX: SUNSHINE DAYDREAM EXPLOSION ===
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxIntensity;
  float explodeForce = climaxBoost * 1.5; // petals fly outward
  bloomState += climaxBoost * 1.0;        // force full bloom then explosion

  // === PETAL CURL ===
  // High tension = tight curl, relaxed = open flat
  float curlAmount = tension * 0.8 + (1.0 - energy) * 0.3;
  curlAmount *= (1.0 - climaxBoost * 0.8); // explosion relaxes all curl

  // === FLOW TIME ===
  float flowTime = uDynamicTime * (0.1 + slowE * 0.05) * (1.0 + sJam * 0.4 - sSpace * 0.3);

  // === PALETTE ===
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;
  float h1 = uPalettePrimary + chordHue;
  vec3 petalColor1 = paletteHueColor(h1, 0.7, 0.95);
  // Magnolia: warm pink-white-cream tones
  petalColor1 = mix(petalColor1, vec3(1.0, 0.88, 0.85), 0.3);
  // Joy boost: warmer, more saturated
  petalColor1 = mix(petalColor1, vec3(1.0, 0.7, 0.5), joyMult * 0.2);

  float h2 = uPaletteSecondary;
  vec3 petalColor2 = paletteHueColor(h2, 0.7, 0.95);
  petalColor2 = mix(petalColor2, vec3(1.0, 0.95, 0.8), 0.2);

  vec3 stamenColor = vec3(1.0, 0.85, 0.2); // golden yellow
  vec3 pollenColor = vec3(1.0, 0.92, 0.3);  // bright gold
  vec3 stemColor = vec3(0.2, 0.45, 0.15);   // deep green
  vec3 leafColor = vec3(0.25, 0.55, 0.18);  // leaf green

  // Dynamic range modulates petal layer contrast
  vec3 innerPetalTint = mix(petalColor1, vec3(1.0, 0.95, 0.9), dynRange * 0.3);

  // === CAMERA ===
  // Gentle orbit around the flower, closer during space, wider at climax
  float camDist = 1.2 - sSpace * 0.3 + climaxBoost * 0.6;
  float camAngle = flowTime * 0.15 + sJam * sin(flowTime * 0.3) * 0.2;
  float camHeight = 0.35 + melodicPitch * 0.2 + bass * 0.05;

  // Bass breathing: camera pulses closer on bass
  camDist -= bass * 0.08;

  vec3 ro = vec3(
    sin(camAngle) * camDist,
    camHeight + sin(flowTime * 0.2) * 0.05,
    cos(camAngle) * camDist
  );
  vec3 lookAt = vec3(0.0, 0.3 + melodicPitch * 0.1, 0.0);
  vec3 forward = normalize(lookAt - ro);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRight = normalize(cross(forward, worldUp));
  vec3 camUp = cross(camRight, forward);
  float fov = 0.8 + energy * 0.1 + climaxBoost * 0.2;
  vec3 rd = normalize(p.x * camRight + p.y * camUp + fov * forward);

  // === SUN POSITION ===
  // Behind and above the flower, rises with vocal presence and climax
  vec3 sunPos = vec3(
    sin(flowTime * 0.03) * 0.5,
    2.0 + vocalP * 1.0 + climaxBoost * 2.0,
    -2.0
  );
  vec3 sunDir = normalize(sunPos - ro);

  // === RAYMARCH ===
  float totalDist = 0.0;
  vec2 mapResult = vec2(1e10, -1.0);
  bool wasFound = false;
  int maxSteps = int(mix(48.0, 72.0, energy));

  for (int i = 0; i < 72; i++) {
    if (i >= maxSteps) break;
    vec3 marchPos = ro + rd * totalDist;
    mapResult = beMap(marchPos, bloomState, curlAmount, explodeForce,
                      drumOnset, energy, flowTime, melodicPitch);

    if (mapResult.x < 0.002) {
      wasFound = true;
      break;
    }
    if (totalDist > 6.0) break;
    totalDist += mapResult.x * 0.7;
  }

  vec3 col = vec3(0.0);

  if (wasFound) {
    vec3 marchPos = ro + rd * totalDist;
    float matId = mapResult.y;

    // Normal
    vec3 norm = beNormal(marchPos, bloomState, curlAmount, explodeForce,
                         drumOnset, energy, flowTime, melodicPitch);

    // Lighting: warm sunshine from above/behind
    vec3 lightDir = normalize(sunPos - marchPos);
    float diffuse = max(dot(norm, lightDir), 0.0);
    float specular = pow(max(dot(reflect(-lightDir, norm), -rd), 0.0), 16.0 + energy * 32.0);
    float fresnel = pow(1.0 - max(dot(norm, -rd), 0.0), 3.0);

    // Subsurface scattering for petals (light passes through thin petals)
    float sss = 0.0;
    if (matId < 0.5) {
      // Petal subsurface: light shining through
      float sssDot = max(0.0, dot(-rd, lightDir));
      sss = pow(sssDot, 3.0) * 0.6;
    }

    // Ambient occlusion (2-step)
    float ambOcc = 1.0;
    for (int j = 1; j <= 3; j++) {
      float occDist = beMap(marchPos + norm * 0.1 * float(j), bloomState, curlAmount,
                            explodeForce, drumOnset, energy, flowTime, melodicPitch).x;
      ambOcc -= (0.1 * float(j) - occDist) * (0.35 / float(j));
    }
    ambOcc = clamp(ambOcc, 0.2, 1.0);

    // Material color selection
    vec3 matColor;
    if (matId < 0.5) {
      // Petals: gradient from inner (white-cream) to outer (pink), with ring variation
      float depthFade = clamp(totalDist / 3.0, 0.0, 1.0);
      matColor = mix(innerPetalTint, petalColor1, depthFade * 0.5 + 0.3);
      matColor = mix(matColor, petalColor2, sin(marchPos.x * 20.0 + flowTime) * 0.15 + 0.15);
      // Climax: petals glow white-gold
      matColor = mix(matColor, vec3(1.0, 0.95, 0.8), climaxBoost * 0.6);
    } else if (matId < 1.5) {
      // Stamen: golden
      matColor = stamenColor * (1.0 + energy * 0.3);
    } else if (matId < 2.5) {
      // Pollen: bright gold particles
      matColor = pollenColor * (1.5 + drumOnset * 1.0);
    } else if (matId < 3.5) {
      // Stem: green
      matColor = stemColor;
    } else {
      // Leaf: green with slight variation
      matColor = leafColor + vec3(0.0, 0.05, 0.0) * sin(marchPos.y * 10.0);
    }

    // Compose lighting
    vec3 ambient = matColor * 0.08 * (1.0 + joyMult * 0.15);
    vec3 diffuseLight = matColor * diffuse * 0.55;
    vec3 specularLight = vec3(1.0, 0.95, 0.85) * specular * 0.25;
    vec3 fresnelLight = mix(petalColor1, vec3(1.0, 0.95, 0.9), 0.5) * fresnel * 0.15;
    vec3 sssLight = matColor * sss * vec3(1.0, 0.85, 0.7);

    col = (ambient + diffuseLight + specularLight + fresnelLight + sssLight) * ambOcc;

    // Depth fog: distant objects fade toward warm sky
    float fog = 1.0 - exp(-totalDist * 0.3);
    vec3 fogColor = vec3(0.9, 0.85, 0.7) * (0.1 + vocalP * 0.15 + climaxBoost * 0.3);
    col = mix(col, fogColor, fog);

  } else {
    // === SKY / BACKGROUND ===
    // Warm gradient: golden at horizon, deeper blue-purple above
    float skyGrad = smoothstep(-0.2, 0.8, rd.y);
    vec3 skyBottom = vec3(1.0, 0.85, 0.5) * (0.15 + vocalP * 0.1);
    vec3 skyTop = mix(vec3(0.2, 0.25, 0.45), vec3(0.4, 0.5, 0.7), energy * 0.5);
    col = mix(skyBottom, skyTop, skyGrad);

    // Background noise atmosphere
    float bgNoise = fbm3(vec3(rd.xy * 3.0, flowTime * 0.1));
    col += petalColor1 * bgNoise * 0.03 * energy;
  }

  // === SUNSHINE VOLUMETRIC GOD RAYS ===
  float sunRays = beSunRays(ro, rd, sunPos, vocalP, energy, climaxBoost);
  vec3 sunRayColor = mix(vec3(1.0, 0.9, 0.6), vec3(1.0, 0.95, 0.85), climaxBoost);
  col += sunRayColor * sunRays;

  // === SUN DISC ===
  col += beSunDisc(rd, sunDir, climaxBoost, joyMult);

  // === BEAT SNAP SUNSHINE FLASH ===
  // Quick white-gold flash on strong beats
  float sunFlash = beatSnap * (0.06 + climaxBoost * 0.15) * (1.0 + joyMult * 0.3);
  col += vec3(1.0, 0.95, 0.8) * sunFlash;

  // === JAM MODE: FRACTAL PETAL SPIRAL ===
  // During jams, add ghostly petal silhouettes spiraling in screen space
  if (sJam > 0.1) {
    float spiralAngle = atan(p.y, p.x);
    float spiralR = length(p);
    float spiralPattern = sin(spiralAngle * PHI * 5.0 - spiralR * 8.0 + flowTime * 2.0);
    spiralPattern = smoothstep(0.3, 0.9, spiralPattern);
    col += petalColor1 * spiralPattern * sJam * 0.08 * energy;
  }

  // === SUNSHINE DAYDREAM EXPLOSION EFFECTS ===
  if (climaxBoost > 0.1) {
    // Screen-space radial burst: white-gold rays exploding from center
    float burstAngle = atan(p.y, p.x);
    float burstR = length(p);
    float burstRays = sin(burstAngle * 13.0 + flowTime * 5.0) * 0.5 + 0.5;
    burstRays *= exp(-burstR * 2.0);
    col += vec3(1.0, 0.95, 0.75) * burstRays * climaxBoost * 0.4;

    // Petal storm: screen-space spinning petals everywhere
    float stormAngle = burstAngle + flowTime * 3.0 * climaxBoost;
    float petalStorm = sin(stormAngle * 8.0 + burstR * 15.0 - flowTime * 4.0);
    petalStorm = smoothstep(0.6, 0.95, petalStorm);
    float stormFade = exp(-burstR * 1.5) * (0.5 + 0.5 * sin(burstR * 20.0 - flowTime * 6.0));
    col += mix(petalColor1, petalColor2, sin(stormAngle * 3.0) * 0.5 + 0.5)
           * petalStorm * stormFade * climaxBoost * 0.3;

    // Total white-gold flood at peak climax — toned WAY down (was 0.35)
    // because it was washing the entire frame to flat warm cream during peaks.
    float floodGate = smoothstep(0.85, 1.0, climaxBoost);
    col = mix(col, vec3(1.0, 0.98, 0.9), floodGate * 0.08);
  }

  // === BASS BREATHING ===
  // Gentle brightness pulse with bass
  col *= 1.0 + bass * 0.08 * (1.0 + joyMult * 0.3);

  // === JOY GLOW ===
  // Triumphant semantic: warm golden overall lift
  if (joyMult > 0.2) {
    col += vec3(1.0, 0.9, 0.6) * (joyMult - 0.2) * 0.04;
  }

  // === BEAT STABILITY: SYMMETRY BOOST ===
  // High beat stability: petals more evenly lit (reduced harsh shadows)
  col = mix(col, col * 1.05, beatStab * 0.1);

  // === DEAD ICONOGRAPHY ===
  float noiseField = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, uBass, petalColor1, petalColor2,
                       noiseField, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, petalColor1, petalColor2,
                           noiseField, uSectionIndex);

  // === POST PROCESS ===
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
