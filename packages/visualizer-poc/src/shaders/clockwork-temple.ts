/**
 * Clockwork Temple — raymarched interlocking gear mechanism.
 * "Greatest Story Ever Told" — driving, mechanical, funky.
 *
 * A precision clockwork mechanism rendered in brass/copper/gold:
 * large interlocking gear SDFs with tooth cutouts, central shaft,
 * pendulum swinging in a plane, escapement clicks on beat.
 * Metallic surfaces with high specular, strong fresnel, ambient occlusion,
 * and volumetric haze threading through the gears.
 *
 * Audio reactivity (14+ uniforms):
 *   uBass             → gear size pulse (breathing cogs)
 *   uEnergy           → rotation speed, gear count expansion
 *   uDrumOnset        → escapement click (gear teeth snap forward)
 *   uBeatSnap         → pendulum apex flash
 *   uVocalPresence    → warm brass subsurface glow
 *   uHarmonicTension  → gear strain (teeth grinding, micro-vibration)
 *   uMelodicPitch     → pendulum swing amplitude
 *   uSectionType      → jam=gears multiply wildly, space=single pendulum in void,
 *                        chorus=full mechanism revealed
 *   uClimaxPhase      → mechanism flies apart then reassembles
 *   uBeatStability    → rotation smoothness (stable=precise, unstable=jitter)
 *   uSlowEnergy       → camera orbit speed
 *   uTimbralBrightness→ specular intensity (bright timbre = shinier metal)
 *   uSpaceScore       → fog density (spacious = more atmospheric haze)
 *   uDynamicRange     → depth of field emphasis
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const clockworkTempleVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.08,
  caEnabled: true,
  halationEnabled: true,
  lightLeakEnabled: true,
  eraGradingEnabled: true,
});

export const clockworkTempleFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${postProcess}
varying vec2 vUv;

#define CT_TAU 6.28318530718
#define CT_PI  3.14159265359
#define CT_MAX_DIST 40.0
#define CT_SURF_DIST 0.002
#define CT_GOLD vec3(0.83, 0.69, 0.22)
#define CT_COPPER vec3(0.72, 0.45, 0.20)
#define CT_BRASS vec3(0.80, 0.62, 0.35)
#define CT_DARK_IRON vec3(0.18, 0.16, 0.14)

// ─── Rotation matrix ───
mat2 ctRot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

// ─── Smooth min for organic blending ───
float ctSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ─── SDF primitives ───
float ctCylinder(vec3 p, float r, float h) {
  vec2 d = vec2(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float ctTorus(vec3 p, float R, float rr) {
  vec2 q = vec2(length(p.xz) - R, p.y);
  return length(q) - rr;
}

float ctBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

float ctCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ab = b - a;
  vec3 ap = p - a;
  float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - (a + t * ab)) - r;
}

float ctSphere(vec3 p, float r) {
  return length(p) - r;
}

// ─── Gear tooth SDF: torus with angular tooth cutouts ───
// Creates a gear by subtracting wedge-shaped gaps from a torus
float ctGear(vec3 p, float outerR, float thickness, float toothCount, float toothDepth, float rotAngle) {
  // Rotate the gear around Y axis
  p.xz = ctRot(rotAngle) * p.xz;

  // Base torus
  float gear = ctTorus(p, outerR, thickness);

  // Hub cylinder
  float hub = ctCylinder(p, outerR * 0.25, thickness * 1.8);
  gear = min(gear, hub);

  // Spokes: 4 radial bars connecting hub to rim
  for (int i = 0; i < 4; i++) {
    float spokeAngle = float(i) * CT_PI * 0.5;
    vec3 sp = p;
    sp.xz = ctRot(spokeAngle) * sp.xz;
    float spoke = ctBox(sp - vec3(outerR * 0.5, 0.0, 0.0), vec3(outerR * 0.35, thickness * 0.6, thickness * 0.35));
    gear = min(gear, spoke);
  }

  // Teeth: angular modular subtraction
  float angle = atan(p.z, p.x);
  float toothAngle = CT_TAU / toothCount;
  float sector = mod(angle + toothAngle * 0.5, toothAngle) - toothAngle * 0.5;

  // Radial distance from center
  float radialDist = length(p.xz);

  // Tooth profile: rectangular notch at gear rim
  float toothR = outerR + thickness;
  float gapMask = step(toothR * 0.85, radialDist);  // Only near rim
  float gapWidth = sin(sector) * radialDist;
  float toothGap = max(abs(gapWidth) - toothDepth, abs(p.y) - thickness * 1.2);
  toothGap = max(toothGap, -(radialDist - toothR * 0.82));
  toothGap = max(toothGap, radialDist - toothR * 1.25);

  // Subtract every other tooth gap
  gear = max(gear, -toothGap * gapMask);

  return gear;
}

// ─── Shaft: central connecting cylinder with decorative rings ───
float ctShaft(vec3 p, float radius, float halfLen) {
  float shaft = ctCylinder(p, radius, halfLen);

  // Decorative rings along the shaft
  for (int i = -2; i <= 2; i++) {
    vec3 rp = p - vec3(0.0, float(i) * halfLen * 0.45, 0.0);
    float ring = ctTorus(rp.xzy, radius * 1.4, radius * 0.2);
    shaft = min(shaft, ring);
  }

  return shaft;
}

// ─── Pendulum: capsule swinging on a pivot ───
float ctPendulum(vec3 p, float swingAngle, float length2, float bobRadius) {
  // Pivot at origin, swings in XY plane
  vec3 pivotPos = vec3(0.0, 0.0, 0.0);
  vec3 bobPos = vec3(sin(swingAngle) * length2, -cos(swingAngle) * length2, 0.0);

  // Rod
  float rod = ctCapsule(p, pivotPos, bobPos, 0.03);

  // Bob (weighted end)
  float bob = ctSphere(p - bobPos, bobRadius);

  // Pivot bearing
  float pivot = ctSphere(p - pivotPos, 0.06);

  return min(rod, min(bob, pivot));
}

// ─── Escapement wheel: star-shaped ratchet ───
float ctEscapement(vec3 p, float radius, float rotAngle) {
  p.xz = ctRot(rotAngle) * p.xz;

  float wheel = ctCylinder(p, radius, 0.04);

  // Star teeth
  float angle = atan(p.z, p.x);
  float teeth = 15.0;
  float toothAngle = CT_TAU / teeth;
  float sector = mod(angle, toothAngle);

  // Triangular tooth profile
  float radDist = length(p.xz);
  float toothShape = radDist - radius * (1.0 + 0.25 * smoothstep(0.0, toothAngle * 0.3, sector)
                                              * smoothstep(toothAngle, toothAngle * 0.7, sector));
  float toothMask = step(radius * 0.7, radDist);
  wheel = min(wheel, max(-toothShape, abs(p.y) - 0.04) * toothMask + wheel * (1.0 - toothMask));

  return wheel;
}

// ─── Main scene SDF ───
float ctMap(vec3 p, float ft, float energy, float bass, float drumSnap,
            float tension, float pitch, float sJam, float sSpace, float sChorus,
            float climax, float stability, float beatSnap) {

  float d = CT_MAX_DIST;

  // Climax: mechanism explodes outward then reassembles
  float explode = climax * (1.0 - smoothstep(0.6, 1.0, climax)) * 2.0;
  float reassemble = smoothstep(0.7, 1.0, climax);

  // Bass-driven gear breathing
  float bassPulse = 1.0 + bass * 0.08;

  // Beat stability → rotation jitter
  float jitter = (1.0 - stability) * sin(ft * 17.3) * 0.15;

  // Base rotation speed (energy-driven)
  float rotSpeed = ft * (0.3 + energy * 0.5);

  // Escapement click: drumOnset snaps rotation forward in discrete steps
  float clickStep = floor(ft * 2.0 + drumSnap * 0.5) * 0.5;
  float escapementRot = mix(rotSpeed, clickStep, 0.3 + drumSnap * 0.4);

  // ─── Section-type modulation ───
  // Jam: multiply gears, faster rotation
  // Space: strip to single pendulum in void
  // Chorus: full mechanism revealed
  float gearScale = bassPulse * (1.0 + sJam * 0.3);

  // ─── Central shaft ───
  float shaftLen = 3.5 + sJam * 1.5 - sSpace * 2.0;
  vec3 shaftP = p;
  shaftP.x += explode * sin(ft * 3.0) * 0.5 * (1.0 - reassemble);
  d = min(d, ctShaft(shaftP, 0.12 * gearScale, shaftLen));

  // ─── Main gear stack ───
  float gearVis = 1.0 - sSpace * 0.9; // Space: fade gears almost entirely
  if (gearVis > 0.05) {
    // Large drive gear (bottom)
    {
      vec3 gp = p - vec3(0.0, -1.8, 0.0);
      gp.x += explode * 1.5 * sin(ft) * (1.0 - reassemble);
      float gearRot = escapementRot * 0.5 + jitter;
      float g = ctGear(gp, 1.6 * gearScale, 0.15, 24.0, 0.06, gearRot);
      d = min(d, g / gearVis);
    }

    // Medium gear (middle) — counter-rotating, meshed ratio
    {
      vec3 gp = p - vec3(1.4 * gearScale, -0.2, 0.0);
      gp.z += explode * 1.2 * cos(ft * 1.3) * (1.0 - reassemble);
      // Gear ratio: 24/16 = 1.5x speed, opposite direction
      float gearRot = -escapementRot * 0.75 + jitter * 0.8;
      float g = ctGear(gp, 1.1 * gearScale, 0.12, 16.0, 0.05, gearRot);
      d = min(d, g / gearVis);
    }

    // Small gear (top) — fastest, meshes with medium
    {
      vec3 gp = p - vec3(0.3, 1.6, 0.0);
      gp.y += explode * 1.8 * sin(ft * 0.7) * (1.0 - reassemble);
      // Gear ratio: 24/10 = 2.4x speed
      float gearRot = escapementRot * 1.2 + jitter * 1.2;
      float g = ctGear(gp, 0.7 * gearScale, 0.10, 10.0, 0.04, gearRot);
      d = min(d, g / gearVis);
    }

    // Jam: extra wildcard gears
    if (sJam > 0.1) {
      // Extra gear 1 — angled, off-axis
      {
        vec3 gp = p - vec3(-1.5, 0.8, 0.6);
        gp.yz = ctRot(0.4) * gp.yz;
        float gearRot = escapementRot * 1.8;
        float g = ctGear(gp, 0.9 * gearScale, 0.08, 12.0, 0.04, gearRot);
        d = min(d, mix(CT_MAX_DIST, g, sJam));
      }
      // Extra gear 2 — perpendicular axis
      {
        vec3 gp = p - vec3(0.0, -0.5, 1.8);
        gp.xy = ctRot(-0.3) * gp.xy;
        float gearRot = -escapementRot * 2.2;
        float g = ctGear(gp, 0.6 * gearScale, 0.07, 8.0, 0.03, gearRot);
        d = min(d, mix(CT_MAX_DIST, g, sJam));
      }
    }

    // Chorus: reveal extra decorative gears at flanking positions
    if (sChorus > 0.1) {
      {
        vec3 gp = p - vec3(-1.8, -1.2, -0.5);
        float gearRot = escapementRot * 0.6;
        float g = ctGear(gp, 1.3, 0.11, 20.0, 0.05, gearRot);
        d = min(d, mix(CT_MAX_DIST, g, sChorus));
      }
      {
        vec3 gp = p - vec3(1.0, 1.8, -0.4);
        float gearRot = -escapementRot * 0.9;
        float g = ctGear(gp, 0.85, 0.09, 14.0, 0.045, gearRot);
        d = min(d, mix(CT_MAX_DIST, g, sChorus));
      }
    }
  }

  // ─── Escapement wheel ───
  {
    vec3 ep = p - vec3(-0.8, 0.5, 0.3);
    ep.xz = ctRot(0.2) * ep.xz;
    float escRot = clickStep * CT_TAU / 15.0; // Click-step rotation
    float esc = ctEscapement(ep, 0.5 * gearScale, escRot);
    d = min(d, esc / max(gearVis, 0.1));
  }

  // ─── Pendulum ───
  {
    // Swing amplitude driven by melodic pitch
    float swingAmp = 0.4 + pitch * 0.5;
    // Damped in space, wild in jam
    swingAmp *= (1.0 + sJam * 0.5) * (1.0 - sSpace * 0.3);
    float swingFreq = 1.0 + energy * 0.3;
    float swing = sin(ft * swingFreq) * swingAmp;
    // Beat snap: flash at apex
    float apexFlash = beatSnap * step(0.95, abs(sin(ft * swingFreq)));

    vec3 pp = p - vec3(0.0, 2.0 + explode * 2.0 * (1.0 - reassemble), -0.5);
    float bobR = 0.15 + bass * 0.03 + apexFlash * 0.05;
    float pend = ctPendulum(pp, swing, 1.8, bobR);
    d = min(d, pend);
  }

  // Harmonic tension: micro-displacement (gear strain / grinding)
  d += tension * 0.02 * sin(p.x * 30.0 + p.y * 20.0 + ft * 8.0);

  return d;
}

// ─── Normal estimation ───
vec3 ctNormal(vec3 p, float ft, float energy, float bass, float drumSnap,
              float tension, float pitch, float sJam, float sSpace, float sChorus,
              float climax, float stability, float beatSnap) {
  vec2 eps = vec2(0.002, 0.0);
  float ref = ctMap(p, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap);
  return normalize(vec3(
    ctMap(p + eps.xyy, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap) - ref,
    ctMap(p + eps.yxy, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap) - ref,
    ctMap(p + eps.yyx, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap) - ref
  ));
}

// ─── Ambient occlusion ───
float ctAmbientOcc(vec3 p, vec3 n, float ft, float energy, float bass, float drumSnap,
                   float tension, float pitch, float sJam, float sSpace, float sChorus,
                   float climax, float stability, float beatSnap) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float dist = 0.05 * float(i);
    float sampled = ctMap(p + n * dist, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap);
    occ += (dist - sampled) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 3.0, 0.1, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // ─── Audio parameter extraction ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumSnap = clamp(uDrumOnset, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float pitch = clamp(uMelodicPitch, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float tBright = clamp(uTimbralBrightness, 0.0, 1.0);
  float spaceScr = clamp(uSpaceScore, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);

  // Section type decoding
  // jam = 5, space = 7, chorus = 3
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sChorus = smoothstep(2.5, 3.5, uSectionType) * (1.0 - step(3.5, uSectionType));

  // Climax
  float climaxActive = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climax = climaxActive * clamp(uClimaxIntensity, 0.0, 1.0);

  // Dynamic time with energy modulation
  float ft = uDynamicTime * (0.5 + slowE * 0.5) * (1.0 + sJam * 0.4 - sSpace * 0.4);

  // ─── Palette ───
  float h1 = hsvToCosineHue(uPalettePrimary);
  vec3 palPrimary = 0.5 + 0.5 * cos(CT_TAU * vec3(h1, h1 + 0.33, h1 + 0.67));
  float h2 = hsvToCosineHue(uPaletteSecondary);
  vec3 palSecondary = 0.5 + 0.5 * cos(CT_TAU * vec3(h2, h2 + 0.33, h2 + 0.67));

  // Brass/copper/gold base palette, modulated by show palette
  vec3 brassCol = mix(CT_BRASS, palPrimary * CT_GOLD, 0.35);
  vec3 copperCol = mix(CT_COPPER, palSecondary * CT_COPPER, 0.3);
  vec3 goldCol = mix(CT_GOLD, palPrimary, 0.2);

  // ─── Camera: orbit the mechanism ───
  float orbitSpeed = ft * 0.15 * (1.0 + slowE * 0.2);
  float orbitRadius = 6.0 + sSpace * 4.0 - sJam * 1.0 + dynRange * 1.0;
  float camY = 1.0 + sin(ft * 0.08) * 2.0;
  vec3 ro = vec3(
    cos(orbitSpeed) * orbitRadius,
    camY + drumSnap * 0.3,
    sin(orbitSpeed) * orbitRadius
  );

  // Look at center of mechanism, slight drift
  vec3 lookAt = vec3(sin(ft * 0.05) * 0.3, 0.2, cos(ft * 0.07) * 0.2);
  vec3 fw = normalize(lookAt - ro);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 ri = normalize(cross(worldUp, fw));
  vec3 camUp = cross(fw, ri);
  float fov = 0.9 + energy * 0.1;
  vec3 rd = normalize(p.x * ri + p.y * camUp + fov * fw);

  // ─── Raymarch ───
  float totalDist = 0.0;
  vec3 marchPos = ro;
  bool marchHit = false;
  int maxSteps = int(mix(60.0, 90.0, energy));

  for (int i = 0; i < 90; i++) {
    if (i >= maxSteps) break;
    vec3 ps = ro + rd * totalDist;
    float dist = ctMap(ps, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap);
    if (dist < CT_SURF_DIST) {
      marchPos = ps;
      marchHit = true;
      break;
    }
    if (totalDist > CT_MAX_DIST) break;
    totalDist += dist * 0.75; // Conservative step for gear teeth precision
  }

  vec3 col = vec3(0.0);

  if (marchHit) {
    // ─── Surface shading ───
    vec3 n = ctNormal(marchPos, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap);

    // Two-light rig: warm key + cool fill
    vec3 keyLightDir = normalize(vec3(0.6, 0.8, -0.3));
    vec3 fillLightDir = normalize(vec3(-0.4, 0.3, 0.8));

    float keyDiff = max(dot(n, keyLightDir), 0.0);
    float fillDiff = max(dot(n, fillLightDir), 0.0);

    // Metallic specular (high exponent for sharp reflections)
    float specPow = 48.0 + energy * 64.0 + tBright * 32.0;
    vec3 viewDir = -rd;
    vec3 keyRefl = reflect(-keyLightDir, n);
    vec3 fillRefl = reflect(-fillLightDir, n);
    float keySpec = pow(max(dot(keyRefl, viewDir), 0.0), specPow);
    float fillSpec = pow(max(dot(fillRefl, viewDir), 0.0), specPow * 0.5);

    // Fresnel (strong for metallic surfaces)
    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);
    fresnel = mix(0.04, 1.0, fresnel); // Schlick approximation for metal

    // Ambient occlusion
    float occVal = ctAmbientOcc(marchPos, n, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap);

    // Material color: vary between brass/copper/gold based on position
    float matHash = fract(sin(dot(floor(marchPos * 2.0), vec3(127.1, 311.7, 74.7))) * 43758.5453);
    vec3 matColor = mix(brassCol, copperCol, smoothstep(0.3, 0.7, matHash));
    matColor = mix(matColor, goldCol, smoothstep(0.7, 0.95, matHash));

    // Dark iron for inner parts (near shaft)
    float shaftProx = smoothstep(0.5, 0.15, length(marchPos.xz));
    matColor = mix(matColor, CT_DARK_IRON, shaftProx * 0.5);

    // Key light: warm (candle-lit clocktower feel)
    vec3 keyColor = vec3(1.0, 0.92, 0.75);
    // Fill light: cool blue
    vec3 fillColor = vec3(0.4, 0.5, 0.7);

    // Vocal presence → warm brass subsurface glow
    vec3 subsurface = brassCol * vocalP * 0.15 * smoothstep(0.0, 0.5, keyDiff);

    // Combine lighting
    vec3 diffuse = matColor * (keyDiff * keyColor * 0.5 + fillDiff * fillColor * 0.15 + 0.04);
    vec3 specular = (keyColor * keySpec * 0.6 + fillColor * fillSpec * 0.15) * (matColor + 0.3);
    vec3 fresnelCol = mix(fillColor, goldCol, 0.5) * fresnel * 0.25;

    col = (diffuse + specular + fresnelCol + subsurface) * occVal;

    // Distance fog
    float fogDist = clamp(totalDist / CT_MAX_DIST, 0.0, 1.0);
    col = mix(col, vec3(0.02, 0.015, 0.01), fogDist * fogDist);

    // Drum onset: specular flash on gear teeth (escapement click visual)
    col += goldCol * drumSnap * keySpec * 0.4;

    // Beat snap: pendulum apex flash
    col += brassCol * beatSnap * 0.08 * fresnel;

    // Tension: reddish grinding highlight on surfaces
    col += vec3(0.4, 0.1, 0.05) * tension * 0.12 * (1.0 - keyDiff);

    // Energy boost
    col *= 1.0 + energy * 0.25;

  } else {
    // ─── Background: dark void with subtle warmth ───
    col = vec3(0.015, 0.012, 0.008);

    // Faint radial gradient (warm center glow from mechanism)
    float centerGlow = exp(-dot(p, p) * 1.5);
    col += brassCol * centerGlow * 0.04 * (1.0 + energy * 0.3);

    // Space section: distant single star-like points
    if (sSpace > 0.1) {
      vec3 starCoord = floor(rd * 40.0);
      float starHash = fract(sin(dot(starCoord, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      float starBright = step(0.92, starHash) * smoothstep(0.05, 0.01, length(fract(rd * 40.0) - 0.5));
      col += goldCol * starBright * sSpace * 0.3;
    }
  }

  // ─── Volumetric haze threading through gears ───
  {
    float haze = 0.0;
    float fogDensity = 0.3 + spaceScr * 0.4;
    int hazeSteps = 12;
    for (int i = 0; i < 12; i++) {
      float ht2 = 0.5 + float(i) * 1.5;
      if (ht2 > totalDist && marchHit) break;
      if (ht2 > CT_MAX_DIST * 0.5) break;
      vec3 hp = ro + rd * ht2;

      // Noise-based volumetric density
      float noiseVal = fbm3(hp * 0.4 + ft * 0.03) * 0.5 + 0.5;
      float density = noiseVal * fogDensity * 0.012;

      // Increase haze near gear surfaces
      float sceneDist = ctMap(hp, ft, energy, bass, drumSnap, tension, pitch, sJam, sSpace, sChorus, climax, stability, beatSnap);
      float proxGlow = exp(-abs(sceneDist) * 3.0);
      density += proxGlow * 0.008 * energy;

      haze += density;
    }
    // Warm golden haze
    vec3 hazeColor = mix(brassCol, goldCol, 0.5) * (0.5 + vocalP * 0.5);
    col += hazeColor * haze * (1.0 + energy * 0.5);
  }

  // ─── Climax: golden particle burst ───
  if (climax > 0.1) {
    float burstIntensity = climax * 0.15;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float burstAngle = fi * CT_TAU / 6.0 + ft * 2.0;
      float burstR = 0.3 + fi * 0.15 + climax * 0.8;
      vec2 burstPos = vec2(cos(burstAngle), sin(burstAngle)) * burstR;
      float burstDist = length(p - burstPos * 0.3);
      col += goldCol * burstIntensity * exp(-burstDist * burstDist * 20.0);
    }
  }

  // Minimum floor: never pitch black
  col = max(col, vec3(0.02, 0.015, 0.01));

  // ─── Icon emergence ───
  float noiseField = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, palPrimary, palSecondary, noiseField, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, palPrimary, palSecondary, noiseField, uSectionIndex);

  // ─── Post-process ───
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
