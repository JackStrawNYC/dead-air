/**
 * Event Horizon — raymarched black hole with accretion disk,
 * gravitational lensing, Hawking radiation, and relativistic jets.
 * The definitive Dark Star shader. The black hole IS the music.
 *
 * Audio reactivity (17 uniforms — more than any other shader):
 *   uBass               → black hole mass/radius (bass IS gravity)
 *   uEnergy             → accretion disk brightness, jet intensity
 *   uDrumOnset          → Hawking radiation burst
 *   uVocalPresence      → photon sphere brightness
 *   uHarmonicTension    → gravitational lensing strength (tension bends space)
 *   uMelodicPitch       → accretion disk inner temperature (high=white-hot)
 *   uMelodicDirection   → spiral arm winding direction
 *   uSectionType        → jam=max lensing, space=pure void, chorus=disk flare
 *   uClimaxPhase        → singularity pulse (void breathes), jets erupt
 *   uBeatSnap           → accretion disk flash
 *   uSlowEnergy         → orbital camera speed
 *   uJamPhase           → exploration=wide orbit, building=falling in, peak=crossing, resolution=escape
 *   uSemanticCosmic     → overall cosmic intensity
 *   uSemanticPsychedelic → lensing distortion multiplier
 *   uImprovisationScore → chaos in accretion disk
 *   uSpaceScore         → void depth
 *   uDynamicRange       → contrast between void and disk
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const eventHorizonVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.2,
  caEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: false,
  eraGradingEnabled: true,
});

export const eventHorizonFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define EH_PI 3.14159265
#define EH_TAU 6.28318530
#define EH_MAX_STEPS 80
#define EH_MAX_DIST 40.0
#define EH_SURF_DIST 0.002

// ─── Rotation matrix ───
mat2 ehRot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

// ─── Hash for particle positions ───
float ehHash(vec3 p) {
  p = fract(p * vec3(443.897, 397.297, 491.187));
  p += dot(p.zxy, p.yxz + 19.19);
  return fract(p.x * p.y * p.z);
}

// ─── Black hole sphere SDF ───
float ehBlackHole(vec3 pos, float radius) {
  return length(pos) - radius;
}

// ─── Accretion disk density field ───
// Torus-shaped with logarithmic spiral arms, turbulence, and vertical thinness.
float ehDisk(vec3 pos, float innerR, float outerR, float spiralWind,
             float chaos, float flowTime) {
  // Cylindrical coordinates
  float r = length(pos.xz);
  float y = pos.y;

  // Radial falloff: smooth ring between inner and outer radii
  float radialMask = smoothstep(innerR, innerR + 0.3, r) *
                     smoothstep(outerR, outerR - 0.5, r);

  // Vertical thinness: disk is very flat, thickens with bass
  float diskThickness = 0.08 + chaos * 0.04;
  float verticalMask = exp(-y * y / (diskThickness * diskThickness));

  // Logarithmic spiral arms
  float angle = atan(pos.z, pos.x);
  float spiralPhase = angle * spiralWind + log(max(r, 0.01)) * 4.0 + flowTime * 0.5;
  float spiral = sin(spiralPhase) * 0.5 + 0.5;
  spiral = pow(spiral, 1.5); // sharpen arms

  // Turbulence in the disk
  float turb = fbm3(vec3(pos.xz * 2.0, flowTime * 0.3)) * 0.3 * chaos;
  spiral += turb;

  // Fine spiral sub-structure
  float fineSpiral = sin(spiralPhase * 3.0 + fbm(vec3(pos.xz * 4.0, flowTime * 0.2)) * 2.0) * 0.5 + 0.5;
  spiral = mix(spiral, fineSpiral, 0.3);

  return radialMask * verticalMask * spiral;
}

// ─── Accretion disk temperature color ───
// White-hot inner → orange → red outer, with pitch modulation.
vec3 ehDiskColor(float r, float innerR, float outerR, float pitchTemp,
                 float densityVal) {
  float tNorm = smoothstep(innerR, outerR, r);

  // Temperature: inner = 1.0 (white-hot), outer = 0.0 (dull red)
  float temp = 1.0 - tNorm;
  temp = pow(temp, 0.7); // non-linear falloff
  temp += pitchTemp * 0.2; // melodic pitch heats the inner disk

  // Planckian-ish color ramp
  vec3 hotWhite = vec3(1.0, 0.97, 0.92);
  vec3 hotOrange = vec3(1.0, 0.6, 0.15);
  vec3 warmRed = vec3(0.8, 0.15, 0.02);
  vec3 coolRed = vec3(0.3, 0.04, 0.01);

  vec3 diskCol;
  if (temp > 0.75) {
    diskCol = mix(hotOrange, hotWhite, smoothstep(0.75, 1.0, temp));
  } else if (temp > 0.4) {
    diskCol = mix(warmRed, hotOrange, smoothstep(0.4, 0.75, temp));
  } else {
    diskCol = mix(coolRed, warmRed, smoothstep(0.0, 0.4, temp));
  }

  // Density-dependent emission: denser = brighter
  diskCol *= 0.5 + densityVal * 2.5;

  return diskCol;
}

// ─── Gravitational lensing: bend ray toward singularity ───
// Simple inverse-square deflection on ray direction each step.
vec3 ehLens(vec3 rd, vec3 pos, float mass, float tensionStr) {
  float dist2 = dot(pos, pos);
  float dist = sqrt(dist2);
  float strength = mass * tensionStr / max(dist2, 0.01);

  // Deflection toward origin (the singularity)
  vec3 toward = -normalize(pos);
  rd = normalize(rd + toward * strength * 0.04);
  return rd;
}

// ─── Hawking radiation: particle bursts near event horizon ───
vec3 ehHawking(vec3 pos, float radius, float drumOnset, float flowTime) {
  float dist = length(pos);
  // Particles exist in a thin shell just outside the event horizon
  float shellMask = smoothstep(radius, radius + 0.15, dist) *
                    smoothstep(radius + 0.6, radius + 0.2, dist);
  if (shellMask < 0.001) return vec3(0.0);

  // Particle field: hash-based points
  vec3 cell = floor(pos * 12.0);
  float h = ehHash(cell + floor(flowTime * 2.0));

  // Only ~8% of cells have particles, more on drum onset
  float threshold = 0.92 - drumOnset * 0.3;
  float particle = step(threshold, h);

  vec3 frac = fract(pos * 12.0) - 0.5;
  float pDist = length(frac);
  float brightness = particle * smoothstep(0.15, 0.02, pDist);

  // Escape velocity visualization: particles streak outward
  float escape = smoothstep(radius, radius + 0.5, dist);

  // Color: blue-white (quantum vacuum radiation)
  vec3 hawkingCol = vec3(0.6, 0.7, 1.0) * brightness * shellMask;
  hawkingCol *= 1.0 + drumOnset * 3.0; // burst on drum hits

  return hawkingCol * (0.3 + escape * 0.7);
}

// ─── Photon sphere: bright ring at 1.5x Schwarzschild radius ───
vec3 ehPhotonSphere(vec3 pos, float radius, float vocalPresence) {
  float dist = length(pos);
  float photonR = radius * 1.5;

  // Thin bright ring
  float ring = exp(-pow((dist - photonR) * 8.0, 2.0));

  // Orbital motion: photons circle the black hole
  float angle = atan(pos.z, pos.x);
  float orbitalPattern = sin(angle * 6.0 + dist * 10.0) * 0.3 + 0.7;

  ring *= orbitalPattern;
  ring *= 0.3 + vocalPresence * 0.7; // vocal presence = photon sphere visibility

  // Color: blue-shifted captured light
  vec3 photonCol = vec3(0.5, 0.65, 1.0) * ring;
  return photonCol;
}

// ─── Relativistic jet: thin cone of plasma above/below disk ───
float ehJet(vec3 pos, float radius, float jetStrength) {
  float r = length(pos.xz);
  float absY = abs(pos.y);

  // Cone shape: narrow at base, widens
  float coneAngle = 0.08 + jetStrength * 0.04;
  float coneR = absY * coneAngle;
  float coneDist = r - coneR;

  // Jet only above/below the black hole
  float heightMask = smoothstep(radius * 0.5, radius * 2.0, absY) *
                     smoothstep(12.0, 6.0, absY);

  // Density falloff along jet
  float density = smoothstep(coneR + 0.2, coneR - 0.02, r) * heightMask;

  // Internal structure: helical twist
  float angle = atan(pos.z, pos.x);
  float helix = sin(angle * 3.0 + absY * 2.0 - uDynamicTime * 2.0) * 0.5 + 0.5;
  density *= 0.5 + helix * 0.5;

  return density * jetStrength;
}

// ─── Background starfield (lensed) ───
vec3 ehStarfield(vec3 rd) {
  vec3 stars = vec3(0.0);
  vec3 cell = floor(rd * 30.0);
  vec3 frac = fract(rd * 30.0) - 0.5;
  float h = ehHash(cell);

  if (h > 0.85) {
    float dist = length(frac);
    float starSize = 0.02 + h * 0.015;
    float star = smoothstep(starSize, starSize * 0.1, dist);

    // Star temperature coloring
    float temp = ehHash(cell + 7.0);
    vec3 starCol = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.9, 0.7), temp);

    // Subtle twinkle
    float twinkle = sin(uTime * (1.5 + h * 3.0) + h * 80.0) * 0.2 + 0.8;

    stars = starCol * star * twinkle * 0.4;
  }

  return stars;
}

// ─── Second starfield layer for density ───
vec3 ehStarfieldFar(vec3 rd) {
  vec3 stars = vec3(0.0);
  vec3 cell = floor(rd * 80.0);
  float h = ehHash(cell);

  if (h > 0.92) {
    vec3 frac = fract(rd * 80.0) - 0.5;
    float dist = length(frac);
    float star = smoothstep(0.12, 0.01, dist) * (h - 0.92) * 12.5;
    stars = vec3(0.8, 0.85, 0.95) * star * 0.15;
  }

  return stars;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Clamp all audio inputs ───
  float bass = clamp(uBass, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float melDir = clamp(uMelodicDirection, -1.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float cosmic = clamp(uSemanticCosmic, 0.0, 1.0);
  float psychedelic = clamp(uSemanticPsychedelic, 0.0, 1.0);
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxPower = isClimax * climaxIntensity;

  // ─── Section type gates ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // ─── Jam phase mapping ───
  float jamExplore = smoothstep(-0.5, 0.5, uJamPhase) * (1.0 - step(0.5, uJamPhase));
  float jamBuilding = smoothstep(0.5, 1.5, uJamPhase) * (1.0 - step(1.5, uJamPhase));
  float jamPeak = smoothstep(1.5, 2.5, uJamPhase) * (1.0 - step(2.5, uJamPhase));
  float jamResolve = smoothstep(2.5, 3.5, uJamPhase);

  // ─── Black hole parameters (bass IS gravity) ───
  float bhRadius = 0.5 + bass * 0.6 + climaxPower * 0.3;
  // Singularity pulse at climax: the void breathes
  float singularityPulse = isClimax * sin(uDynamicTime * 1.5) * 0.15 * climaxIntensity;
  bhRadius += singularityPulse;

  // ─── Accretion disk parameters ───
  float diskInner = bhRadius * 2.0;
  float diskOuter = bhRadius * 6.0 + energy * 2.0;
  float spiralWind = 2.5 + melDir * 1.5; // melodic direction controls winding
  float diskChaos = 0.3 + improv * 0.7;  // improvisation = disk chaos
  float diskBrightness = 0.6 + energy * 0.8 + sChorus * 0.4 + beatSnap * 0.5;

  // ─── Gravitational lensing strength ───
  float lensStrength = 0.5 + tension * 1.5 + psychedelic * 0.8;
  lensStrength *= 1.0 + sJam * 0.5; // jam = maximum lensing
  lensStrength *= 1.0 - sSpace * 0.3; // space = subtle lensing

  // ─── Jet parameters ───
  float jetStrength = energy * 0.4 + climaxPower * 0.8 + sSolo * 0.3;

  // ─── Flow time with time dilation near the hole ───
  float flowTime = uDynamicTime * (0.5 + slowE * 0.3);

  // ─── Camera orbit ───
  // Jam phase controls orbital distance: exploration=far, building=closer, peak=event horizon
  float orbitDist = 8.0;
  orbitDist += jamExplore * 4.0;    // wide orbit during exploration
  orbitDist -= jamBuilding * 2.5;   // falling inward during building
  orbitDist -= jamPeak * 4.0;       // at the event horizon during peak
  orbitDist += jamResolve * 3.0;    // pulling back during resolution
  orbitDist -= climaxPower * 1.5;   // climax pulls you closer
  orbitDist += spaceScore * 3.0;    // space = distant contemplation
  orbitDist = max(orbitDist, bhRadius * 2.5); // never inside the hole

  float orbitSpeed = 0.08 + slowE * 0.06;
  float orbitAngle = uDynamicTime * orbitSpeed;

  // Slight vertical oscillation
  float camY = sin(uDynamicTime * 0.05) * 1.5 + 0.5;
  // During jams, more dramatic camera angles
  camY += sJam * sin(uDynamicTime * 0.12) * 1.0;
  // Space: nearly edge-on with the disk
  camY *= mix(1.0, 0.2, sSpace);

  vec3 ro = vec3(
    cos(orbitAngle) * orbitDist,
    camY,
    sin(orbitAngle) * orbitDist
  );

  // Look at the singularity with slight offset for drama
  vec3 lookTarget = vec3(0.0, 0.0, 0.0);
  // Slight look offset during building phase (anticipation)
  lookTarget.x += sin(uDynamicTime * 0.3) * 0.2 * jamBuilding;

  vec3 forward = normalize(lookTarget - ro);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  // Gentle camera roll
  float rollAngle = sin(uDynamicTime * 0.03) * 0.08 + improv * sin(uDynamicTime * 0.1) * 0.12;
  worldUp = vec3(sin(rollAngle), cos(rollAngle), 0.0);

  vec3 camRight = normalize(cross(forward, worldUp));
  vec3 camUp = cross(camRight, forward);

  float fovScale = tan(radians(mix(50.0, 70.0, jamPeak + climaxPower * 0.5)) * 0.5);
  vec3 rd = normalize(forward + camRight * p.x * fovScale + camUp * p.y * fovScale);

  // ─── MAIN RAYMARCH WITH GRAVITATIONAL LENSING ───
  vec3 col = vec3(0.0);
  float totalDist = 0.0;
  float diskAccum = 0.0;
  vec3 diskColorAccum = vec3(0.0);
  vec3 hawkingAccum = vec3(0.0);
  vec3 photonAccum = vec3(0.0);
  float jetAccum = 0.0;
  vec3 jetColorAccum = vec3(0.0);
  bool swallowed = false;

  // Adaptive step count based on energy
  int stepCount = int(mix(50.0, 80.0, energy));

  vec3 currentRd = rd;

  for (int i = 0; i < EH_MAX_STEPS; i++) {
    if (i >= stepCount) break;
    if (totalDist > EH_MAX_DIST) break;

    vec3 pos = ro + currentRd * totalDist;
    float distToCenter = length(pos);

    // ─── Time dilation: near the hole, shader time slows ───
    float dilationFactor = smoothstep(bhRadius, bhRadius * 4.0, distToCenter);
    float localFlowTime = flowTime * (0.1 + dilationFactor * 0.9);

    // ─── Gravitational lensing: bend ray each step ───
    if (distToCenter < bhRadius * 8.0) {
      currentRd = ehLens(currentRd, pos, bhRadius * bass, lensStrength);
    }

    // ─── Black hole absorption check ───
    float bhDist = ehBlackHole(pos, bhRadius);
    if (bhDist < EH_SURF_DIST) {
      swallowed = true;
      break;
    }

    // ─── Accretion disk sampling (volumetric) ───
    float diskDensity = ehDisk(pos, diskInner, diskOuter, spiralWind,
                               diskChaos, localFlowTime);
    if (diskDensity > 0.001) {
      float alpha = diskDensity * 0.08 * (1.0 - diskAccum);
      float r = length(pos.xz);
      vec3 dCol = ehDiskColor(r, diskInner, diskOuter, pitch, diskDensity);
      dCol *= diskBrightness;

      // Beat flash on the disk
      dCol *= 1.0 + beatSnap * 0.8;

      // Chorus: disk flares brighter
      dCol *= 1.0 + sChorus * 0.5;

      // Dynamic range: higher = more contrast in the disk
      dCol *= 0.7 + dynRange * 0.6;

      diskColorAccum += dCol * alpha;
      diskAccum += alpha;
      diskAccum = min(diskAccum, 1.0);
    }

    // ─── Hawking radiation ───
    hawkingAccum += ehHawking(pos, bhRadius, drumOnset, localFlowTime) * 0.15;

    // ─── Photon sphere ───
    photonAccum += ehPhotonSphere(pos, bhRadius, vocalPresence) * 0.08;

    // ─── Relativistic jets ───
    if (jetStrength > 0.05) {
      float jetDens = ehJet(pos, bhRadius, jetStrength);
      if (jetDens > 0.001) {
        float absY = abs(pos.y);
        // Jet color: blue-white core, fading to purple
        vec3 jCol = mix(vec3(0.4, 0.5, 1.0), vec3(0.8, 0.6, 1.0),
                        smoothstep(2.0, 8.0, absY));
        jCol *= 1.0 + energy * 0.5;
        float jAlpha = jetDens * 0.06;
        jetColorAccum += jCol * jAlpha;
        jetAccum += jAlpha;
      }
    }

    // ─── Adaptive step size ───
    // Smaller steps near the black hole for precision
    float stepSize;
    if (distToCenter < bhRadius * 2.0) {
      stepSize = 0.05;
    } else if (distToCenter < bhRadius * 4.0) {
      stepSize = 0.15;
    } else {
      stepSize = 0.4;
    }
    totalDist += stepSize;
  }

  // ─── Compose final color ───
  if (swallowed) {
    // THE VOID: absolute blackness, the singularity
    // But not pure black — a faint Hawking glow at the boundary
    col = vec3(0.0);
    // Faint event horizon glow: reddish-shifted light at the boundary
    float boundaryGlow = 0.02 + climaxPower * 0.04;
    col += vec3(0.15, 0.02, 0.0) * boundaryGlow;
    // Space score deepens the void
    col *= 1.0 - spaceScore * 0.5;
  } else {
    // ─── Background: lensed starfield ───
    vec3 bgStars = ehStarfield(currentRd);
    bgStars += ehStarfieldFar(currentRd);

    // Starfield stretching near the hole (lensing visual)
    float centerDist = length(p);
    float stretchFactor = smoothstep(0.0, 0.5, centerDist);
    bgStars *= 0.5 + stretchFactor * 0.5;

    // Cosmic semantic boost on stars
    bgStars *= 1.0 + cosmic * 0.4;

    // Deep space background color
    vec3 bgColor = vec3(0.005, 0.003, 0.015);
    bgColor += bgStars;

    col = bgColor;

    // Layer on the accretion disk
    col = mix(col, diskColorAccum, diskAccum);

    // Additive layers
    col += photonAccum;
    col += hawkingAccum;
    col += jetColorAccum;
  }

  // ─── Gravitational lensing glow around the black hole ───
  // Einstein ring: bright ring where background light is focused
  {
    float centerDist = length(p);
    float einsteinR = bhRadius * 0.15 / max(orbitDist * 0.1, 0.1);
    float einsteinRing = exp(-pow((centerDist - einsteinR) * 20.0, 2.0));
    einsteinRing *= tension * 0.5 + 0.2;
    einsteinRing *= 1.0 + psychedelic * 0.5;
    col += vec3(0.6, 0.7, 1.0) * einsteinRing * 0.3;
  }

  // ─── Singularity pulse at climax: void radiates ───
  if (climaxPower > 0.1) {
    float centerDist = length(p);
    float pulseWave = sin(centerDist * 15.0 - uDynamicTime * 3.0) * 0.5 + 0.5;
    float pulseMask = smoothstep(0.5, 0.0, centerDist) * climaxPower;
    vec3 pulseCol = mix(vec3(0.2, 0.1, 0.4), vec3(0.8, 0.4, 1.0), pulseWave);
    col += pulseCol * pulseMask * 0.2;
  }

  // ─── Cosmic dust haze ───
  {
    float dustNoise = fbm3(vec3(p * 3.0, flowTime * 0.1));
    float dustMask = smoothstep(-0.2, 0.3, dustNoise) * 0.05;
    vec3 dustCol = vec3(0.15, 0.08, 0.25) * dustMask;
    dustCol *= 1.0 + cosmic * 0.5;
    col += dustCol * (1.0 - diskAccum * 0.5);
  }

  // ─── Section-specific overrides ───
  // Space: deepen the void, almost nothing but blackness and distant stars
  col *= mix(1.0, 0.4, sSpace);
  // Jam: amplify everything
  col *= 1.0 + sJam * 0.25;

  // ─── Dynamic range contrast ───
  // Higher dynamic range = more contrast between void and bright disk
  {
    float lumVal = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, col * (0.5 + lumVal * 1.5), dynRange * 0.3);
  }

  // ─── Cosmic semantic: overall intensity ───
  col *= 1.0 + cosmic * 0.2;

  // ─── Palette tinting (subtle, respects the black hole's colors) ───
  {
    vec3 pal1 = paletteHueColor(uPalettePrimary, 0.8, 0.95);
    vec3 pal2 = paletteHueColor(uPaletteSecondary, 0.8, 0.95);
    vec3 palTint = mix(pal1, pal2, sin(uTime * 0.05) * 0.5 + 0.5);
    col = mix(col, col * palTint, 0.1 + energy * 0.05);
  }

  // ─── DEAD ICONOGRAPHY ───
  {
    float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
    vec3 palCol1 = paletteHueColor(uPalettePrimary, 0.85, 1.0);
    vec3 palCol2 = paletteHueColor(uPaletteSecondary, 0.85, 1.0);
    col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);
  }

  // ─── POST PROCESS ───
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
