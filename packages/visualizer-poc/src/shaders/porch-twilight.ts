/**
 * Porch Twilight — raymarched cabin porch scene for "Sing Me Back Home."
 * Rocking chair SDF on a wooden deck. Firefly particles. Sunset volumetrics
 * through tree silhouettes. The warmest, most peaceful shader in the set.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → rocking chair amplitude
 *   uEnergy           → firefly count/brightness, overall luminance
 *   uDrumOnset        → firefly pulse sync
 *   uVocalPresence    → sunset warmth, cabin glow behind camera
 *   uHarmonicTension  → sky darkening (sunset → dusk → night)
 *   uMelodicPitch     → firefly height distribution
 *   uSectionType      → jam=fireflies swarm, space=perfect stillness,
 *                        chorus=golden hour warmth
 *   uClimaxPhase      → sunset blazes then fades to stars
 *   uClimaxIntensity  → climax effect strength
 *   uSlowEnergy       → chair rock speed
 *   uSemanticTender   → warmth multiplier across entire scene
 *   uBeatStability    → chair rock smoothness
 *   uSpaceScore       → stillness depth
 *   uDynamicRange     → firefly brightness contrast
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildRaymarchAO } from "./shared/raymarching.glsl";

export const porchTwilightVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "light",
  bloomEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  caEnabled: false,
  lensDistortionEnabled: true,
  eraGradingEnabled: true,
});

const ptNormalGLSL = buildRaymarchNormal("ptMap($P, rockAngle)", { eps: 0.001, name: "ptNormal" });
const ptOccGLSL = buildRaymarchAO("ptMap($P, rockAngle)", { steps: 5, stepBase: 0.02, stepScale: 0.06, weightDecay: 0.65, finalMult: 3.0, name: "ptOcclusion" });

export const porchTwilightFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PT_PI 3.14159265
#define PT_MAX_STEPS 80
#define PT_MAX_DIST 40.0
#define PT_SURF_DIST 0.002
#define PT_FIREFLY_COUNT 24

// ═══════════════════════════════════════════════════════
// SDF Primitives (all pt-prefixed)
// ═══════════════════════════════════════════════════════

float ptSdBox(vec3 pos, vec3 size) {
  vec3 q = abs(pos) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float ptSdCylinder(vec3 pos, float radius, float halfHeight) {
  vec2 d = abs(vec2(length(pos.xz), pos.y)) - vec2(radius, halfHeight);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float ptSdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float ptSdPlane(vec3 pos, float height) {
  return pos.y - height;
}

// Smooth minimum for organic SDF blending
float ptSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ═══════════════════════════════════════════════════════
// Scene SDF Components
// ═══════════════════════════════════════════════════════

// Rocking chair: two curved rockers, seat, backrest, armrests, legs
float ptChair(vec3 pos, float rockAngle) {
  // Apply rocking rotation around Z axis at the rocker contact point
  float cRock = cos(rockAngle);
  float sRock = sin(rockAngle);
  vec3 rp = pos;
  rp.y -= -0.25; // pivot at rocker bottom
  rp = vec3(rp.x, cRock * rp.y - sRock * rp.z, sRock * rp.y + cRock * rp.z);
  rp.y += -0.25;

  float d = 1e10;

  // Two curved rockers (elongated boxes with slight curvature approximated as capsules)
  for (int i = 0; i < 2; i++) {
    float side = float(i) * 2.0 - 1.0; // -1 or 1
    vec3 rockerPos = rp - vec3(side * 0.22, -0.28, 0.0);
    // Rocker: thin curved beam — approximate with elongated box
    float rocker = ptSdBox(rockerPos, vec3(0.02, 0.015, 0.35));
    // Curve the rocker: subtract y based on z^2
    rocker -= max(0.0, 0.04 - rockerPos.z * rockerPos.z * 0.3);
    d = min(d, rocker);
  }

  // Seat: flat box
  float seat = ptSdBox(rp - vec3(0.0, -0.05, -0.02), vec3(0.2, 0.015, 0.2));
  d = min(d, seat);

  // Backrest: angled thin box
  vec3 backPos = rp - vec3(0.0, 0.22, -0.2);
  float cBack = cos(0.15);
  float sBack = sin(0.15);
  backPos = vec3(backPos.x, cBack * backPos.y - sBack * backPos.z, sBack * backPos.y + cBack * backPos.z);
  float back = ptSdBox(backPos, vec3(0.18, 0.24, 0.012));
  d = min(d, back);

  // Four legs
  for (int i = 0; i < 4; i++) {
    float lx = (float(i / 2) * 2.0 - 1.0) * 0.18;
    float lz = (mod(float(i), 2.0) * 2.0 - 1.0) * 0.16;
    float leg = ptSdCylinder(rp - vec3(lx, -0.16, lz), 0.015, 0.12);
    d = min(d, leg);
  }

  // Two armrests
  for (int i = 0; i < 2; i++) {
    float side = float(i) * 2.0 - 1.0;
    float armrest = ptSdBox(rp - vec3(side * 0.22, 0.1, -0.02), vec3(0.015, 0.015, 0.18));
    d = min(d, armrest);
    // Armrest supports
    float armSupport = ptSdCylinder(rp - vec3(side * 0.22, 0.02, 0.12), 0.012, 0.08);
    d = min(d, armSupport);
  }

  return d;
}

// Porch deck: flat plane with plank seams
float ptPorch(vec3 pos) {
  float deck = ptSdPlane(pos, -0.35);
  return deck;
}

// Porch railing with vertical balusters
float ptRailing(vec3 pos) {
  float d = 1e10;

  // Top rail: horizontal bar at the porch edge
  float topRail = ptSdBox(pos - vec3(0.0, 0.35, 1.8), vec3(3.0, 0.025, 0.025));
  d = min(d, topRail);

  // Bottom rail
  float bottomRail = ptSdBox(pos - vec3(0.0, -0.15, 1.8), vec3(3.0, 0.025, 0.025));
  d = min(d, bottomRail);

  // Vertical balusters (repeating)
  float spacing = 0.3;
  float repX = mod(pos.x + spacing * 0.5, spacing) - spacing * 0.5;
  vec3 balusterPos = vec3(repX, pos.y + 0.1, pos.z - 1.8);
  float baluster = ptSdBox(balusterPos, vec3(0.012, 0.28, 0.012));
  // Only balusters within railing width
  float inRange = step(-3.0, pos.x) * step(pos.x, 3.0);
  d = min(d, baluster + (1.0 - inRange) * 10.0);

  return d;
}

// Tree silhouettes: cylinder trunk + sphere canopy
float ptTree(vec3 pos, vec3 treePos, float trunkH, float canopyR) {
  vec3 rp = pos - treePos;
  float trunk = ptSdCylinder(rp - vec3(0.0, trunkH * 0.4, 0.0), 0.15, trunkH * 0.5);
  float canopy = ptSdSphere(rp - vec3(0.0, trunkH * 0.85, 0.0), canopyR);
  return min(trunk, canopy);
}

// Complete scene SDF
float ptMap(vec3 pos, float rockAngle) {
  float d = 1e10;

  // Porch deck
  d = min(d, ptPorch(pos));

  // Rocking chair (slightly left of center, toward the viewer)
  d = min(d, ptChair(pos - vec3(-0.4, 0.0, 0.6), rockAngle));

  // Porch railing
  d = min(d, ptRailing(pos));

  // Trees in the distance (beyond the railing)
  d = min(d, ptTree(pos, vec3(-4.0, -0.35, 8.0), 3.5, 2.0));
  d = min(d, ptTree(pos, vec3(3.5, -0.35, 10.0), 4.0, 2.5));
  d = min(d, ptTree(pos, vec3(-1.5, -0.35, 12.0), 5.0, 3.0));
  d = min(d, ptTree(pos, vec3(6.0, -0.35, 9.0), 3.0, 1.8));
  d = min(d, ptTree(pos, vec3(-7.0, -0.35, 11.0), 4.5, 2.2));
  d = min(d, ptTree(pos, vec3(1.0, -0.35, 15.0), 5.5, 3.5));

  return d;
}

// ─── Normal + AO (shared raymarching utilities) ───
${ptNormalGLSL}
${ptOccGLSL}

// ═══════════════════════════════════════════════════════
// Firefly system: sine-path spheres with warm glow
// ═══════════════════════════════════════════════════════

vec3 ptFirefly(vec2 screenUV, float time, float energy, float drumOnset,
               float melodicPitch, float dynamicRange, int idx, float sectionMod) {
  float fi = float(idx);
  // Deterministic hash seeds per firefly
  float h1 = fract(sin(fi * 127.1 + 3.7) * 43758.5453);
  float h2 = fract(sin(fi * 311.7 + 7.3) * 43758.5453);
  float h3 = fract(sin(fi * 543.3 + 11.1) * 43758.5453);
  float h4 = fract(sin(fi * 731.9 + 13.7) * 43758.5453);

  // 3D position on slow sine paths
  float speed = 0.15 + h1 * 0.25;
  speed *= sectionMod; // section-type modulates swarm speed

  float px = (h2 - 0.5) * 2.5 + sin(time * speed * 0.7 + h3 * 6.28) * 0.8;
  float py = 0.1 + melodicPitch * 0.5 + h4 * 0.6 + sin(time * speed * 0.5 + h1 * 6.28) * 0.3;
  float pz = 2.0 + h3 * 8.0 + cos(time * speed * 0.3 + h2 * 6.28) * 1.0;

  // Project 3D firefly position to approximate screen space
  // (simple perspective: x/z, y/z)
  float projScale = 1.5 / (pz * 0.3 + 0.5);
  vec2 fireflyScreen = vec2(px, py) * projScale;

  float dist = length(screenUV - fireflyScreen);

  // Pulse on/off with slow sine + drum onset sync
  float pulse = 0.5 + 0.5 * sin(time * (1.5 + h1 * 2.0) + h2 * 6.28);
  pulse = smoothstep(0.3, 0.7, pulse); // sharpen on/off
  // Drum onset sparks all fireflies briefly
  pulse = max(pulse, drumOnset * 0.8);
  // Dynamic range controls brightness contrast between bright/dim fireflies
  pulse *= mix(0.6, 1.0, dynamicRange * h1);

  // Warm yellow-green glow
  float glow = exp(-dist * dist * 800.0) * pulse;
  float outerGlow = exp(-dist * dist * 80.0) * pulse * 0.3;

  // Color: warm yellow-green core, amber outer halo
  vec3 coreColor = vec3(0.9, 0.95, 0.3); // yellow-green
  vec3 haloColor = vec3(1.0, 0.75, 0.2);  // warm amber

  return coreColor * glow * energy + haloColor * outerGlow * energy;
}

// ═══════════════════════════════════════════════════════
// Sunset sky with volumetric color gradient
// ═══════════════════════════════════════════════════════

vec3 ptSunsetSky(vec3 rayDir, float tension, float vocalPresence, float tender,
                 float climaxPhase, float climaxIntensity, float time) {
  float skyY = rayDir.y;

  // Base sunset gradient: deep orange at horizon → purple → dark blue at zenith
  vec3 horizon = vec3(0.95, 0.45, 0.15);  // deep warm orange
  vec3 midSky = vec3(0.55, 0.2, 0.45);    // purple-magenta transition
  vec3 zenith = vec3(0.05, 0.05, 0.18);   // deep navy

  // Tension darkens the sky (sunset progresses to dusk)
  horizon = mix(horizon, vec3(0.6, 0.25, 0.1), tension * 0.5);
  midSky = mix(midSky, vec3(0.2, 0.08, 0.25), tension * 0.4);
  zenith = mix(zenith, vec3(0.02, 0.02, 0.08), tension * 0.3);

  // Vocal presence warms the entire sky
  float warmth = vocalPresence * 0.3 + tender * 0.2;
  horizon += vec3(0.15, 0.08, 0.0) * warmth;
  midSky += vec3(0.05, 0.02, 0.0) * warmth;

  // Climax: sunset blazes (phases 1-2) then fades to starry night (phase 3)
  float blazePhase = smoothstep(0.5, 2.0, climaxPhase) * (1.0 - smoothstep(2.0, 3.0, climaxPhase));
  float nightPhase = smoothstep(2.5, 3.5, climaxPhase);

  horizon += vec3(0.3, 0.15, 0.0) * blazePhase * climaxIntensity;
  horizon = mix(horizon, vec3(0.08, 0.04, 0.12), nightPhase * 0.7);
  midSky = mix(midSky, vec3(0.03, 0.02, 0.08), nightPhase * 0.6);

  // Build gradient
  float band1 = smoothstep(-0.05, 0.15, skyY); // horizon → mid
  float band2 = smoothstep(0.15, 0.55, skyY);  // mid → zenith

  vec3 sky = mix(horizon, midSky, band1);
  sky = mix(sky, zenith, band2);

  // Sun disc (just above horizon, slightly right)
  vec3 sunDir = normalize(vec3(0.3, 0.08, 1.0));
  float sunDot = max(0.0, dot(rayDir, sunDir));
  float sunDisc = smoothstep(0.997, 0.999, sunDot);
  float sunGlow = pow(sunDot, 32.0);
  float sunHalo = pow(sunDot, 4.0);

  vec3 sunColor = vec3(1.0, 0.85, 0.5);
  sunColor = mix(sunColor, vec3(1.0, 0.5, 0.2), blazePhase * 0.5);

  sky += sunColor * sunDisc * 2.0 * (1.0 - nightPhase * 0.9);
  sky += sunColor * sunGlow * 0.5 * (1.0 - nightPhase * 0.8);
  sky += vec3(1.0, 0.6, 0.3) * sunHalo * 0.15 * (1.0 - nightPhase * 0.7);

  // Stars: appear as sky darkens (tension + night phase)
  float starVisibility = tension * 0.5 + nightPhase * 0.8;
  starVisibility *= smoothstep(0.2, 0.5, skyY); // stars only above horizon
  // Star field from ray direction
  vec2 starUV = rayDir.xz / max(0.1, rayDir.y) * 3.0;
  vec2 starCell = floor(starUV * 40.0);
  float starH = fract(sin(dot(starCell, vec2(127.1, 311.7))) * 43758.5453);
  float starH2 = fract(sin(dot(starCell, vec2(269.5, 183.3))) * 43758.5453);
  float star = step(0.97, starH) * (0.5 + 0.5 * sin(time * (1.0 + starH2 * 3.0) + starH * 6.28));
  sky += vec3(0.9, 0.85, 0.75) * max(0.0, star) * starVisibility;

  return sky;
}

// ═══════════════════════════════════════════════════════
// Volumetric sunset light through tree gaps
// ═══════════════════════════════════════════════════════

float ptVolumetricSunset(vec3 pos, vec3 sunDir, float time, float energy) {
  // Sample a few points along the ray toward the sun
  float accum = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 samplePos = pos + sunDir * fi * 0.5;
    // Check if blocked by trees (approximate with noise field)
    float treeDensity = fbm3(vec3(samplePos.x * 0.3, samplePos.y * 0.5, samplePos.z * 0.2 + time * 0.01));
    float blockage = smoothstep(0.1, 0.4, treeDensity);
    accum += (1.0 - blockage) * exp(-fi * 0.3);
  }
  return accum * 0.15 * (0.5 + energy * 0.5);
}

// ═══════════════════════════════════════════════════════
// Plank texture for the porch deck
// ═══════════════════════════════════════════════════════

float ptPlankSeams(vec3 pos) {
  // Horizontal planks running along X
  float plankWidth = 0.18;
  float seamZ = abs(mod(pos.z + plankWidth * 0.5, plankWidth) - plankWidth * 0.5);
  float seam = smoothstep(0.005, 0.002, seamZ);
  // Stagger joints along X
  float jointX = abs(mod(pos.x + 0.6 * step(0.5, fract(pos.z / plankWidth)), 1.2) - 0.6);
  float joint = smoothstep(0.005, 0.002, jointX);
  return max(seam, joint) * 0.3;
}

// Wood grain pattern
float ptWoodGrain(vec3 pos) {
  float grain = snoise(vec3(pos.x * 0.5, pos.z * 12.0, 0.0)) * 0.3;
  grain += snoise(vec3(pos.x * 1.0, pos.z * 24.0, 5.0)) * 0.15;
  return grain;
}

// ═══════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // === AUDIO INPUTS (14+ uniforms) ===
  float bass = clamp(uBass, 0.0, 1.0);
  float energy = clamp(uEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxInt = clamp(uClimaxIntensity, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tender = clamp(uSemanticTender, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float spaceScr = clamp(uSpaceScore, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  float flowTime = uDynamicTime;

  // === ROCKING CHAIR ANIMATION ===
  // Bass drives amplitude, slowEnergy drives speed, beatStability smooths
  float rockSpeed = 0.8 + slowE * 0.6;
  rockSpeed *= mix(1.0, 0.2, sSpace); // near-still in space sections
  float rockAmplitude = 0.04 + bass * 0.08;
  rockAmplitude *= mix(1.0, 0.1, sSpace * spaceScr);
  rockAmplitude *= 1.0 + sJam * 0.3; // slightly more vigorous in jams
  float rockSmooth = mix(0.7, 1.0, beatStab); // stability smooths the motion
  float rockAngle = sin(flowTime * rockSpeed) * rockAmplitude * rockSmooth;

  // === CAMERA SETUP ===
  // Seated on the porch, looking out toward the sunset / trees
  vec3 rayOrigin = vec3(0.5, 0.15, -0.5);
  vec3 lookAt = vec3(0.0, 0.3, 12.0);

  // Subtle camera sway (breathing, peaceful)
  rayOrigin.x += sin(flowTime * 0.1) * 0.03 * (1.0 - sSpace * 0.8);
  rayOrigin.y += sin(flowTime * 0.07) * 0.01;

  vec3 camForward = normalize(lookAt - rayOrigin);
  vec3 camSide = normalize(cross(camForward, vec3(0.0, 1.0, 0.0)));
  vec3 camUp2 = cross(camSide, camForward);

  float fovScale = tan(radians(55.0) * 0.5);
  vec2 sp = (uv - 0.5) * aspect;
  vec3 rayDir = normalize(camForward + camSide * sp.x * fovScale + camUp2 * sp.y * fovScale);

  // === RAYMARCH ===
  float totalDist = 0.0;
  float marchDist = 0.0;
  bool didHitSurface = false;
  vec3 marchPos = rayOrigin;

  for (int i = 0; i < PT_MAX_STEPS; i++) {
    marchPos = rayOrigin + rayDir * totalDist;
    marchDist = ptMap(marchPos, rockAngle);

    if (marchDist < PT_SURF_DIST) {
      didHitSurface = true;
      break;
    }
    if (totalDist > PT_MAX_DIST) break;

    totalDist += marchDist;
  }

  // === SUNSET SKY (background) ===
  vec3 col = ptSunsetSky(rayDir, tension, vocalPres, tender,
                          climaxPhase, climaxInt, flowTime);

  // === SURFACE SHADING ===
  if (didHitSurface) {
    vec3 norm = ptNormal(marchPos);
    float occ = ptOcclusion(marchPos, norm);

    // Sun direction (matching sky sun)
    vec3 sunDir = normalize(vec3(0.3, 0.08, 1.0));
    float sunNDot = max(0.0, dot(norm, sunDir));

    // Warm sunset lighting
    float warmthMult = 1.0 + tender * 0.4 + vocalPres * 0.2;
    vec3 sunLight = vec3(1.0, 0.7, 0.4) * sunNDot * 0.6 * warmthMult;
    // Golden hour boost during chorus
    sunLight *= 1.0 + sChorus * 0.4;
    // Climax blaze
    float blazePhase = smoothstep(0.5, 2.0, climaxPhase) * (1.0 - smoothstep(2.0, 3.0, climaxPhase));
    sunLight += vec3(0.3, 0.12, 0.0) * blazePhase * climaxInt;

    // Ambient: warm sky fill from above + cabin glow from behind
    vec3 skyAmbient = vec3(0.15, 0.1, 0.2) * (0.5 + 0.5 * max(0.0, norm.y));
    // Cabin interior glow from behind camera (warm orange light)
    float cabinGlow = max(0.0, -norm.z) * (0.15 + vocalPres * 0.25);
    vec3 cabinLight = vec3(0.9, 0.55, 0.2) * cabinGlow;

    // Fill light from below (porch reflection)
    float groundBounce = max(0.0, -norm.y) * 0.08;
    vec3 bounceLight = vec3(0.6, 0.35, 0.15) * groundBounce;

    vec3 lighting = sunLight + skyAmbient + cabinLight + bounceLight;
    lighting *= occ;

    // === MATERIAL COLORS ===
    vec3 matColor = vec3(0.35, 0.2, 0.1); // default warm wood

    // Porch deck: darker wood with grain
    if (marchPos.y < -0.3) {
      float grain = ptWoodGrain(marchPos);
      float seams = ptPlankSeams(marchPos);
      matColor = vec3(0.25, 0.14, 0.07) + vec3(0.08, 0.04, 0.02) * grain;
      matColor *= 1.0 - seams * 0.5;
    }
    // Railing: lighter aged wood
    else if (marchPos.z > 1.7 && marchPos.z < 1.9) {
      matColor = vec3(0.4, 0.28, 0.15);
    }
    // Trees: dark silhouette
    else if (marchPos.z > 5.0) {
      matColor = vec3(0.03, 0.04, 0.02);
      // Very slight rim light from sunset
      float rimSun = pow(max(0.0, dot(norm, sunDir)), 8.0);
      matColor += vec3(0.15, 0.08, 0.02) * rimSun;
    }
    // Chair: warm reddish-brown wood
    else if (marchPos.z > 0.0 && marchPos.z < 1.5 && marchPos.x < 0.2) {
      matColor = vec3(0.38, 0.18, 0.08);
      // Subtle wood grain on chair
      float chairGrain = snoise(vec3(marchPos.x * 5.0, marchPos.y * 20.0, marchPos.z * 5.0));
      matColor += vec3(0.05, 0.02, 0.01) * chairGrain;
    }

    col = matColor * lighting;

    // Volumetric sunset beams through tree gaps
    float volSunset = ptVolumetricSunset(marchPos, sunDir, flowTime, energy);
    col += vec3(1.0, 0.6, 0.25) * volSunset * warmthMult * (1.0 - smoothstep(2.5, 3.5, climaxPhase) * 0.7);

    // Distance fog: blends to sunset sky color at distance
    float fogDist = length(marchPos - rayOrigin);
    float fog = 1.0 - exp(-fogDist * 0.04);
    vec3 fogColor = vec3(0.5, 0.3, 0.2) * warmthMult;
    fogColor = mix(fogColor, vec3(0.1, 0.05, 0.15), tension * 0.4); // darken with tension
    col = mix(col, fogColor, fog);
  }

  // === FIREFLIES ===
  {
    // Energy + section type modulates firefly count/visibility
    float fireflyGate = smoothstep(0.05, 0.3, energy) * (1.0 - sSpace * 0.8);
    fireflyGate *= 1.0 + sJam * 0.5; // more fireflies in jams

    float sectionSpeed = mix(1.0, 2.0, sJam) * mix(1.0, 0.2, sSpace);

    if (fireflyGate > 0.01) {
      vec3 fireflyTotal = vec3(0.0);
      for (int i = 0; i < PT_FIREFLY_COUNT; i++) {
        // Gate individual fireflies based on energy (more appear at higher energy)
        float threshold = float(i) / float(PT_FIREFLY_COUNT);
        float individualGate = smoothstep(threshold * 0.8, threshold * 0.8 + 0.1, energy);
        if (individualGate > 0.01) {
          fireflyTotal += ptFirefly(screenP, flowTime, individualGate,
                                     drumOnset, melodicP, dynRange, i, sectionSpeed);
        }
      }
      col += fireflyTotal * fireflyGate * (0.8 + tender * 0.4);
    }
  }

  // === WARMTH MULTIPLIER (uSemanticTender) ===
  // Tender passages get an overall warm golden tint
  {
    float tenderWarm = tender * 0.15;
    col += col * vec3(0.12, 0.06, -0.02) * tenderWarm;
  }

  // === CABIN WINDOW GLOW ===
  // Warm light spill from the cabin behind the camera, illuminating the scene edges
  {
    float windowGlow = smoothstep(0.6, 0.0, abs(screenP.x + 0.3)) * smoothstep(0.4, 0.0, abs(screenP.y - 0.1));
    float windowStrength = 0.04 + vocalPres * 0.06 + tender * 0.03;
    col += vec3(0.9, 0.55, 0.2) * windowGlow * windowStrength;
  }

  // === DARKNESS TEXTURE (very low energy) ===
  col += darknessTexture(uv, uTime, energy);

  // === PALETTE INFLUENCE ===
  {
    vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary, 0.5 * uPaletteSaturation, 0.8));
    vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary, 0.4 * uPaletteSaturation, 0.7));
    // Subtle palette wash: warm layer blended over the scene
    float palNoise = fbm3(vec3(screenP * 1.5, flowTime * 0.05));
    vec3 palBlend = mix(palCol1, palCol2, palNoise * 0.5 + 0.5) * 0.04;
    col += palBlend * energy * 0.3;
  }

  // === ICON EMERGENCE ===
  {
    float nf = fbm6(vec3(screenP * 2.0, flowTime * 0.08));
    vec3 iconCol1 = vec3(0.9, 0.55, 0.2);  // warm amber
    vec3 iconCol2 = vec3(0.3, 0.5, 0.15);  // firefly green
    col += iconEmergence(screenP, uTime, energy, bass,
      iconCol1, iconCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energy, bass,
      iconCol1, iconCol2, nf, uSectionIndex);
  }

  // === POST-PROCESSING ===
  col = applyPostProcess(col, uv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
