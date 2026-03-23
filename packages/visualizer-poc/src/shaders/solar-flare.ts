/**
 * Solar Flare — stellar surface with granulation, magnetic prominences,
 * and coronal mass ejections triggered by onset events.
 * Feedback persists plasma state (decay 0.94 for hot plasma cooling).
 *
 * Feedback: Yes (decay 0.94, R = plasma temperature, G = magnetic field strength)
 *
 * Audio reactivity:
 *   uEnergy         → flare intensity + corona brightness
 *   uBass           → granulation cell size
 *   uOnsetSnap      → flare eruption trigger
 *   uFastEnergy     → prominence velocity / ejection speed
 *   uStemDrums      → solar wind pulses
 *   uEnergyForecast → magnetic tension buildup (pre-flare)
 *   uClimaxPhase    → full CME during climax
 *   uChromaHue      → emission line hue shifts
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const solarFlareVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const solarFlareFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

uniform sampler2D uPrevFrame;

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "none",
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Read plasma state from previous frame
// R = plasma temperature (0 = cool, 1 = superheated)
// G = magnetic field strength (drives prominence loops)
vec2 readPlasmaState(vec2 uv) {
  vec4 prev = texture2D(uPrevFrame, uv);
  return prev.rg;
}

// Solar granulation: convection cells on the photosphere
float granulation(vec2 p, float cellSize) {
  // Voronoi-like cells from layered noise
  float cells = 0.0;
  vec2 cellP = p / cellSize;

  // Cell centers from grid + jitter
  vec2 gridId = floor(cellP);
  float minDist = 1e10;
  float secondDist = 1e10;

  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 neighbor = gridId + vec2(float(x), float(y));
      // Jittered center
      vec2 center = neighbor + vec2(
        fract(sin(dot(neighbor, vec2(12.9898, 78.233))) * 43758.5453),
        fract(sin(dot(neighbor, vec2(39.346, 11.135))) * 43758.5453)
      ) * 0.8;
      float d = length(cellP - center);
      if (d < minDist) {
        secondDist = minDist;
        minDist = d;
      } else if (d < secondDist) {
        secondDist = d;
      }
    }
  }

  // Cell boundary: dark intergranular lanes
  float edge = secondDist - minDist;
  cells = smoothstep(0.0, 0.15, edge);
  return cells;
}

// Magnetic field lines: looping prominences
float magneticLoop(vec2 p, vec2 footpoint1, vec2 footpoint2, float height, float thickness) {
  // Parametric arch between two footpoints
  vec2 mid = (footpoint1 + footpoint2) * 0.5;
  vec2 halfSpan = (footpoint2 - footpoint1) * 0.5;
  float spanLen = length(halfSpan);

  // Project point onto arch parameter
  vec2 toP = p - mid;
  float t = dot(toP, normalize(halfSpan)) / spanLen;
  t = clamp(t, -1.0, 1.0);

  // Arch shape: parabolic
  float archY = height * (1.0 - t * t);
  vec2 archPoint = mid + normalize(halfSpan) * t * spanLen + vec2(0.0, archY);

  float d = length(p - archPoint) - thickness;
  return d;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float fastEnergy = clamp(uFastEnergy, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float forecast = clamp(uEnergyForecast, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.04;
  float chromaHueMod = uChromaHue * 0.1;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.08;

  // --- Section-type modulation (0=intro,1=verse,2=chorus,3=bridge,4=solo,5=jam,6=outro,7=space) ---
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  // Jam: more intense flares, smaller cells (denser granulation). Space: calm surface, larger cells. Chorus: brighter corona.
  float sectionFlareIntensity = mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace) * mix(1.0, 1.15, sChorus);
  float sectionCellSize = mix(1.0, 0.75, sJam) * mix(1.0, 1.4, sSpace);
  float sectionEruption = mix(1.0, 1.3, sJam) * mix(1.0, 0.3, sSpace);

  vec2 texel = 1.0 / uResolution;

  // --- Read previous plasma state ---
  vec2 state = readPlasmaState(uv);
  float temperature = state.x;
  float magneticStrength = state.y;

  // --- Plasma cooling: decay 0.94 ---
  float newTemp = temperature * 0.94;
  float newMagnetic = magneticStrength * 0.96;

  // --- Solar granulation ---
  float cellSize = (0.06 + bass * 0.04) * sectionCellSize; // bass controls cell size, section-modulated
  float granular = granulation(p, cellSize);

  // Animate granulation: cells slowly evolve
  float granularAnim = granulation(p + vec2(slowTime * 0.3, slowTime * 0.2), cellSize * 1.1);
  granular = mix(granular, granularAnim, 0.3);

  // Granulation heats the plasma
  newTemp += granular * 0.03 * energy;

  // --- Convection flow within cells ---
  // Rising plasma in cell centers, sinking at edges
  float convection = granular * 0.5 + 0.5;
  vec2 convFlow = vec2(
    snoise(vec3(p * 15.0, slowTime * 2.0)),
    snoise(vec3(p * 15.0 + 50.0, slowTime * 2.0))
  ) * convection * 0.005;

  // Advect temperature along convection
  vec2 advectedUv = uv - convFlow;
  float advectedTemp = readPlasmaState(advectedUv).x;
  newTemp = mix(newTemp, advectedTemp, 0.3);

  // --- Magnetic field buildup from energy forecast ---
  // Tension builds before flares
  float tensionBuildup = forecast * 0.02;
  newMagnetic += tensionBuildup;

  // Magnetic field noise: twisted field lines
  float magNoise = fbm(vec3(p * 5.0 + vec2(slowTime * 0.5, 0.0), slowTime * 0.3));
  newMagnetic += abs(magNoise) * 0.01 * energy;

  // --- Flare eruption on onset ---
  if (onset > 0.4) {
    // Eruption site: localized by noise
    float flareSeed = floor(uMusicalTime * 2.0) + uSectionIndex * 50.0;
    vec2 flareCenter = vec2(
      fract(sin(flareSeed * 12.9898) * 43758.5453) * 1.0 - 0.5,
      fract(sin(flareSeed * 78.233) * 43758.5453) * 0.6 - 0.3
    );

    float flareDist = length(p - flareCenter);
    float flareRadius = (0.1 + onset * 0.15 + fastEnergy * 0.1) * sectionEruption;

    // Explosive temperature injection
    float flareHeat = smoothstep(flareRadius, flareRadius * 0.1, flareDist) * onset * sectionFlareIntensity;
    newTemp = max(newTemp, flareHeat * 0.9);

    // Magnetic disruption
    float magDisrupt = smoothstep(flareRadius * 1.5, flareRadius * 0.3, flareDist) * onset;
    newMagnetic = max(newMagnetic, magDisrupt * 0.7);
  }

  // --- Solar wind pulses from drums ---
  if (stemDrums > 0.1) {
    // Radial wind from center
    float windPhase = uDynamicTime * 3.0 - length(p) * 8.0;
    float wind = sin(windPhase) * 0.5 + 0.5;
    wind *= stemDrums * smoothstep(0.5, 0.0, length(p));
    newTemp += wind * 0.04;
  }

  // --- CME during climax ---
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isCME = step(1.5, climaxPhase) * step(climaxPhase, 3.5);

  if (isCME > 0.5) {
    // Massive coronal mass ejection: expanding shell
    float cmeTime = fract(uDynamicTime * 0.2);
    float cmeRadius = cmeTime * 0.8;
    float cmeWidth = 0.08 + climaxI * 0.1;
    float cmeDist = abs(length(p) - cmeRadius) - cmeWidth;
    float cmeMask = smoothstep(cmeWidth, 0.0, abs(cmeDist));

    // CME is asymmetric: stronger in eruption direction
    float cmeAngle = atan(p.y, p.x);
    float cmeDir = sin(cmeAngle * 2.0 + uDynamicTime * 0.5) * 0.5 + 0.5;
    cmeMask *= cmeDir;

    newTemp = max(newTemp, cmeMask * climaxI * 0.8);
    newMagnetic = max(newMagnetic, cmeMask * climaxI * 0.5);
  }

  // --- Initialize on first frame ---
  vec4 rawPrev = texture2D(uPrevFrame, uv);
  if (rawPrev.a < 0.01) {
    newTemp = granular * 0.3 + 0.1;
    newMagnetic = abs(magNoise) * 0.2;
  }

  // Clamp state
  newTemp = clamp(newTemp, 0.0, 1.0);
  newMagnetic = clamp(newMagnetic, 0.0, 1.0);

  // --- Visual rendering ---
  float hue1 = uPalettePrimary + chromaHueMod + chordHue;
  float hue2 = uPaletteSecondary + chordHue * 0.5;
  float sat = mix(0.6, 1.0, energy) * uPaletteSaturation;

  // --- Temperature-to-color mapping (blackbody approximation) ---
  // Cool = dark red, warm = orange/yellow, hot = white-blue
  vec3 coolColor = hsv2rgb(vec3(hue1 + 0.0, sat, 0.15)); // dark photosphere
  vec3 warmColor = hsv2rgb(vec3(hue1 + 0.08, sat, 0.7));  // orange granule center
  vec3 hotColor = hsv2rgb(vec3(hue2 + 0.12, sat * 0.5, 1.0)); // white-hot flare
  vec3 superHot = vec3(0.9, 0.95, 1.0); // blue-white CME

  // Temperature color ramp
  vec3 tempColor = coolColor;
  tempColor = mix(tempColor, warmColor, smoothstep(0.1, 0.4, newTemp));
  tempColor = mix(tempColor, hotColor, smoothstep(0.4, 0.7, newTemp));
  tempColor = mix(tempColor, superHot, smoothstep(0.7, 1.0, newTemp));

  // Base: granulation visible through temperature mapping
  vec3 col = tempColor;

  // Granulation cell brightness variation
  col *= 0.6 + granular * 0.5;

  // Intergranular lanes: dark edges
  float lanes = 1.0 - smoothstep(0.0, 0.05, granular);
  col *= 1.0 - lanes * 0.3;

  // --- Magnetic prominence loops ---
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float seed = fi * 13.7 + 7.0;

    // Footpoints on the surface
    vec2 foot1 = vec2(
      sin(seed * 3.1 + slowTime * 0.3) * 0.3 - 0.1,
      -0.3 + sin(seed * 5.0) * 0.1
    );
    vec2 foot2 = foot1 + vec2(0.15 + fi * 0.05, sin(seed * 7.0) * 0.05);

    // Prominence height: driven by magnetic strength and fast energy
    float promHeight = (0.1 + newMagnetic * 0.2 + fastEnergy * 0.15) * (1.0 + fi * 0.3);

    // Loop thickness: thinner at top
    float promThick = 0.008 + energy * 0.005;

    float loop = magneticLoop(p, foot1, foot2, promHeight, promThick);
    float loopGlow = smoothstep(promThick * 3.0, 0.0, loop);
    float loopEdge = smoothstep(promThick * 0.5, 0.0, abs(loop));

    // Prominence color: hot plasma flowing along field lines
    vec3 promColor = hsv2rgb(vec3(hue1 + 0.05 + fi * 0.03, sat * 0.7, 0.8 + energy * 0.2));
    col += promColor * loopGlow * 0.3;
    col += hotColor * loopEdge * 0.4;
  }

  // --- Corona: extended atmosphere glow ---
  float coronaDist = length(p);
  float corona = 1.0 / (1.0 + coronaDist * coronaDist * 8.0);
  corona *= energy * 0.3 * mix(1.0, 1.2, sChorus);
  vec3 coronaColor = hsv2rgb(vec3(hue2 + 0.05, sat * 0.3, 1.0));
  col += coronaColor * corona;

  // --- Sunspot regions: dark, magnetically active ---
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float seed = fi * 17.3 + 30.0;
    vec2 spotPos = vec2(
      sin(seed * 2.0 + slowTime * 0.2) * 0.25,
      cos(seed * 3.0 + slowTime * 0.15) * 0.15
    );
    float spotDist = length(p - spotPos);
    float spotSize = 0.04 + fi * 0.02;
    float spotMask = smoothstep(spotSize, spotSize * 0.3, spotDist);
    // Umbra: very dark center
    float umbra = smoothstep(spotSize * 0.5, spotSize * 0.2, spotDist);
    col *= 1.0 - spotMask * 0.4; // penumbra darkening
    col *= 1.0 - umbra * 0.3; // umbra extra dark
    // Magnetic field concentrated at sunspots
    newMagnetic += spotMask * 0.02;
  }

  // --- Spicules: tiny jets at the surface ---
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = fi * 7.31 + 60.0;
    vec2 spicBase = vec2(
      (fi / 7.0 - 0.5) * 1.2 + sin(seed) * 0.1,
      -0.35
    );
    // Tiny vertical jets
    float jetHeight = 0.04 + mids * 0.03 + sin(uDynamicTime * 3.0 + seed) * 0.01;
    vec2 toJet = p - spicBase;
    float alongJet = clamp(toJet.y / jetHeight, 0.0, 1.0);
    float perpDist = abs(toJet.x) / (0.003 * (1.0 - alongJet * 0.5));
    float jet = smoothstep(1.0, 0.0, perpDist) * smoothstep(0.0, 0.1, toJet.y) * smoothstep(jetHeight, jetHeight * 0.7, toJet.y);
    vec3 jetColor = hsv2rgb(vec3(hue1 + 0.1, sat * 0.5, 0.9));
    col += jetColor * jet * 0.2;
  }

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.5;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(hue1, sat, 1.0));
    vec3 c2 = hsv2rgb(vec3(hue2, sat, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // Timbral brightness → corona color temperature
  float coronaTemp = mix(0.0, 0.2, uTimbralBrightness);
  col = mix(col, col * vec3(0.8, 0.9, 1.0), coronaTemp);

  // --- Vignette ---
  float bgR = 0.02;
  float bgG = 0.01;
  float bgB = 0.01;
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(bgR, bgG, bgB), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  // Store state in RG channels, visual in RGB
  gl_FragColor = vec4(col, 1.0);
  gl_FragColor.r = mix(col.r, newTemp, 0.5);
  gl_FragColor.g = mix(col.g, newMagnetic, 0.5);
}
`;
