/**
 * Vintage Film — raymarched 3D film projector booth.
 * Camera looks at a massive film reel mechanism with sprocket holes as SDF
 * geometry, celluloid strip curling through a gate, projector lamp volumetric
 * light cone, dust motes in the beam.
 *
 * Visual aesthetic:
 *   - Quiet: dim projector room, faint lamp glow, gentle film advance
 *   - Building: lamp brightens, dust swirls increase, film speed picks up
 *   - Peak: blazing light cone, dense dust, film stutters and burns
 *   - Release: lamp dims, dust settles, film slows
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           -> lamp intensity + dust density
 *   uBass             -> reel mechanism bass throb / rotation speed
 *   uMids             -> film gate weave amplitude
 *   uHighs            -> specular sharpness on metal components
 *   uOnsetSnap        -> gate flicker (film jolt on transients)
 *   uBeatSnap         -> reel click (sprocket advance snap)
 *   uStemDrums        -> film advance speed pulse
 *   uVocalPresence    -> warm amber lamp color shift
 *   uSlowEnergy       -> base film advance speed
 *   uClimaxPhase      -> film burn effect at 2+
 *   uClimaxIntensity  -> burn severity
 *   uHarmonicTension  -> projector motor strain (wobble)
 *   uMelodicPitch     -> lamp height in scene
 *   uSectionType      -> jam=faster reel+more dust, space=near-still
 *   uBeatStability    -> film transport steadiness
 *   uDynamicRange     -> contrast in the projected beam
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const vintageFilmVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const vintageFilmFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "heavy",
  bloomEnabled: true,
  bloomThresholdOffset: -0.10,
  caEnabled: true,
  halationEnabled: true,
  lensDistortionEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define VF3_MAX_STEPS 90
#define VF3_MAX_DIST 30.0
#define VF3_SURF_DIST 0.002

// ============================================================
// Utility
// ============================================================
mat2 vf3Rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float vf3Hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// ============================================================
// SDF: box
// ============================================================
float vf3Box(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// ============================================================
// SDF: cylinder (vertical)
// ============================================================
float vf3Cylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ============================================================
// SDF: torus (ring)
// ============================================================
float vf3Torus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// ============================================================
// SDF: film reel (large disc with sprocket hub)
// ============================================================
float vf3FilmReel(vec3 p, float reelAngle) {
  // Rotate reel
  p.xz *= vf3Rot2(reelAngle);

  // Main disc
  float disc = vf3Cylinder(p, 0.15, 2.2);
  // Hub center
  float hub = vf3Cylinder(p, 0.25, 0.4);
  // Spokes (3 spokes cut from disc)
  float spokes = 1e10;
  for (int i = 0; i < 3; i++) {
    float angle = float(i) * TAU / 3.0;
    vec3 spokeP = p;
    spokeP.xz *= vf3Rot2(angle);
    float spoke = vf3Box(spokeP - vec3(1.2, 0.0, 0.0), vec3(0.8, 0.12, 0.08));
    spokes = min(spokes, spoke);
  }
  // Film wound on reel (thicker torus around hub)
  float film = vf3Torus(p, vec2(1.3, 0.5));
  film = max(film, -vf3Cylinder(p, 0.6, 0.5)); // cut center
  film = max(film, vf3Cylinder(p, 0.08, 3.0) * -1.0); // flatten

  float reel = min(disc, hub);
  reel = min(reel, spokes);
  reel = min(reel, film);

  // Sprocket teeth on rim (16 notches)
  for (int i = 0; i < 16; i++) {
    float angle = float(i) * TAU / 16.0;
    vec3 toothP = p;
    toothP.xz *= vf3Rot2(angle);
    float tooth = vf3Box(toothP - vec3(2.25, 0.0, 0.0), vec3(0.08, 0.18, 0.06));
    reel = min(reel, tooth);
  }

  return reel;
}

// ============================================================
// SDF: film strip (curling celluloid through the gate)
// ============================================================
float vf3FilmStrip(vec3 p, float filmAdvance, float weave) {
  // Film runs vertically, curving through the gate area
  vec3 fp = p;
  fp.y += filmAdvance; // advance the film

  // Gate weave (horizontal wobble)
  fp.x += sin(fp.y * 2.0) * weave * 0.05;

  // Main strip body
  float strip = vf3Box(fp, vec3(0.5, 6.0, 0.015));

  // Sprocket holes along edges (8 pairs)
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float holeY = mod(fp.y + fi * 1.4, 11.2) - 5.6;
    vec3 holeP = vec3(fp.x - 0.38, holeY, fp.z);
    float hole = vf3Box(holeP, vec3(0.04, 0.06, 0.02));
    vec3 holeP2 = vec3(fp.x + 0.38, holeY, fp.z);
    float hole2 = vf3Box(holeP2, vec3(0.04, 0.06, 0.02));
    strip = max(strip, -hole);
    strip = max(strip, -hole2);
  }

  // Frame lines (horizontal dividers between frames)
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float lineY = mod(fp.y + fi * 1.87, 11.2) - 5.6;
    float frameLine = vf3Box(vec3(fp.x, lineY, fp.z), vec3(0.36, 0.005, 0.02));
    strip = min(strip, frameLine);
  }

  return strip;
}

// ============================================================
// SDF: projector lamp housing
// ============================================================
float vf3Lamp(vec3 p) {
  // Cylindrical housing
  float housing = vf3Cylinder(p, 0.6, 0.35);
  // Lens at front
  float lens = length(p - vec3(0.0, 0.0, 0.4)) - 0.3;
  // Reflector dish behind
  float reflector = length(p - vec3(0.0, 0.0, -0.5)) - 0.45;
  reflector = max(reflector, p.z + 0.3); // half-sphere

  return min(housing, min(lens, reflector));
}

// ============================================================
// Complete scene SDF
// ============================================================
float vf3Map(vec3 p, float reelAngle, float filmAdvance, float weave, float tension) {
  float minDist = VF3_MAX_DIST;

  // Supply reel (upper left)
  vec3 supplyP = p - vec3(-3.0, 3.0, 0.0);
  supplyP.yz *= vf3Rot2(0.15); // slight tilt
  float supplyReel = vf3FilmReel(supplyP, reelAngle);
  minDist = min(minDist, supplyReel);

  // Take-up reel (lower right)
  vec3 takeupP = p - vec3(3.0, -2.5, 0.0);
  takeupP.yz *= vf3Rot2(-0.1);
  float takeupReel = vf3FilmReel(takeupP, -reelAngle * 0.7);
  minDist = min(minDist, takeupReel);

  // Film strip threading between reels
  vec3 stripP = p - vec3(0.0, 0.2, 0.5);
  float strip = vf3FilmStrip(stripP, filmAdvance, weave);
  minDist = min(minDist, strip);

  // Projector lamp (behind film gate)
  vec3 lampP = p - vec3(0.0, 0.2, -2.0);
  // Motor strain wobble from tension
  lampP.x += sin(uDynamicTime * 15.0) * tension * 0.02;
  float lamp = vf3Lamp(lampP);
  minDist = min(minDist, lamp);

  // Film gate mechanism (two plates clamping the film)
  vec3 gateP = p - vec3(0.0, 0.2, 0.3);
  float gatePlateL = vf3Box(gateP - vec3(-0.6, 0.0, 0.0), vec3(0.08, 1.2, 0.3));
  float gatePlateR = vf3Box(gateP - vec3(0.6, 0.0, 0.0), vec3(0.08, 1.2, 0.3));
  minDist = min(minDist, min(gatePlateL, gatePlateR));

  // Floor
  float floor = p.y + 5.0;
  minDist = min(minDist, floor);

  // Back wall
  float wall = -p.z - 4.0;
  minDist = min(minDist, wall);

  return minDist;
}

// ============================================================
// Material ID: 0=metal(reels/gate), 1=film, 2=lamp, 3=floor/wall
// ============================================================
float vf3MaterialID(vec3 p, float reelAngle, float filmAdvance, float weave) {
  vec3 supplyP = p - vec3(-3.0, 3.0, 0.0);
  supplyP.yz *= vf3Rot2(0.15);
  float supplyReel = vf3FilmReel(supplyP, reelAngle);

  vec3 takeupP = p - vec3(3.0, -2.5, 0.0);
  takeupP.yz *= vf3Rot2(-0.1);
  float takeupReel = vf3FilmReel(takeupP, -reelAngle * 0.7);

  vec3 stripP = p - vec3(0.0, 0.2, 0.5);
  float strip = vf3FilmStrip(stripP, filmAdvance, weave);

  vec3 lampP = p - vec3(0.0, 0.2, -2.0);
  float lamp = vf3Lamp(lampP);

  float floor = p.y + 5.0;

  float minMetal = min(supplyReel, takeupReel);
  if (strip < minMetal && strip < lamp && strip < floor) return 1.0;
  if (lamp < minMetal && lamp < floor) return 2.0;
  if (floor < minMetal) return 3.0;
  return 0.0;
}

// ============================================================
// Normal via central differences
// ============================================================
vec3 vf3Normal(vec3 p, float reelAngle, float filmAdvance, float weave, float tension) {
  vec2 eps = vec2(0.003, 0.0);
  float d = vf3Map(p, reelAngle, filmAdvance, weave, tension);
  return normalize(vec3(
    vf3Map(p + eps.xyy, reelAngle, filmAdvance, weave, tension) - d,
    vf3Map(p + eps.yxy, reelAngle, filmAdvance, weave, tension) - d,
    vf3Map(p + eps.yyx, reelAngle, filmAdvance, weave, tension) - d
  ));
}

// ============================================================
// Ambient Occlusion (5-tap)
// ============================================================
float vf3AmbientOcclusion(vec3 p, vec3 n, float reelAngle, float filmAdvance, float weave, float tension) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    float dist = fi * 0.1;
    float d = vf3Map(p + n * dist, reelAngle, filmAdvance, weave, tension);
    occ += (dist - d) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 2.5, 0.0, 1.0);
}

// ============================================================
// Volumetric light cone from projector lamp
// ============================================================
vec3 vf3LightCone(vec3 ro, vec3 rd, float maxT, float lampIntensity, vec3 lampColor) {
  vec3 cone = vec3(0.0);
  vec3 lampPos = vec3(0.0, 0.2, -2.0);
  vec3 lampDir = normalize(vec3(0.0, 0.0, 1.0)); // projects forward

  int coneSteps = 32;
  float stepSize = min(maxT, 15.0) / float(coneSteps);

  for (int i = 0; i < 32; i++) {
    float fi = float(i);
    float marchT = fi * stepSize + 0.5;
    vec3 pos = ro + rd * marchT;

    // Distance from lamp axis
    vec3 toPos = pos - lampPos;
    float along = dot(toPos, lampDir);
    if (along < 0.0) continue;
    vec3 projected = lampPos + lampDir * along;
    float perpDist = length(pos - projected);

    // Cone angle: widens with distance
    float coneRadius = along * 0.35;
    float inCone = smoothstep(coneRadius, coneRadius * 0.3, perpDist);

    // Attenuation with distance
    float atten = 1.0 / (1.0 + along * along * 0.08);

    // Dust mote density via noise
    float dust = fbm3(vec3(pos * 1.5 + uDynamicTime * vec3(0.1, 0.15, 0.05)));
    dust = dust * 0.5 + 0.5;
    dust *= 0.8 + 0.4 * snoise(vec3(pos * 3.0 + uDynamicTime * 0.3));

    cone += lampColor * inCone * atten * dust * lampIntensity * 0.012;
  }

  return cone;
}

// ============================================================
// Dust motes in the beam (bright point particles)
// ============================================================
vec3 vf3DustMotes(vec3 ro, vec3 rd, float maxT, float energy) {
  vec3 dust = vec3(0.0);
  vec3 lampPos = vec3(0.0, 0.2, -2.0);
  vec3 lampDir = vec3(0.0, 0.0, 1.0);

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float seed = fi * 7.31 + 3.17;
    // Mote position: drifting slowly in 3D
    vec3 motePos = vec3(
      sin(seed * 1.7 + uDynamicTime * 0.15) * 1.5,
      cos(seed * 2.3 + uDynamicTime * 0.12) * 1.5 + 0.2,
      sin(seed * 0.9 + uDynamicTime * 0.08) * 3.0 - 0.5
    );

    // Check if mote is in the light cone
    vec3 toMote = motePos - lampPos;
    float along = dot(toMote, lampDir);
    if (along < 0.0) continue;
    float perpDist = length(toMote - lampDir * along);
    float coneRadius = along * 0.35;
    float inCone = smoothstep(coneRadius, coneRadius * 0.5, perpDist);

    // Distance from ray to mote
    vec3 toRo = motePos - ro;
    float proj = dot(toRo, rd);
    if (proj < 0.0 || proj > maxT) continue;
    vec3 closest = ro + rd * proj;
    float moteDist = length(closest - motePos);

    float moteGlow = inCone * exp(-moteDist * moteDist * 200.0) * energy * 0.8;
    dust += vec3(1.0, 0.95, 0.85) * moteGlow;
  }

  return dust;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS ===
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float stemDrums = clamp(uStemDrums, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float slowEnergy = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float dynamicRange = clamp(uDynamicRange, 0.0, 1.0);
  float sectionT = uSectionType;

  // === SECTION-TYPE MODULATION ===
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float time = uDynamicTime;
  float filmSpeed = (0.3 + slowEnergy * 0.3 + stemDrums * 0.2) * mix(1.0, 1.5, sJam) * mix(1.0, 0.2, sSpace);

  // Reel rotation angle
  float reelAngle = time * filmSpeed * 0.5 + bass * 0.3;

  // Film advance position
  float filmAdvance = time * filmSpeed * 2.0 + beatSnap * 0.3;

  // Gate weave
  float weave = mids * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace) * (2.0 - beatStability);
  weave += onset * 3.0; // jolt on transients

  // Climax: film burn
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBurn = isClimax * uClimaxIntensity;

  // === PALETTE ===
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.1;
  float hue1 = hsvToCosineHue(uPalettePrimary) + chromaHueMod + chordHue;
  float hue2 = hsvToCosineHue(uPaletteSecondary) + chordHue * 0.5;
  vec3 warmAmber = vec3(1.0, 0.75, 0.4);
  vec3 palColor1 = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  vec3 palColor2 = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // Lamp color: warm amber, vocal presence shifts it warmer
  vec3 lampColor = mix(warmAmber, vec3(1.0, 0.85, 0.5), vocalPresence * 0.4);
  lampColor = mix(lampColor, palColor1, 0.2);

  // Lamp intensity
  float lampIntensity = 0.4 + energy * 0.8 + mix(0.0, 0.3, sChorus);
  lampIntensity *= mix(1.0, 1.3, sJam) * mix(1.0, 0.4, sSpace);

  // === RAY SETUP ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // === RAYMARCH ===
  float marchT = 0.0;
  bool marchHit = false;
  vec3 marchPos = ro;

  for (int i = 0; i < VF3_MAX_STEPS; i++) {
    marchPos = ro + rd * marchT;
    float d = vf3Map(marchPos, reelAngle, filmAdvance, weave, tension);
    if (d < VF3_SURF_DIST) {
      marchHit = true;
      break;
    }
    if (marchT > VF3_MAX_DIST) break;
    marchT += d * 0.85;
  }

  // === SHADING ===
  vec3 col = vec3(0.0);

  // Background: dark projector booth
  vec3 bgCol = vec3(0.015, 0.012, 0.02);
  bgCol += palColor2 * 0.008;

  if (marchHit) {
    vec3 pos = marchPos;
    vec3 norm = vf3Normal(pos, reelAngle, filmAdvance, weave, tension);
    float matID = vf3MaterialID(pos, reelAngle, filmAdvance, weave);

    // Two lights: projector lamp + ambient room
    vec3 lampPos = vec3(0.0, 0.5 + melodicPitch * 1.5, -2.0);
    vec3 lightDir = normalize(lampPos - pos);
    vec3 viewDir = normalize(ro - pos);
    vec3 halfVec = normalize(lightDir + viewDir);

    // Fill light from above
    vec3 fillDir = normalize(vec3(0.3, 1.0, 0.2));

    // === DIFFUSE ===
    float diff = max(dot(norm, lightDir), 0.0);
    float fillDiff = max(dot(norm, fillDir), 0.0);

    // === SPECULAR ===
    float specPow = 32.0 + highs * 96.0;
    float spec = pow(max(dot(norm, halfVec), 0.0), specPow);

    // === FRESNEL ===
    float fresnel = pow(1.0 - max(dot(norm, viewDir), 0.0), 3.0);

    // === AO ===
    float occl = vf3AmbientOcclusion(pos, norm, reelAngle, filmAdvance, weave, tension);

    // === MATERIAL ===
    vec3 matCol;
    if (matID < 0.5) {
      // Metal: dark gunmetal with specular
      matCol = vec3(0.12, 0.11, 0.13);
      spec *= 2.0;
    } else if (matID < 1.5) {
      // Film celluloid: dark translucent brown
      matCol = vec3(0.15, 0.08, 0.03);
      // Projected image content on the film: flowing noise as "footage"
      float filmContent = fbm3(vec3(pos.xy * 3.0, filmAdvance * 0.5));
      vec3 imageColor = mix(palColor1, palColor2, filmContent * 0.5 + 0.5);
      matCol += imageColor * 0.15 * lampIntensity;
    } else if (matID < 2.5) {
      // Lamp: bright emissive
      matCol = lampColor * lampIntensity * 2.0;
    } else {
      // Floor/wall: dark matte
      matCol = vec3(0.04, 0.035, 0.045);
      // Subtle floor reflection grid
      if (pos.y < -4.9) {
        float gridLine = smoothstep(0.02, 0.0, abs(fract(pos.x * 0.5) - 0.5));
        gridLine += smoothstep(0.02, 0.0, abs(fract(pos.z * 0.5) - 0.5));
        matCol += palColor2 * gridLine * 0.02;
      }
    }

    // === COMPOSE ===
    vec3 ambient = matCol * 0.05;
    vec3 diffuseLight = matCol * (diff * lampColor * lampIntensity * 0.5 + fillDiff * vec3(0.1, 0.1, 0.15) * 0.15);
    vec3 specLight = lampColor * spec * 0.4;
    vec3 fresnelLight = palColor1 * fresnel * 0.15;

    col = (ambient + diffuseLight + specLight + fresnelLight) * occl;

    // Dynamic range contrast
    col *= mix(0.7, 1.3, dynamicRange * diff);

    // Depth fog
    float depthFade = 1.0 - exp(-marchT * 0.06);
    col = mix(col, bgCol, depthFade);
  } else {
    col = bgCol;
  }

  // === VOLUMETRIC LIGHT CONE ===
  col += vf3LightCone(ro, rd, min(marchT, VF3_MAX_DIST), lampIntensity, lampColor);

  // === DUST MOTES ===
  col += vf3DustMotes(ro, rd, min(marchT, VF3_MAX_DIST), energy);

  // === GATE FLICKER (onset-triggered) ===
  float flickerGate = 1.0 - onset * 0.2 * mix(1.0, 1.5, sJam);
  col *= flickerGate;

  // === FRAME FLICKER (subtle projector brightness variation) ===
  float frameFlicker = 0.95 + 0.05 * sin(time * 24.0 * PI);
  frameFlicker *= 0.97 + 0.03 * vf3Hash(floor(time * 24.0));
  col *= frameFlicker;

  // === FILM BURN at climax ===
  if (climaxBurn > 0.01) {
    float burnPattern = snoise(vec3(screenP * 3.0, time * 2.0));
    float burnEdge = smoothstep(0.3, 0.7, burnPattern) * climaxBurn;
    vec3 burnColor = vec3(1.0, 0.6, 0.1) * 3.0;
    col = mix(col, burnColor, burnEdge * 0.6);
    // Burn hole: pure white center
    float burnHole = smoothstep(0.6, 0.9, burnPattern) * climaxBurn;
    col += vec3(2.0) * burnHole * 0.3;
  }

  // === SDF ICON EMERGENCE ===
  {
    float nf = snoise(vec3(screenP * 2.0, time * 0.1));
    col += iconEmergence(screenP, uTime, energy, bass, warmAmber, palColor1, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass, warmAmber, palColor1, nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, screenP);
  gl_FragColor = vec4(col, 1.0);
}
`;
