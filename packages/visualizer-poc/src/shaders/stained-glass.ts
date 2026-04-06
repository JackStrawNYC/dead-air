/**
 * Stained Glass Basilica — raymarched gothic cathedral interior.
 * The viewer stands inside a vast gothic nave. Tall pointed-arch stained glass
 * windows line the walls, colored light streams through them casting patterns
 * on the stone floor and pillars. Flying buttress arches soar overhead.
 * The space is vast, reverent, and luminous.
 *
 * Audio reactivity:
 *   uBass             → pillar vibration / stone resonance
 *   uEnergy           → light intensity through glass + color saturation
 *   uDrumOnset        → bright flash of light through windows
 *   uVocalPresence    → warm ambient fill light
 *   uHarmonicTension  → shadow depth / darkness intensity
 *   uSectionType      → jam=light beams dance, space=candlelit darkness,
 *                        chorus=full sunlight flood
 *   uClimaxPhase      → windows shatter outward to pure light
 *   uMelodicDirection → light beam sweep direction
 *   uSlowEnergy       → dust mote density
 *   uBeatStability    → stone texture coherence
 *   uChordIndex       → glass color palette rotation
 *   uSpaceScore       → ambient reverb / echo glow
 *   uTimbralBrightness → specular intensity on stone
 *   uSemanticCosmic   → ethereal glow boost
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const stainedGlassVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
  stageFloodEnabled: false,
  temporalBlendEnabled: false,
  lightLeakEnabled: true,
  dofEnabled: true,
});

export const stainedGlassFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 80
#define MAX_DIST 40.0
#define SURF_DIST 0.002

// ─── Hash for stained glass color variation ───
float sglHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float sglHash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// ─── Smooth min for organic blends ───
float sglSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Box SDF ───
float sglBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// ─── Cylinder SDF (along Y axis) ───
float sglCylinder(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// ─── Gothic pointed arch SDF ───
// An arch is two overlapping circles meeting at a point
float sglArch(vec3 p, float width, float thickness, float archHeight) {
  // Arch spans in X, rises in Y, thin in Z
  float hw = width * 0.5;
  // Two circle centers offset to create a pointed arch
  float cx = hw * 0.7;
  float cr = sqrt(cx * cx + archHeight * archHeight);

  // Left and right arcs
  vec2 pxy = vec2(abs(p.x), p.y - archHeight * 0.5);
  float d1 = length(pxy - vec2(-cx, 0.0)) - cr;
  float d2 = length(pxy - vec2(cx, 0.0)) - cr;
  float archD = max(d1, d2);

  // Intersect with a slab to cut arches
  archD = max(archD, -p.y);
  archD = max(archD, p.y - archHeight);

  // Extrude in Z for thickness
  float zDist = abs(p.z) - thickness * 0.5;
  return max(archD, zDist);
}

// ─── Single pillar with base and capital ───
float sglPillar(vec3 p, float bassVib) {
  // Main column
  float col = sglCylinder(p, 0.35, 6.0);

  // Pillar vibration from bass — subtle wobble
  float wobble = sin(p.y * 3.0 + uDynamicTime * 2.0) * bassVib * 0.02;
  col = sglCylinder(p + vec3(wobble, 0.0, wobble * 0.7), 0.35, 6.0);

  // Base — wider cylinder at bottom
  float base = sglCylinder(p + vec3(0.0, 5.5, 0.0), 0.55, 0.6);
  col = sglSmin(col, base, 0.15);

  // Capital — wider at top with taper
  float capital = sglCylinder(p - vec3(0.0, 5.5, 0.0), 0.55, 0.5);
  col = sglSmin(col, capital, 0.15);

  return col;
}

// ─── Stained glass window panel ───
float sglWindow(vec3 p, float width, float panelHeight) {
  // Pointed arch frame (shell: outer minus inner)
  float outer = sglArch(p, width, 0.3, panelHeight);
  float inner = sglArch(p, width - 0.3, 0.5, panelHeight - 0.15);

  // Frame is the shell
  float frame = max(outer, -inner);

  // Mullion: vertical bar dividing window
  float mullion = sglBox(p - vec3(0.0, panelHeight * 0.35, 0.0), vec3(0.06, panelHeight * 0.45, 0.15));

  // Transom: horizontal bar
  float transom = sglBox(p - vec3(0.0, panelHeight * 0.45, 0.0), vec3(width * 0.4, 0.06, 0.15));

  // Tracery: small circular opening at top
  float traceryCenter = length(vec2(p.x, p.y - panelHeight * 0.78)) - 0.25;
  float traceryRing = abs(traceryCenter) - 0.05;
  traceryRing = max(traceryRing, abs(p.z) - 0.15);

  return min(min(frame, min(mullion, transom)), traceryRing);
}

// ─── Flying buttress arch ───
float sglButtress(vec3 p, float span) {
  // Ribbed vault arch overhead
  float archD = sglArch(p, span, 0.25, span * 0.6);
  return archD;
}

// ─── Floor with stone tiles ───
float sglFloor(vec3 p) {
  return p.y + 6.0;
}

// ─── Ceiling vault ───
float sglVault(vec3 p) {
  // Pointed barrel vault
  float cx = abs(p.x);
  float vaultH = 8.0 - cx * cx * 0.08;
  return -(p.y - vaultH);
}

// ─── Complete cathedral scene ───
float sglMap(vec3 p) {
  float scene = MAX_DIST;

  // Floor
  float floorD = sglFloor(p);
  scene = min(scene, floorD);

  // Ceiling vault
  float vaultD = sglVault(p);
  scene = min(scene, vaultD);

  // Bass vibration
  float bassVib = clamp(uBass, 0.0, 1.0);

  // Nave pillars — two rows
  float pillarSpacing = 5.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float pz = fi * pillarSpacing - 10.0;

    // Left row
    float pL = sglPillar(p - vec3(-4.0, 0.0, pz), bassVib);
    scene = min(scene, pL);

    // Right row
    float pR = sglPillar(p - vec3(4.0, 0.0, pz), bassVib);
    scene = min(scene, pR);
  }

  // Stained glass windows — between pillars on each side
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float wz = fi * pillarSpacing - 7.5;

    // Left wall windows
    float wL = sglWindow(
      vec3(-(p.x + 5.5), p.y + 1.0, p.z - wz),
      3.0, 8.0
    );
    scene = min(scene, wL);

    // Right wall windows
    float wR = sglWindow(
      vec3(p.x - 5.5, p.y + 1.0, p.z - wz),
      3.0, 8.0
    );
    scene = min(scene, wR);
  }

  // Flying buttress ribs across the ceiling
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float bz = fi * pillarSpacing - 7.5;
    float buttressD = sglButtress(
      vec3(p.x, p.y - 5.0, p.z - bz),
      8.0
    );
    scene = min(scene, buttressD);
  }

  // Side walls (thick stone)
  float wallL = -(p.x + 6.0);
  float wallR = p.x - 6.0;
  scene = min(scene, min(wallL, wallR));

  // Back wall
  float wallBack = -(p.z + 14.0);
  scene = min(scene, wallBack);

  return scene;
}

// ─── Material ID: 0=stone, 1=window frame, 2=glass panel, 3=floor ───
float sglMaterialID(vec3 p) {
  float floorD = sglFloor(p);
  if (floorD < SURF_DIST * 2.0) return 3.0;

  // Check if near a window opening (not the frame)
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float wz = fi * 5.0 - 7.5;

    vec3 pL = vec3(-(p.x + 5.5), p.y + 1.0, p.z - wz);
    float innerL = sglArch(pL, 2.7, 0.5, 7.85);
    if (innerL < 0.1 && abs(p.x + 5.5) < 0.2) return 2.0;

    vec3 pR = vec3(p.x - 5.5, p.y + 1.0, p.z - wz);
    float innerR = sglArch(pR, 2.7, 0.5, 7.85);
    if (innerR < 0.1 && abs(p.x - 5.5) < 0.2) return 2.0;
  }

  // Window frame stone
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float wz = fi * 5.0 - 7.5;

    float wL = sglWindow(vec3(-(p.x + 5.5), p.y + 1.0, p.z - wz), 3.0, 8.0);
    float wR = sglWindow(vec3(p.x - 5.5, p.y + 1.0, p.z - wz), 3.0, 8.0);
    if (min(wL, wR) < SURF_DIST * 3.0) return 1.0;
  }

  return 0.0; // generic stone
}

// ─── Normal via central differences ───
vec3 sglNormal(vec3 p) {
  vec2 offset = vec2(0.005, 0.0);
  float d = sglMap(p);
  return normalize(vec3(
    sglMap(p + offset.xyy) - d,
    sglMap(p + offset.yxy) - d,
    sglMap(p + offset.yyx) - d
  ));
}

// ─── Ambient occlusion ───
float sglAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float scale = 1.0;
  for (int i = 1; i <= 5; i++) {
    float fi = float(i);
    float dist = 0.1 * fi;
    float d = sglMap(p + n * dist);
    occ += (dist - d) * scale;
    scale *= 0.6;
  }
  return clamp(1.0 - occ * 2.5, 0.0, 1.0);
}

// ─── Soft shadow (toward light) ───
float sglSoftShadow(vec3 ro, vec3 rd, float maxDist) {
  float shade = 1.0;
  float t = 0.1;
  for (int i = 0; i < 24; i++) {
    float d = sglMap(ro + rd * t);
    shade = min(shade, 8.0 * d / t);
    t += clamp(d, 0.05, 0.5);
    if (d < 0.001 || t > maxDist) break;
  }
  return clamp(shade, 0.0, 1.0);
}

// ─── Stained glass color for a window panel ───
vec3 sglGlassColor(vec2 panelUV, float windowID, float chordHue, float palHue1, float palHue2, float energy) {
  // Each pane gets a unique color from the palette
  vec2 paneID = floor(panelUV * 4.0);
  float paneHash = sglHash(paneID + windowID * 17.0);

  // Rich saturated colors: reds, blues, golds, greens
  float hue = palHue1 + paneHash * 0.5 + chordHue;
  float sat = mix(0.6, 1.0, energy);
  float bri = mix(0.5, 1.0, energy);

  vec3 glassCol = hsv2rgb(vec3(hue, sat, bri));

  // Some panes are warmer (gold/amber), some cooler (blue/violet)
  float warmBias = step(0.5, sglHash(paneID + windowID * 31.0));
  glassCol = mix(glassCol, glassCol * vec3(1.2, 0.9, 0.7), warmBias * 0.3);

  // Lead line grid within pane
  vec2 paneLocal = fract(panelUV * 4.0);
  float leadLine = smoothstep(0.02, 0.06, min(paneLocal.x, paneLocal.y));
  leadLine *= smoothstep(0.02, 0.06, min(1.0 - paneLocal.x, 1.0 - paneLocal.y));
  glassCol *= leadLine;

  return glassCol;
}

// ─── Light beams through windows (volumetric) ───
vec3 sglGodRays(vec3 ro, vec3 rd, float energy, float drumOnset, float sectionLightMul,
                float chordHue, float palHue1, float palHue2, float melodicDir,
                float climaxShatter) {
  vec3 rayAccum = vec3(0.0);
  float beamTime = uDynamicTime * 0.04 * sectionLightMul;

  // March through the volume looking for window-illuminated regions
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float t = 1.0 + fi * 1.5;
    vec3 pos = ro + rd * t;

    // Check proximity to window planes (x = +/-5.5)
    for (int w = 0; w < 4; w++) {
      float fw = float(w);
      float wz = fw * 5.0 - 7.5;

      // Light enters from left windows
      {
        float windowDist = abs(pos.x + 5.5);
        float zDist = abs(pos.z - wz);
        if (windowDist < 4.0 && zDist < 2.0 && pos.y > -4.0 && pos.y < 4.0) {
          // Beam angle from window
          float beamAngle = atan(pos.y + 2.0, pos.x + 5.5);
          float beamMask = exp(-windowDist * 0.4);

          // Dust motes in the beam
          float dustNoise = fbm3(vec3(pos * 0.8 + vec3(beamTime * 0.5, 0.0, 0.0)));
          float dust = 0.3 + dustNoise * 0.7;

          // Window color
          vec2 panelUV = vec2(
            (pos.z - wz) / 3.0 + 0.5,
            (pos.y + 4.0) / 8.0
          );
          vec3 wColor = sglGlassColor(panelUV, fw, chordHue, palHue1, palHue2, energy);

          // Sweep beam direction with melodic direction
          float sweep = sin(beamTime + melodicDir * 1.5 + fw * 1.2) * 0.3;
          beamMask *= smoothstep(1.5, 0.0, abs(beamAngle - sweep));

          rayAccum += wColor * beamMask * dust * 0.015;
        }
      }

      // Light enters from right windows
      {
        float windowDist = abs(pos.x - 5.5);
        float zDist = abs(pos.z - wz);
        if (windowDist < 4.0 && zDist < 2.0 && pos.y > -4.0 && pos.y < 4.0) {
          float beamAngle = atan(pos.y + 2.0, -(pos.x - 5.5));
          float beamMask = exp(-windowDist * 0.4);

          float dustNoise = fbm3(vec3(pos * 0.8 - vec3(beamTime * 0.5, 0.0, 0.0)));
          float dust = 0.3 + dustNoise * 0.7;

          vec2 panelUV = vec2(
            (pos.z - wz) / 3.0 + 0.5,
            (pos.y + 4.0) / 8.0
          );
          vec3 wColor = sglGlassColor(panelUV, fw + 10.0, chordHue, palHue1, palHue2, energy);

          float sweep = sin(beamTime + melodicDir * 1.5 + fw * 1.2 + PI) * 0.3;
          beamMask *= smoothstep(1.5, 0.0, abs(beamAngle - sweep));

          rayAccum += wColor * beamMask * dust * 0.015;
        }
      }
    }
  }

  // Drum onset flash — bright burst through all windows
  rayAccum *= 1.0 + drumOnset * 3.0;

  // Climax shatter — everything becomes pure white light
  rayAccum = mix(rayAccum, vec3(length(rayAccum) * 1.5), climaxShatter);

  return rayAccum * energy;
}

// ─── Stone texture ───
vec3 sglStoneColor(vec3 p, float beatStab) {
  // Base limestone / sandstone
  float n1 = fbm3(vec3(p * 3.0));
  float n2 = fbm3(vec3(p * 8.0 + 100.0));

  vec3 stone = vec3(0.18, 0.16, 0.14);
  stone += n1 * vec3(0.04, 0.035, 0.03);
  stone += n2 * vec3(0.02, 0.018, 0.015);

  // Beat stability → more coherent texture (less noise variation)
  stone = mix(stone, vec3(0.17, 0.15, 0.13), beatStab * 0.3);

  return stone;
}

// ─── Candle flicker (for space sections) ───
vec3 sglCandleLight(vec3 p, float spaceAmount) {
  if (spaceAmount < 0.01) return vec3(0.0);

  vec3 candleGlow = vec3(0.0);
  // Several candle positions along the nave
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 candlePos = vec3(
      sin(fi * 2.5) * 2.0,
      -5.5,
      fi * 4.0 - 6.0
    );
    float dist = length(p - candlePos);
    // Flickering intensity
    float flicker = 0.7 + 0.3 * sin(uDynamicTime * (5.0 + fi * 1.3) + fi * 10.0);
    flicker *= 0.8 + 0.2 * sin(uDynamicTime * (8.0 + fi * 2.1));

    vec3 warmth = vec3(1.0, 0.7, 0.3) * flicker;
    candleGlow += warmth / (1.0 + dist * dist * 0.3) * 0.4;
  }

  return candleGlow * spaceAmount;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ─── Audio parameters ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicDir = clamp(uMelodicDirection, -1.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float spaceScore = clamp(uSpaceScore, 0.0, 1.0);
  float timbralBri = clamp(uTimbralBrightness, 0.0, 1.0);
  float cosmicSem = clamp(uSemanticCosmic, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float stemVocals = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalTotal = max(vocalPres, stemVocals);

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section light multiplier: jam=dancing beams, space=dim candles, chorus=flood
  float sectionLightMul = 1.0;
  sectionLightMul = mix(sectionLightMul, 1.6, sJam);    // beams dance faster
  sectionLightMul = mix(sectionLightMul, 0.2, sSpace);   // nearly dark
  sectionLightMul = mix(sectionLightMul, 1.3, sChorus);  // bright
  sectionLightMul = mix(sectionLightMul, 1.1, sSolo);    // slightly brighter

  float sectionBrightness = 1.0;
  sectionBrightness = mix(sectionBrightness, 1.1, sJam);
  sectionBrightness = mix(sectionBrightness, 0.15, sSpace);  // candlelit darkness
  sectionBrightness = mix(sectionBrightness, 1.5, sChorus);  // full sunlight flood
  sectionBrightness = mix(sectionBrightness, 1.2, sSolo);

  // ─── Palette ───
  float chromaHueMod = uChromaHue * 0.15;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.2;
  float palHue1 = uPalettePrimary + chromaHueMod + chordHue;
  float palHue2 = uPaletteSecondary + chordHue * 0.5;

  // ─── Climax: windows shatter outward ───
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxShatter = isClimax * climaxIntensity;

  // ─── Camera ray (uses 3D camera system) ───
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Position camera inside the nave, looking down the aisle
  // Override with gentle sway
  float camSway = sin(uDynamicTime * 0.03) * 0.3;
  ro = vec3(camSway, -1.0, -8.0);
  vec3 lookAt = vec3(sin(uDynamicTime * 0.015) * 0.5, 0.5, 5.0);
  vec3 fwd = normalize(lookAt - ro);
  vec3 camRight = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 camUp = cross(camRight, fwd);
  float fovScale = tan(radians(mix(55.0, 65.0, energy)) * 0.5);
  vec2 sp = (uv - 0.5) * aspect;
  rd = normalize(fwd + camRight * sp.x * fovScale + camUp * sp.y * fovScale);

  // ─── Raymarch the cathedral ───
  float totalDist = 0.0;
  float marchDist = 0.0;
  bool marchHit = false;
  vec3 marchPos = ro;

  for (int i = 0; i < MAX_STEPS; i++) {
    marchPos = ro + rd * totalDist;
    marchDist = sglMap(marchPos);

    if (marchDist < SURF_DIST) {
      marchHit = true;
      break;
    }
    if (totalDist > MAX_DIST) break;

    totalDist += marchDist * 0.8; // slow down for accuracy
  }

  // ─── Shading ───
  vec3 col = vec3(0.0);

  if (marchHit) {
    vec3 pos = marchPos;
    vec3 norm = sglNormal(pos);
    float matID = sglMaterialID(pos);
    float occlusion = sglAO(pos, norm);

    // ─── Lighting ───
    // Primary light: through the windows (colored, directional)
    vec3 lightDir1 = normalize(vec3(-1.0, 0.8, 0.3));
    vec3 lightDir2 = normalize(vec3(1.0, 0.8, -0.2));
    float diffuse1 = max(0.0, dot(norm, lightDir1));
    float diffuse2 = max(0.0, dot(norm, lightDir2));

    // Shadows
    float shadow1 = sglSoftShadow(pos + norm * 0.02, lightDir1, 10.0);
    float shadow2 = sglSoftShadow(pos + norm * 0.02, lightDir2, 10.0);

    // Specular (timbral brightness controls intensity)
    vec3 viewDir = normalize(ro - pos);
    vec3 halfDir1 = normalize(lightDir1 + viewDir);
    float spec1 = pow(max(0.0, dot(norm, halfDir1)), 32.0) * timbralBri;

    // Material colors
    vec3 matColor;
    if (matID > 2.5) {
      // Floor: stone tiles with colored light patterns
      vec3 stoneBase = sglStoneColor(pos, beatStab);
      // Colored light from windows projected on floor
      vec2 floorUV = pos.xz * 0.1;
      float floorPattern = fbm3(vec3(floorUV * 2.0 + uDynamicTime * 0.01, 0.0));
      vec3 projectedLight = hsv2rgb(vec3(palHue1 + floorPattern * 0.3, 0.6 * energy, 0.3 * energy));
      matColor = stoneBase + projectedLight * sectionBrightness * 0.5;
    } else if (matID > 1.5) {
      // Glass panel: transmit colored light
      vec2 glassUV = vec2(pos.z * 0.15, (pos.y + 4.0) / 8.0);
      matColor = sglGlassColor(glassUV, floor(pos.z * 0.2 + 10.0), chordHue, palHue1, palHue2, energy);
      matColor *= 1.0 + drumOnset * 2.0; // flash on hit

      // Climax: glass shatters — fragments break outward
      if (climaxShatter > 0.1) {
        float shatterNoise = fbm3(vec3(pos * 5.0 + climaxShatter * 3.0));
        float shatterMask = smoothstep(0.3, 0.8, shatterNoise * climaxShatter);
        matColor = mix(matColor, vec3(2.0, 1.8, 1.5), shatterMask);
      }
    } else if (matID > 0.5) {
      // Window frame: dark carved stone
      matColor = sglStoneColor(pos * 2.0, beatStab) * 0.5;
    } else {
      // Generic stone: pillars, walls, vault
      matColor = sglStoneColor(pos, beatStab);
    }

    // ─── Combine lighting ───
    float energySq = energy * energy;

    // Base ambient — deeper with tension
    float ambientLevel = mix(0.08, 0.04, tension);
    vec3 ambient = matColor * ambientLevel;

    // Warm vocal ambient fill
    vec3 vocalWarm = vec3(1.0, 0.85, 0.65) * vocalTotal * 0.08;

    // Diffuse from window light
    vec3 lightCol1 = hsv2rgb(vec3(palHue1, 0.5, 1.0));
    vec3 lightCol2 = hsv2rgb(vec3(palHue2, 0.5, 1.0));
    vec3 diffuseLight = lightCol1 * diffuse1 * shadow1 + lightCol2 * diffuse2 * shadow2;
    diffuseLight *= energySq * sectionBrightness;

    // Apply
    col = ambient + matColor * diffuseLight + vocalWarm;
    col += vec3(1.0, 0.95, 0.9) * spec1 * shadow1 * 0.15;
    col *= occlusion;

    // Space score → reverb echo glow (soft bounced light)
    col += matColor * spaceScore * 0.05;

    // Cosmic semantic → ethereal uplighting
    col += vec3(0.05, 0.03, 0.08) * cosmicSem * 0.5;

    // Drum onset: flash illumination on all surfaces
    col *= 1.0 + drumOnset * 0.8;

  } else {
    // Background: void beyond the cathedral (deep indigo)
    col = vec3(0.01, 0.008, 0.02);
  }

  // ─── Volumetric god rays through windows ───
  vec3 godRays = sglGodRays(
    ro, rd, energy, drumOnset, sectionLightMul,
    chordHue, palHue1, palHue2, melodicDir, climaxShatter
  );
  col += godRays;

  // ─── Candle light in space sections ───
  col += sglCandleLight(marchHit ? marchPos : ro + rd * 5.0, sSpace);

  // ─── Dust motes (slow energy drives density) ───
  {
    float dustDensity = mix(0.02, 0.08, slowE);
    float dustNoise = fbm3(vec3(screenP * 8.0, uDynamicTime * 0.1));
    float dustMask = smoothstep(0.5, 0.9, dustNoise);
    vec3 dustColor = vec3(0.9, 0.8, 0.6) * energy * dustDensity;
    col += dustColor * dustMask * 0.15;
  }

  // ─── Climax: pure light overwhelming everything ───
  if (climaxShatter > 0.5) {
    float whiteout = smoothstep(0.5, 1.0, climaxShatter);
    col = mix(col, vec3(1.5, 1.4, 1.2), whiteout * 0.7);
  }

  // ─── Beat pulse on stone ───
  col *= 1.0 + uBeatSnap * 0.06;

  // ─── SDF icon emergence ───
  {
    float nf = fbm3(vec3(screenP * 2.0, uDynamicTime * 0.05));
    vec3 c1 = hsv2rgb(vec3(palHue1, 0.8, 1.0));
    vec3 c2 = hsv2rgb(vec3(palHue2, 0.8, 1.0));
    col += iconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
    col += heroIconEmergence(screenP, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ─── Atmospheric depth fog ───
  {
    float fogDist = marchHit ? totalDist : MAX_DIST;
    float fogAmount = 1.0 - exp(-fogDist * 0.04);
    vec3 fogColor = mix(vec3(0.02, 0.015, 0.03), vec3(0.04, 0.03, 0.05), energy);
    // Tension deepens the fog
    fogColor *= mix(1.0, 0.5, tension);
    col = mix(col, fogColor, fogAmount * 0.6);
  }

  // ─── Vignette: cathedral darkness at edges ───
  {
    float vigScale = mix(0.32, 0.24, energy);
    float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    col = mix(vec3(0.002, 0.001, 0.004), col, vignette);
  }

  // ─── Post-processing ───
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
