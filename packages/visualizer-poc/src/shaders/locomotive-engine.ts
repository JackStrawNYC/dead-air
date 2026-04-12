/**
 * Locomotive Engine — raymarched train engine interior.
 * For "Casey Jones" — mechanical power, dangerous speed, coal fire.
 * Engine room interior with pumping pistons, steam pipes, firebox glow,
 * pressure gauges, riveted metal walls, and volumetric steam jets.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             -> piston force / stroke depth
 *   uEnergy           -> speed (piston rate, camera shake)
 *   uDrumOnset        -> steam burst from valve joints
 *   uBeatSnap         -> piston apex flash
 *   uVocalPresence    -> fire glow intensity in firebox
 *   uHarmonicTension  -> pressure buildup (gauge rises, steam leaks)
 *   uSectionType      -> jam=overdrive, space=idling, chorus=full speed
 *   uClimaxPhase      -> boiler explosion (steam everywhere, metal warps)
 *   uBeatStability    -> piston smoothness (stable=smooth, unstable=jerky)
 *   uTempo            -> piston cycle rate
 *   uSlowEnergy       -> ambient steam density
 *   uMelodicPitch     -> fire color temperature
 *   uDynamicRange     -> metal specular contrast
 *   uTimbralBrightness-> fire ember sparkle intensity
 *   uSemanticRhythmic -> mechanical rhythm tightness
 *   uSemanticAggressive-> overdrive danger feel
 *   uEnergyAccel      -> acceleration (speed increasing)
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const locomotiveEngineVert = /* glsl */ `
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
  eraGradingEnabled: true,
  thermalShimmerEnabled: true,
});

const leNormalGLSL = buildRaymarchNormal("leMap($P, bassV, energyV, tempoV, tensionV, stabilityV, climaxWarp, sectionSpeedMul).x", { eps: 0.002, name: "leNormal" });
const leDepthAlpha = buildDepthAlphaOutput("totalDist", "LE_MAX_DIST");

export const locomotiveEngineFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}
${lightingGLSL}

${postProcess}

varying vec2 vUv;

#define LE_PI 3.14159265
#define LE_TAU 6.28318530
#define LE_MAX_STEPS 80
#define LE_MAX_DIST 30.0
#define LE_SURF_DIST 0.004
#define LE_STEAM_STEPS 32

// ─── SDF Primitives ───

float leBox(vec3 pos, vec3 sz) {
  vec3 dd = abs(pos) - sz;
  return length(max(dd, 0.0)) + min(max(dd.x, max(dd.y, dd.z)), 0.0);
}

float leCylinder(vec3 pos, float rad, float halfH) {
  float dXZ = length(pos.xz) - rad;
  float dY = abs(pos.y) - halfH;
  return length(max(vec2(dXZ, dY), 0.0)) + min(max(dXZ, dY), 0.0);
}

float leDisc(vec3 pos, float rad, float thick) {
  float dXZ = length(pos.xz) - rad;
  float dY = abs(pos.y) - thick;
  return length(max(vec2(dXZ, dY), 0.0)) + min(max(dXZ, dY), 0.0);
}

float leTorus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

float leSmoothMin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── Rivet Bump Pattern ───
// Regular grid of small bumps for industrial metal texture
float leRivetBump(vec3 pos, float spacing) {
  vec3 q = mod(pos + spacing * 0.5, vec3(spacing)) - spacing * 0.5;
  float rivet = length(q) - spacing * 0.08;
  return rivet;
}

// ─── Piston Assembly ───
// Single piston: cylinder body + connecting rod + crosshead
// pistonPhase: 0-1 cycle position, strokeDepth modulated by bass
float lePiston(vec3 pos, float pistonPhase, float strokeDepth, float stability) {
  // Piston stroke position: sinusoidal with stability affecting smoothness
  float jitter = (1.0 - stability) * snoise(vec3(pistonPhase * 12.0, 0.0, 0.0)) * 0.06;
  float stroke = sin(pistonPhase * LE_TAU) * strokeDepth + jitter;

  // Cylinder bore (housing)
  vec3 borePos = pos;
  float bore = leCylinder(borePos, 0.38, 0.9);
  float boreInner = leCylinder(borePos, 0.34, 0.95);
  float boreShell = max(bore, -boreInner);

  // Piston head (moves in and out)
  vec3 headPos = pos - vec3(0.0, 0.0, stroke);
  float pistonHead = leCylinder(headPos, 0.32, 0.08);

  // Connecting rod (links piston to crankshaft)
  vec3 rodPos = pos - vec3(0.0, 0.0, stroke * 0.5);
  float rod = leCylinder(vec3(rodPos.x, rodPos.z, rodPos.y), 0.04, abs(stroke) * 0.5 + 0.3);

  // Crosshead guide rails
  vec3 guidePos = pos;
  float guideL = leBox(guidePos - vec3(-0.25, 0.0, 0.0), vec3(0.02, 0.02, 1.0));
  float guideR = leBox(guidePos - vec3(0.25, 0.0, 0.0), vec3(0.02, 0.02, 1.0));

  float piston = min(boreShell, pistonHead);
  piston = min(piston, rod);
  piston = min(piston, min(guideL, guideR));
  return piston;
}

// ─── Steam Pipe ───
float leSteamPipe(vec3 pos, float rad, float halfLen) {
  // Pipe along Z axis
  float pipe = leCylinder(vec3(pos.x, pos.z, pos.y), rad, halfLen);
  float pipeInner = leCylinder(vec3(pos.x, pos.z, pos.y), rad * 0.8, halfLen + 0.01);
  return max(pipe, -pipeInner);
}

// ─── Pressure Gauge ───
// Disc face with needle indicator, mounted on wall
float leGauge(vec3 pos, float pressure) {
  // Gauge face (disc)
  float face = leDisc(pos, 0.18, 0.015);

  // Gauge bezel ring
  float bezel = abs(length(pos.xz) - 0.18) - 0.015;
  bezel = max(bezel, abs(pos.y) - 0.02);

  // Needle: rotates with pressure (0-1 maps to -135 to +135 degrees)
  float needleAngle = mix(-0.75, 0.75, clamp(pressure, 0.0, 1.0)) * LE_PI;
  float cs = cos(needleAngle);
  float sn = sin(needleAngle);
  vec2 needleUV = vec2(cs * pos.x - sn * pos.z, sn * pos.x + cs * pos.z);
  float needle = leBox(vec3(needleUV.x, pos.y - 0.018, needleUV.y - 0.07), vec3(0.005, 0.005, 0.07));
  // Only the upper half of needle (from center outward)
  needle = max(needle, -(needleUV.y - 0.0));

  return min(face, min(bezel, needle));
}

// ─── Firebox ───
// Opening in wall with volumetric fire glow (SDF for the box structure)
float leFirebox(vec3 pos) {
  // Outer firebox housing
  float outer = leBox(pos, vec3(0.6, 0.5, 0.4));
  // Inner cavity
  float inner = leBox(pos - vec3(0.0, 0.0, 0.05), vec3(0.5, 0.4, 0.4));
  // Opening (front face removed)
  float opening = leBox(pos - vec3(0.0, 0.0, -0.4), vec3(0.4, 0.35, 0.1));
  float firebox = max(outer, -inner);
  firebox = max(firebox, -opening);
  return firebox;
}

// ─── Boiler Tube ───
float leBoiler(vec3 pos, float warpAmount) {
  // Large cylindrical boiler along Z
  vec3 warpPos = pos;
  // Climax warps the metal
  warpPos.x += sin(pos.z * 3.0 + pos.y * 2.0) * warpAmount;
  warpPos.y += cos(pos.z * 2.5 + pos.x * 1.5) * warpAmount;

  float boilerOuter = leCylinder(vec3(warpPos.x, warpPos.z, warpPos.y), 1.2, 2.5);
  float boilerInner = leCylinder(vec3(warpPos.x, warpPos.z, warpPos.y), 1.1, 2.6);
  return max(boilerOuter, -boilerInner);
}

// ─── Valve Joint (steam emission point) ───
float leValve(vec3 pos) {
  float body = leCylinder(pos, 0.06, 0.08);
  float wheel = leTorus(pos - vec3(0.0, 0.1, 0.0), 0.07, 0.012);
  return min(body, wheel);
}

// ─── Scene SDF ───
// Returns vec2(distance, materialID)
// Materials: 1=metal wall, 2=piston, 3=pipe, 4=gauge, 5=firebox, 6=boiler, 7=valve

vec2 leMap(vec3 pos, float bassV, float energyV, float tempoV, float tensionV,
           float stabilityV, float climaxWarp, float sectionSpeedMul) {
  vec2 result = vec2(LE_MAX_DIST, 0.0);

  // Piston phase from tempo and time
  float pistonRate = tempoV * sectionSpeedMul;
  float pistonPhase1 = fract(uDynamicTime * pistonRate * 0.5);
  float pistonPhase2 = fract(uDynamicTime * pistonRate * 0.5 + 0.5); // 180 offset
  float strokeDepth = 0.3 + bassV * 0.5;

  // === ENGINE ROOM: inverted box (interior walls) ===
  float roomOuter = leBox(pos, vec3(3.0, 2.2, 5.0));
  float roomInner = leBox(pos, vec3(2.8, 2.0, 4.8));
  float room = max(roomOuter, -roomInner);
  // Rivet pattern on walls
  float rivets = leRivetBump(pos * vec3(1.0, 1.0, 1.0), 0.35);
  float roomRiveted = leSmoothMin(room, rivets * 0.3 + room, 0.02);
  if (roomRiveted < result.x) result = vec2(roomRiveted, 1.0);

  // === LEFT PISTON ===
  vec3 piston1Pos = pos - vec3(-1.4, -0.5, 0.0);
  // Rotate piston to be horizontal (along Z)
  vec3 p1Rotated = vec3(piston1Pos.x, piston1Pos.y, piston1Pos.z);
  float piston1 = lePiston(p1Rotated, pistonPhase1, strokeDepth, stabilityV);
  if (piston1 < result.x) result = vec2(piston1, 2.0);

  // === RIGHT PISTON ===
  vec3 piston2Pos = pos - vec3(1.4, -0.5, 0.0);
  float piston2 = lePiston(piston2Pos, pistonPhase2, strokeDepth, stabilityV);
  if (piston2 < result.x) result = vec2(piston2, 2.0);

  // === STEAM PIPES (along walls) ===
  // Upper left pipe
  vec3 pipe1Pos = pos - vec3(-2.4, 1.2, 0.0);
  float pipe1 = leSteamPipe(pipe1Pos, 0.1, 4.5);
  if (pipe1 < result.x) result = vec2(pipe1, 3.0);

  // Upper right pipe
  vec3 pipe2Pos = pos - vec3(2.4, 1.2, 0.0);
  float pipe2 = leSteamPipe(pipe2Pos, 0.1, 4.5);
  if (pipe2 < result.x) result = vec2(pipe2, 3.0);

  // Lower cross pipe
  vec3 pipe3Pos = pos - vec3(0.0, 1.6, 0.0);
  float pipe3 = leCylinder(pipe3Pos, 0.08, 2.6);
  if (pipe3 < result.x) result = vec2(pipe3, 3.0);

  // === PRESSURE GAUGES (on left wall) ===
  float pressure = 0.3 + tensionV * 0.6 + energyV * 0.1;
  vec3 gauge1Pos = pos - vec3(-2.75, 0.8, -1.0);
  gauge1Pos = vec3(gauge1Pos.z, gauge1Pos.x, gauge1Pos.y); // rotate to face inward
  float gauge1 = leGauge(gauge1Pos, pressure);
  if (gauge1 < result.x) result = vec2(gauge1, 4.0);

  vec3 gauge2Pos = pos - vec3(-2.75, 0.8, 1.0);
  gauge2Pos = vec3(gauge2Pos.z, gauge2Pos.x, gauge2Pos.y);
  float gauge2 = leGauge(gauge2Pos, pressure * 0.8 + 0.1);
  if (gauge2 < result.x) result = vec2(gauge2, 4.0);

  // === FIREBOX (back wall) ===
  vec3 fireboxPos = pos - vec3(0.0, -0.8, -4.2);
  float firebox = leFirebox(fireboxPos);
  if (firebox < result.x) result = vec2(firebox, 5.0);

  // === BOILER (top center, runs length of room) ===
  vec3 boilerPos = pos - vec3(0.0, 1.8, 0.0);
  float boiler = leBoiler(boilerPos, climaxWarp);
  if (boiler < result.x) result = vec2(boiler, 6.0);

  // === VALVE JOINTS (on pipes, steam emission points) ===
  vec3 valve1Pos = pos - vec3(-2.4, 1.2, -2.0);
  float valve1 = leValve(valve1Pos);
  if (valve1 < result.x) result = vec2(valve1, 7.0);

  vec3 valve2Pos = pos - vec3(2.4, 1.2, 2.0);
  float valve2 = leValve(valve2Pos);
  if (valve2 < result.x) result = vec2(valve2, 7.0);

  vec3 valve3Pos = pos - vec3(-2.4, 1.2, 1.5);
  float valve3 = leValve(valve3Pos);
  if (valve3 < result.x) result = vec2(valve3, 7.0);

  return result;
}

// Normal — generated by shared raymarching utilities
${leNormalGLSL}

// ─── Soft shadow (short, for fire and specular) ───
float leSoftShadow(vec3 ro, vec3 rd, float maxT, float bassV, float energyV,
                   float tempoV, float tensionV, float stabilityV,
                   float climaxWarp, float sectionSpeedMul) {
  float shade = 1.0;
  float t = 0.1;
  for (int i = 0; i < 16; i++) {
    float dist = leMap(ro + rd * t, bassV, energyV, tempoV, tensionV, stabilityV, climaxWarp, sectionSpeedMul).x;
    shade = min(shade, 8.0 * dist / t);
    t += clamp(dist, 0.05, 0.5);
    if (t > maxT || shade < 0.01) break;
  }
  return clamp(shade, 0.0, 1.0);
}

// ─── Volumetric steam density ───
float leSteamDensity(vec3 pos, float drumOnset, float tension, float slowE, float climaxI) {
  // Base steam from pipes and valves
  float density = 0.0;

  // Steam near valve joints
  vec3 v1 = pos - vec3(-2.4, 1.2, -2.0);
  vec3 v2 = pos - vec3(2.4, 1.2, 2.0);
  vec3 v3 = pos - vec3(-2.4, 1.2, 1.5);

  float valve1Steam = exp(-length(v1) * 2.0);
  float valve2Steam = exp(-length(v2) * 2.0);
  float valve3Steam = exp(-length(v3) * 2.0);
  float valveSteam = valve1Steam + valve2Steam + valve3Steam;

  // Drum onset: burst of steam from valves
  float burstDecay = exp(-length(pos - vec3(-2.4, 1.2, -2.0)) * 1.5);
  float drumBurst = drumOnset * burstDecay * 2.0;

  // Tension: persistent steam leaks (pressure building)
  float leakNoise = fbm3(pos * 2.0 + vec3(0.0, uDynamicTime * 0.5, 0.0)) * 0.5 + 0.5;
  float tensionLeak = tension * leakNoise * valveSteam * 1.5;

  // Ambient steam (slow energy, drifting)
  float ambientNoise = fbm3(pos * 0.8 + vec3(uDynamicTime * 0.1, uDynamicTime * 0.15, 0.0));
  float ambient = slowE * 0.15 * max(0.0, ambientNoise);

  // Rising steam: drifts upward
  float rising = fbm3(pos * 1.5 + vec3(0.0, -uDynamicTime * 0.6, uDynamicTime * 0.1));
  rising = max(0.0, rising) * smoothstep(-1.0, 1.5, pos.y) * 0.1;

  // Climax: steam EVERYWHERE (boiler explosion)
  float climaxSteam = climaxI * 0.4 * (fbm3(pos * 0.5 + uDynamicTime * 0.3) * 0.5 + 0.5);

  density = valveSteam * 0.2 + drumBurst + tensionLeak + ambient + rising + climaxSteam;

  return clamp(density, 0.0, 1.0);
}

// ─── Volumetric fire emission (inside firebox) ───
vec3 leFireEmission(vec3 pos, float vocalPresence, float pitchV, float brightness, float bassV) {
  // Fire is contained in firebox area
  vec3 fireCenter = vec3(0.0, -0.8, -4.2);
  vec3 fireLocal = pos - fireCenter;

  // Containment: fire only inside firebox volume
  float containment = 1.0 - smoothstep(0.4, 0.7, length(fireLocal.xz));
  containment *= 1.0 - smoothstep(0.3, 0.6, abs(fireLocal.y));
  if (containment < 0.01) return vec3(0.0);

  // Fire noise (rising, churning)
  vec3 fireNoisePos = fireLocal * 2.0;
  fireNoisePos.y -= uDynamicTime * 1.5;
  float fireNoise = fbm3(fireNoisePos) * 0.5 + 0.5;
  fireNoise += fbm3(fireNoisePos * 2.0 + 10.0) * 0.3;

  // Vocal presence drives fire intensity
  float fireIntensity = (0.3 + vocalPresence * 0.7) * containment * fireNoise;

  // Fire color: orange core, temperature shifts with melodic pitch
  // Low pitch = deep red, high pitch = white-hot
  float temp = 0.3 + pitchV * 0.5;
  vec3 fireColor = mix(
    vec3(1.0, 0.2, 0.0),   // deep red-orange
    vec3(1.0, 0.8, 0.4),   // bright yellow
    temp
  );
  // White-hot core
  fireColor = mix(fireColor, vec3(1.0, 0.95, 0.8), fireNoise * fireNoise * 0.4);

  // Ember sparkle from timbral brightness
  float sparkle = pow(max(0.0, snoise(fireLocal * 8.0 + uDynamicTime * 3.0)), 6.0);
  fireColor += vec3(1.0, 0.7, 0.3) * sparkle * brightness * 0.5;

  // Bass pulses fire
  fireColor *= 1.0 + bassV * 0.3;

  return fireColor * fireIntensity;
}

// ─── Speedometer helper (for gauge needle rate visual) ───
float leSpeedIndicator(vec2 gaugeUV, float speed) {
  // Tick marks around gauge perimeter
  float r = length(gaugeUV);
  float angle = atan(gaugeUV.y, gaugeUV.x);
  float ticks = smoothstep(0.005, 0.0, abs(fract(angle / LE_PI * 6.0) - 0.5) - 0.45);
  ticks *= smoothstep(0.14, 0.16, r) * smoothstep(0.19, 0.17, r);
  return ticks;
}

void main() {
  vec2 uv = vUv;
  uv = applyCameraCut(uv, uOnsetSnap, uBeatSnap, uEnergy, uCoherence, uClimaxPhase, uMusicalTime, uSectionIndex);
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ─── Audio uniform extraction ───
  float bassV = clamp(uBass, 0.0, 1.0);
  float energyV = clamp(uEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float beatSnap = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tensionV = clamp(uHarmonicTension, 0.0, 1.0);
  float stabilityV = clamp(uBeatStability, 0.0, 1.0);
  float tempoV = clamp(uTempo / 180.0, 0.3, 1.5); // normalize to useful range
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float pitchV = clamp(uMelodicPitch, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float timbralBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float rhythmic = clamp(uSemanticRhythmic, 0.0, 1.0);
  float aggressive = clamp(uSemanticAggressive, 0.0, 1.0);
  float accel = clamp(uEnergyAccel, -1.0, 1.0);

  // ─── Section type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Section speed multiplier: jam=overdrive, space=idling, chorus=full speed
  float sectionSpeedMul = 1.0;
  sectionSpeedMul = mix(sectionSpeedMul, 1.6, sJam);         // overdrive
  sectionSpeedMul = mix(sectionSpeedMul, 0.25, sSpace);       // idling
  sectionSpeedMul = mix(sectionSpeedMul, 1.4, sChorus);       // full speed
  sectionSpeedMul = mix(sectionSpeedMul, 1.2, sSolo);         // pushed
  // Acceleration increases speed
  sectionSpeedMul *= 1.0 + max(0.0, accel) * 0.3;

  // ─── Climax reactivity ───
  float climaxPhase = uClimaxPhase;
  float climaxI = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;
  // Metal warping during boiler explosion
  float climaxWarp = climaxBoost * 0.08;

  // ─── Camera: inside engine room, looking toward firebox ───
  vec3 camPos = vec3(
    sin(uDynamicTime * 0.15) * 0.3,
    0.2 + sin(uDynamicTime * 0.22) * 0.15,
    2.5
  );
  // Speed-based camera shake
  float shakeAmt = energyV * 0.04 + climaxBoost * 0.08;
  camPos.x += snoise(vec3(uDynamicTime * 6.0, 0.0, 0.0)) * shakeAmt;
  camPos.y += snoise(vec3(0.0, uDynamicTime * 7.0, 0.0)) * shakeAmt;

  vec3 lookAt = vec3(0.0, -0.2, -3.0);
  vec3 forward = normalize(lookAt - camPos);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 camRight = normalize(cross(forward, worldUp));
  vec3 camUp = cross(camRight, forward);

  float fov = 1.2 + energyV * 0.2; // wider FOV at high energy
  vec3 rd = normalize(forward * fov + camRight * screenP.x + camUp * screenP.y);

  // ─── Raymarching ───
  float totalDist = 0.0;
  vec2 mapResult = vec2(LE_MAX_DIST, 0.0);
  vec3 marchPos = camPos;

  for (int i = 0; i < LE_MAX_STEPS; i++) {
    marchPos = camPos + rd * totalDist;
    mapResult = leMap(marchPos, bassV, energyV, tempoV, tensionV, stabilityV, climaxWarp, sectionSpeedMul);

    if (mapResult.x < LE_SURF_DIST || totalDist > LE_MAX_DIST) break;
    totalDist += mapResult.x * 0.7; // conservative step for thin geometry
  }

  float matID = mapResult.y;

  // ─── Lighting setup ───
  // Primary: fire light from firebox (warm orange)
  vec3 fireLightPos = vec3(0.0, -0.3, -4.0);
  vec3 fireLightCol = mix(
    vec3(1.0, 0.4, 0.05),
    vec3(1.0, 0.7, 0.3),
    vocalPresence * 0.5
  ) * (0.8 + vocalPresence * 1.2);

  // Secondary: dim blue ambient (metal/industrial)
  vec3 ambientCol = vec3(0.02, 0.025, 0.04);

  // Tertiary: gauge glow (green-yellow)
  vec3 gaugeLightCol = vec3(0.3, 0.5, 0.2) * 0.3;

  vec3 col = vec3(0.0);

  if (totalDist < LE_MAX_DIST) {
    vec3 surfPos = marchPos;
    vec3 surfNorm = leNormal(surfPos);

    // ─── Material coloring ───
    vec3 matCol = vec3(0.15, 0.13, 0.12); // default dark metal

    if (matID < 1.5) {
      // Metal wall: dark iron with rivet bumps
      float rivetPattern = smoothstep(0.02, 0.0, leRivetBump(surfPos, 0.35));
      matCol = mix(vec3(0.08, 0.07, 0.065), vec3(0.12, 0.11, 0.1), rivetPattern);
      // Rust variation
      float rust = fbm3(surfPos * 3.0) * 0.5 + 0.5;
      matCol = mix(matCol, vec3(0.15, 0.07, 0.03), rust * 0.2);
    } else if (matID < 2.5) {
      // Piston: polished steel
      matCol = vec3(0.22, 0.21, 0.2);
      // Oil sheen
      float oilSheen = pow(max(0.0, snoise(surfPos * 10.0)), 2.0) * 0.1;
      matCol += vec3(oilSheen * 0.5, oilSheen * 0.3, 0.0);
    } else if (matID < 3.5) {
      // Steam pipe: copper/brass
      matCol = vec3(0.25, 0.15, 0.08);
      float patina = fbm3(surfPos * 4.0 + 20.0) * 0.5 + 0.5;
      matCol = mix(matCol, vec3(0.1, 0.18, 0.12), patina * 0.15);
    } else if (matID < 4.5) {
      // Gauge: brass ring with white face
      float faceArea = smoothstep(0.17, 0.15, length(surfPos.xz - vec2(-2.75, 0.0)));
      matCol = mix(vec3(0.3, 0.2, 0.08), vec3(0.7, 0.7, 0.65), faceArea * 0.5);
    } else if (matID < 5.5) {
      // Firebox: cast iron, heat-tinted
      float heatGrad = smoothstep(0.3, 0.0, length(surfPos - vec3(0.0, -0.8, -4.2)));
      matCol = mix(vec3(0.1, 0.08, 0.07), vec3(0.3, 0.1, 0.02), heatGrad);
    } else if (matID < 6.5) {
      // Boiler: riveted iron, dark
      matCol = vec3(0.1, 0.09, 0.08);
      float boilerRivets = smoothstep(0.02, 0.0, leRivetBump(surfPos * 1.5, 0.25));
      matCol += vec3(0.05) * boilerRivets;
    } else {
      // Valve: brass/copper
      matCol = vec3(0.3, 0.18, 0.06);
    }

    // ─── Lighting calculation ───
    vec3 toFire = normalize(fireLightPos - surfPos);
    float fireDist = length(fireLightPos - surfPos);
    float fireAtten = 1.0 / (1.0 + fireDist * fireDist * 0.05);
    float fireDiffuse = max(0.0, dot(surfNorm, toFire));

    // Specular (metal glints from dynamic range)
    vec3 halfVec = normalize(toFire - rd);
    float specPow = 32.0 + dynRange * 64.0;
    float specular = pow(max(0.0, dot(surfNorm, halfVec)), specPow);
    specular *= 0.3 + dynRange * 0.5;

    // Fire illumination
    col = matCol * fireLightCol * fireDiffuse * fireAtten;
    col += fireLightCol * specular * fireAtten * 0.5;

    // Ambient illumination
    col += matCol * ambientCol;

    // Rim light (edge of surfaces facing away from fire = silhouette)
    float rim = pow(1.0 - max(0.0, dot(surfNorm, -rd)), 3.0);
    col += vec3(0.08, 0.04, 0.02) * rim * 0.5;

    // Beat snap: piston apex flash (bright white flash on pistons)
    if (matID > 1.5 && matID < 2.5) {
      col += vec3(0.6, 0.5, 0.3) * beatSnap * 0.5;
    }

    // Gauge glow
    if (matID > 3.5 && matID < 4.5) {
      col += gaugeLightCol * (0.5 + tensionV * 0.5);
    }

    // Rhythmic semantic: tighter mechanical precision = sharper specular
    col += specular * vec3(0.1, 0.08, 0.06) * rhythmic * 0.3;

    // ─── Depth fog (steam-like) ───
    float fogDist = totalDist / LE_MAX_DIST;
    vec3 fogCol = mix(vec3(0.03, 0.025, 0.02), vec3(0.1, 0.07, 0.04), vocalPresence * 0.3);
    col = mix(col, fogCol, smoothstep(0.0, 1.0, fogDist * fogDist));

  } else {
    // Miss: deep dark metal ambient
    col = vec3(0.02, 0.018, 0.015);
  }

  // ─── Volumetric steam pass ───
  {
    vec3 steamAccum = vec3(0.0);
    float steamAlpha = 0.0;
    float steamStep = LE_MAX_DIST / float(LE_STEAM_STEPS);

    for (int i = 0; i < LE_STEAM_STEPS; i++) {
      float t = float(i) * steamStep + steamStep * 0.5;
      vec3 steamPos = camPos + rd * t;

      float density = leSteamDensity(steamPos, drumOnset, tensionV, slowE, climaxBoost);
      if (density > 0.001) {
        float alpha = density * 0.08 * (1.0 - steamAlpha);

        // Steam is backlit by firebox (warm tint near fire, white elsewhere)
        float fireProximity = exp(-length(steamPos - fireLightPos) * 0.3);
        vec3 steamCol = mix(
          vec3(0.4, 0.42, 0.45),     // neutral white-grey steam
          vec3(0.8, 0.5, 0.2),        // fire-backlit warm steam
          fireProximity * 0.6
        );

        // Steam brightness from fire
        steamCol *= 0.3 + vocalPresence * 0.4 + fireProximity * 0.5;

        steamAccum += steamCol * alpha;
        steamAlpha += alpha;
      }
    }

    // Composite steam over scene
    col = col * (1.0 - steamAlpha * 0.5) + steamAccum;
  }

  // ─── Volumetric fire glow (firebox emission) ───
  {
    vec3 fireAccum = vec3(0.0);
    int fireSteps = 16;

    for (int i = 0; i < 16; i++) {
      float t = 5.0 + float(i) * 0.15; // sample near firebox (z = -4.2)
      vec3 firePos = camPos + rd * t;
      vec3 fireEmit = leFireEmission(firePos, vocalPresence, pitchV, timbralBright, bassV);
      fireAccum += fireEmit * 0.08;
    }

    // Additive fire glow
    col += fireAccum;
  }

  // ─── Firebox ambient spill ───
  // Warm glow that fills the room from the firebox direction
  {
    float fireDir = max(0.0, dot(rd, normalize(fireLightPos - camPos)));
    float fireSpill = pow(fireDir, 3.0) * (0.15 + vocalPresence * 0.25);
    col += vec3(1.0, 0.4, 0.08) * fireSpill * (0.15 + bassV * 0.1);
  }

  // ─── Climax: boiler explosion overlay ───
  if (climaxBoost > 0.01) {
    // Intense steam + fire mix
    float explosionNoise = fbm6(vec3(screenP * 3.0, uDynamicTime * 0.8)) * 0.5 + 0.5;
    vec3 explosionCol = mix(
      vec3(0.8, 0.6, 0.3),    // hot steam
      vec3(1.0, 0.3, 0.05),   // fire burst
      explosionNoise
    );
    col = mix(col, col + explosionCol * 0.4, climaxBoost);

    // Screen shake distortion
    float shakeNoise = snoise(vec3(screenP * 5.0, uDynamicTime * 12.0));
    col *= 1.0 + shakeNoise * climaxBoost * 0.08;
  }

  // ─── Beat reactivity: piston-synced brightness pulse ───
  float pistonPulse = pow(1.0 - fract(uDynamicTime * tempoV * sectionSpeedMul * 0.5), 6.0);
  col *= 1.0 + pistonPulse * 0.12 * energyV;

  // ─── Aggressive semantic: danger reddening ───
  col = mix(col, col * vec3(1.15, 0.85, 0.75), aggressive * 0.2);

  // ─── Jam overdrive: saturate and warm ───
  col = mix(col, col * vec3(1.2, 0.95, 0.8), sJam * 0.15);

  // ─── Space idling: desaturate, cooler ───
  {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, mix(vec3(lum), col * vec3(0.9, 0.95, 1.05), 0.7), sSpace * 0.3);
  }

  // ─── Dynamic range: contrast enhancement ───
  {
    float midLuma = dot(col, vec3(0.299, 0.587, 0.114));
    float contrastMul = mix(0.9, 1.3, dynRange);
    col = mix(vec3(midLuma), col, contrastMul);
  }

  // ─── Vignette (strong mechanical darkness at edges) ───
  {
    float vigScale = mix(0.45, 0.35, energyV);
    float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    vec3 vigCol = vec3(0.02, 0.015, 0.01);
    col = mix(vigCol, col, vignette);
  }

  // ─── SDF Iconography ───
  {
    float nf = snoise(vec3(screenP * 2.0, uDynamicTime * 0.1));
    vec3 c1 = paletteHueColor(uPalettePrimary, uPaletteSaturation, 1.0);
    vec3 c2 = paletteHueColor(uPaletteSecondary, uPaletteSaturation, 1.0);
    col += iconEmergence(screenP, uTime, energyV, bassV, c1, c2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenP, uTime, energyV, bassV, c1, c2, nf, uSectionIndex);
  }

  // ─── Post-processing ───
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
  ${leDepthAlpha}
}
`;
