/**
 * Creation — raymarched cosmic creation scene: the Big Bang.
 * A singularity point expanding into matter. First atoms forming as tiny
 * sphere SDFs, first stars igniting, proto-galaxies spiraling.
 * The birth of the universe rendered as a full 3D raymarched SDF scene.
 *
 * Audio reactivity (14+ uniforms):
 *   uEnergy           → expansion rate, star count, galaxy arm density
 *   uBass             → singularity pulse, gravity well distortion
 *   uHighs            → star specular intensity, atomic detail
 *   uOnsetSnap        → supernova burst, matter ejection
 *   uBeatSnap         → expansion wave pulse
 *   uSlowEnergy       → cosmic background radiation glow
 *   uHarmonicTension  → gravitational turbulence, proto-galaxy formation
 *   uBeatStability    → matter stability (high=crystals, low=plasma chaos)
 *   uMelodicPitch     → expansion shell height/radius
 *   uChromaHue        → cosmic palette shift
 *   uChordIndex       → hue rotation per chord
 *   uVocalEnergy      → singularity core brightness
 *   uSpectralFlux     → particle ejection rate
 *   uSectionType      → jam=rapid expansion, space=void calm, solo=star birth
 *   uClimaxPhase      → full big bang explosion
 *   uPalettePrimary/Secondary → cosmic color palette
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const creationVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const creationFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: true,
  bloomThresholdOffset: -0.1,
  halationEnabled: true,
  caEnabled: true,
  lensDistortionEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530
#define MAX_STEPS 96
#define MAX_DIST 40.0
#define SURF_DIST 0.002

// ═══════════════════════════════════════════════════════════
// Prefixed SDF primitives — cr3 namespace
// ═══════════════════════════════════════════════════════════

float cr3SdSphere(vec3 pos, float radius) {
  return length(pos) - radius;
}

float cr3SdBox(vec3 pos, vec3 bounds) {
  vec3 q = abs(pos) - bounds;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float cr3SdTorus(vec3 pos, float majorR, float minorR) {
  vec2 q = vec2(length(pos.xz) - majorR, pos.y);
  return length(q) - minorR;
}

float cr3SmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// ═══════════════════════════════════════════════════════════
// Singularity: pulsing point of infinite density
// ═══════════════════════════════════════════════════════════

float cr3Singularity(vec3 pos, float pulse) {
  float core = cr3SdSphere(pos, 0.3 * pulse);
  // Gravitational distortion: space warps near the singularity
  float warp = snoise(vec3(pos * 3.0 + sin(pos.yzx * 2.0) * 0.5)) * 0.08;
  core += warp;
  return core;
}

// ═══════════════════════════════════════════════════════════
// Proto-atom SDF — tiny spheres with electron shell rings
// ═══════════════════════════════════════════════════════════

float cr3ProtoAtom(vec3 pos, float radius) {
  float nucleus = cr3SdSphere(pos, radius * 0.3);
  // Electron shell: torus ring
  float shell = cr3SdTorus(pos, radius, radius * 0.04);
  // Second shell perpendicular
  float shell2 = cr3SdTorus(pos.xzy, radius * 0.7, radius * 0.03);
  return min(nucleus, min(shell, shell2));
}

// ═══════════════════════════════════════════════════════════
// Galaxy spiral arm SDF
// ═══════════════════════════════════════════════════════════

float cr3GalaxyArm(vec3 pos, float armAngle, float armWidth) {
  float angle = atan(pos.z, pos.x);
  float radius = length(pos.xz);
  // Logarithmic spiral: angle = a * ln(r)
  float spiralAngle = angle - armAngle - log(max(radius, 0.1)) * 2.5;
  float spiralDist = abs(sin(spiralAngle * 2.0)) * radius;
  float armDist = spiralDist - armWidth;
  // Flatten to disk
  float diskDist = abs(pos.y) - 0.1 * (1.0 - radius * 0.1);
  return max(armDist, diskDist);
}

// ═══════════════════════════════════════════════════════════
// Scene SDF — the creation epoch
// ═══════════════════════════════════════════════════════════

vec2 cr3SceneSDF(vec3 pos, float expansionPhase, float bassPulse, float stability, float flowTime) {
  float matId = 0.0;
  float minDist = 100.0;

  // Phase 1: Singularity (always present as core)
  float singPulse = 1.0 + bassPulse * 0.5;
  float singularity = cr3Singularity(pos, singPulse);
  if (singularity < minDist) { minDist = singularity; matId = 0.0; }

  // Phase 2: Expanding shell of hot plasma
  float shellRadius = expansionPhase * 8.0;
  float shellThickness = 0.3 + expansionPhase * 0.2;
  float shell = abs(length(pos) - shellRadius) - shellThickness;
  // Noise-displaced shell surface (plasma texture)
  shell += fbm3(vec3(pos * 1.5 + flowTime * 0.1)) * 0.3;
  if (shell < minDist && shellRadius > 0.5) { minDist = shell; matId = 1.0; }

  // Phase 3: Proto-atoms forming (energy > 0.3)
  if (expansionPhase > 0.2) {
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      float atomAngle = fi * TAU / 8.0 + flowTime * 0.1;
      float atomRadius = shellRadius * 0.5 + fi * 0.5;
      vec3 atomPos = vec3(
        cos(atomAngle) * atomRadius * mix(1.0, 0.6, stability),
        sin(fi * 2.3 + flowTime * 0.08) * 1.5,
        sin(atomAngle) * atomRadius * mix(1.0, 0.6, stability)
      );
      float atomSize = 0.1 + fi * 0.02;
      float atom = cr3ProtoAtom(pos - atomPos, atomSize);
      if (atom < minDist) { minDist = atom; matId = 2.0 + fi * 0.1; }
    }
  }

  // Phase 4: First stars igniting (energy > 0.5)
  if (expansionPhase > 0.4) {
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float starAngle = fi * TAU / 6.0 + flowTime * 0.05 + 1.0;
      float starDist = shellRadius * 0.7 + fi * 1.2;
      vec3 starPos = vec3(
        cos(starAngle) * starDist,
        sin(fi * 3.1 + flowTime * 0.06) * 2.0,
        sin(starAngle) * starDist
      );
      float starSize = 0.15 + 0.1 * fract(sin(fi * 127.1) * 43758.5);
      starSize *= 1.0 + bassPulse * 0.3;
      float star = cr3SdSphere(pos - starPos, starSize);
      if (star < minDist) { minDist = star; matId = 3.0 + fi * 0.1; }
    }
  }

  // Phase 5: Proto-galaxy (energy > 0.7)
  if (expansionPhase > 0.6) {
    vec3 galaxyCenter = vec3(5.0, 0.0, 8.0);
    vec3 gRelPos = pos - galaxyCenter;
    // Rotate galaxy slowly
    float gAngle = flowTime * 0.03;
    float gc = cos(gAngle);
    float gs = sin(gAngle);
    gRelPos.xz = mat2(gc, -gs, gs, gc) * gRelPos.xz;

    float arm1 = cr3GalaxyArm(gRelPos, 0.0, 0.4);
    float arm2 = cr3GalaxyArm(gRelPos, PI, 0.35);
    float galaxy = min(arm1, arm2);
    // Galaxy core
    float gCore = cr3SdSphere(gRelPos, 0.5);
    galaxy = cr3SmoothUnion(galaxy, gCore, 0.3);
    if (galaxy < minDist) { minDist = galaxy; matId = 4.0; }
  }

  // Cosmic filaments: large-scale structure
  if (expansionPhase > 0.5) {
    vec3 filPos = pos * 0.3;
    float filament = ridged4(filPos + vec3(flowTime * 0.02));
    filament = filament * 0.5 - 0.15;
    // Make filaments thin
    float filDist = filament + length(pos) * 0.01;
    if (filDist < minDist) { minDist = filDist; matId = 5.0; }
  }

  return vec2(minDist, matId);
}

// ═══════════════════════════════════════════════════════════
// Normal, AO
// ═══════════════════════════════════════════════════════════

vec3 cr3CalcNormal(vec3 pos, float expansion, float bassPulse, float stability, float flowTime) {
  vec2 eps = vec2(0.003, 0.0);
  float d0 = cr3SceneSDF(pos, expansion, bassPulse, stability, flowTime).x;
  return normalize(vec3(
    cr3SceneSDF(pos + eps.xyy, expansion, bassPulse, stability, flowTime).x - d0,
    cr3SceneSDF(pos + eps.yxy, expansion, bassPulse, stability, flowTime).x - d0,
    cr3SceneSDF(pos + eps.yyx, expansion, bassPulse, stability, flowTime).x - d0
  ));
}

float cr3CalcAO(vec3 pos, vec3 norm, float expansion, float bassPulse, float stability, float flowTime) {
  float occ = 0.0;
  float weight = 1.0;
  for (int i = 1; i <= 5; i++) {
    float dist = float(i) * 0.15;
    float sampled = cr3SceneSDF(pos + norm * dist, expansion, bassPulse, stability, flowTime).x;
    occ += (dist - sampled) * weight;
    weight *= 0.6;
  }
  return clamp(1.0 - occ * 2.0, 0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════

void main() {
  vec2 fragUv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenPos = (fragUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float stability = clamp(uBeatStability, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch * uMelodicConfidence, 0.0, 1.0);
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float flux = clamp(uSpectralFlux, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float chromaH = uChromaHue;
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12 * smoothstep(0.3, 0.6, uChordConfidence);

  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));

  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;

  float slowTime = uDynamicTime * 0.03;
  float flowTime = uDynamicTime * (0.06 + flux * 0.03);

  // Expansion phase: energy drives cosmic expansion (0=singularity, 1=full cosmos)
  float expansionPhase = energy * energy * mix(1.0, 1.5, sJam) * mix(1.0, 0.3, sSpace);
  expansionPhase += climaxBoost * 0.4;
  expansionPhase = clamp(expansionPhase, 0.0, 1.0);

  float bassPulse = bass;

  // Palette
  float hue1 = hsvToCosineHue(uPalettePrimary) + chromaH * 0.15 + chordHue;
  float hue2 = hsvToCosineHue(uPaletteSecondary) + chordHue * 0.5;
  vec3 plasmaColor = 0.5 + 0.5 * cos(TAU * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  vec3 starColor = 0.5 + 0.5 * cos(TAU * vec3(hue2, hue2 + 0.33, hue2 + 0.67));
  vec3 palCol1 = hsv2rgb(vec3(uPalettePrimary + chromaH * 0.1, uPaletteSaturation * 0.9, 0.9));
  vec3 palCol2 = hsv2rgb(vec3(uPaletteSecondary + chordHue, uPaletteSaturation * 0.8, 0.85));

  // ═══ Camera ═══
  float camDist = 8.0 - expansionPhase * 3.0 + sin(slowTime * 0.5) * 2.0;
  float camAngle = slowTime * 0.2;
  vec3 camOrigin = vec3(
    cos(camAngle) * camDist,
    sin(slowTime * 0.3) * 2.0 + melPitch * 1.5,
    sin(camAngle) * camDist
  );
  vec3 camLookAt = vec3(0.0, 0.0, 0.0);
  // Shift look target toward galaxy when it forms
  if (expansionPhase > 0.6) {
    camLookAt = mix(camLookAt, vec3(5.0, 0.0, 8.0), (expansionPhase - 0.6) * 0.5);
  }

  vec3 camFwd = normalize(camLookAt - camOrigin);
  vec3 camRt = normalize(cross(vec3(0.0, 1.0, 0.0), camFwd));
  vec3 camUpDir = cross(camFwd, camRt);
  float fov = 1.5 + bass * 0.2;
  vec3 rayDir = normalize(screenPos.x * camRt + screenPos.y * camUpDir + fov * camFwd);

  // ═══ Raymarch ═══
  float totalDist = 0.0;
  float matId = 0.0;
  bool didHitSurface = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 marchPos = camOrigin + rayDir * totalDist;
    vec2 sceneResult = cr3SceneSDF(marchPos, expansionPhase, bassPulse, stability, flowTime);
    float sceneDist = sceneResult.x;
    matId = sceneResult.y;
    if (abs(sceneDist) < SURF_DIST) { didHitSurface = true; break; }
    if (totalDist > MAX_DIST) break;
    totalDist += sceneDist * 0.7;
  }

  vec3 col = vec3(0.002, 0.001, 0.005); // cosmic void

  if (didHitSurface) {
    vec3 hitPos = camOrigin + rayDir * totalDist;
    vec3 normal = cr3CalcNormal(hitPos, expansionPhase, bassPulse, stability, flowTime);
    float ambOcc = cr3CalcAO(hitPos, normal, expansionPhase, bassPulse, stability, flowTime);

    vec3 lightDir = normalize(vec3(0.3, 0.8, -0.5));
    float diffuse = max(dot(normal, lightDir), 0.0);
    vec3 halfVec = normalize(lightDir - rayDir);
    float specular = pow(max(dot(normal, halfVec), 0.0), 16.0 + highs * 48.0);
    float fresnel = pow(1.0 - max(dot(normal, -rayDir), 0.0), 3.0);

    if (matId < 0.5) {
      // Singularity: white-hot core with extreme emission
      float coreGlow = 1.0 + vocalE * 0.8 + bassPulse * 0.5;
      vec3 coreColor = mix(vec3(1.0, 0.95, 0.85), plasmaColor, 0.2);
      col = coreColor * coreGlow * (0.5 + energy * 1.5);
    } else if (matId < 1.5) {
      // Expanding plasma shell: hot emissive surface
      vec3 shellCol = mix(plasmaColor, vec3(1.0, 0.6, 0.2), 0.3);
      float shellEmission = 0.3 + energy * 0.7 + effectiveBeat * 0.2;
      col = shellCol * shellEmission;
      col += vec3(1.0, 0.9, 0.7) * specular * 0.3;
      col += fresnel * starColor * 0.2;
    } else if (matId < 3.0) {
      // Proto-atoms: glowing blue-white
      float atomIdx = fract((matId - 2.0) * 10.0);
      vec3 atomCol = mix(vec3(0.3, 0.5, 1.0), vec3(0.8, 0.9, 1.0), atomIdx);
      float atomGlow = 0.4 + energy * 0.6;
      col = atomCol * atomGlow;
      col += vec3(0.9, 0.95, 1.0) * specular * (0.3 + highs * 0.4);
      col += fresnel * vec3(0.3, 0.4, 1.0) * 0.3;
    } else if (matId < 4.0) {
      // First stars: bright emission
      vec3 stCol = mix(starColor, vec3(1.0, 0.95, 0.85), 0.4);
      float stGlow = 0.6 + energy * 1.0 + bassPulse * 0.4;
      col = stCol * stGlow;
      col += vec3(1.0, 0.98, 0.95) * specular * 0.5;
    } else if (matId < 4.5) {
      // Galaxy: warm spiral arms
      vec3 galColor = mix(plasmaColor, starColor, 0.4);
      galColor = mix(galColor, vec3(0.8, 0.7, 1.0), 0.2);
      float galGlow = 0.2 + energy * 0.5;
      col = galColor * galGlow * (diffuse * 0.5 + 0.5);
      col += fresnel * starColor * 0.2;
    } else {
      // Cosmic filaments: dim purple web
      vec3 filColor = mix(vec3(0.2, 0.1, 0.4), plasmaColor, 0.2);
      col = filColor * (0.1 + energy * 0.2) * (diffuse * 0.4 + 0.6);
    }

    col *= ambOcc;

    // Distance fog: cosmic void
    float fogDist = totalDist / MAX_DIST;
    col = mix(col, vec3(0.002, 0.001, 0.005), fogDist * fogDist * 0.7);
  }

  // ═══ Volumetric singularity glow ═══
  {
    vec3 singGlow = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float marchT = float(i) * 0.6 + 0.2;
      vec3 samplePos = camOrigin + rayDir * marchT;
      float distToCenter = length(samplePos);
      float glow = exp(-distToCenter * 0.5) * 0.03;
      glow *= (0.3 + energy * 0.7 + vocalE * 0.3);
      // Color: hot white at center, palette color at edge
      vec3 glowColor = mix(vec3(1.0, 0.95, 0.85), plasmaColor, smoothstep(0.0, 3.0, distToCenter));
      singGlow += glowColor * glow;
    }
    col += singGlow;
  }

  // ═══ Background star field particles ═══
  {
    float starField = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float scale = 50.0 + fi * 30.0;
      vec2 starUV = screenPos * scale + vec2(flowTime * 0.01 * (fi + 1.0));
      vec2 starCell = floor(starUV);
      float h = fract(sin(dot(starCell, vec2(127.1, 311.7))) * 43758.5);
      if (h > 0.92) {
        vec2 starPos = fract(starUV) - vec2(h, fract(h * 7.13));
        float starDist = length(starPos);
        float brightness = smoothstep(0.02, 0.003, starDist) * (0.3 + 0.7 * h);
        starField += brightness * (1.0 - fi * 0.25);
      }
    }
    col += vec3(0.8, 0.85, 1.0) * starField * 0.3 * (0.3 + expansionPhase * 0.7);
  }

  // Onset supernova burst
  if (onset > 0.4) {
    float burstDist = length(screenPos);
    float burst = smoothstep(0.8, 0.0, burstDist) * (onset - 0.4) * 2.5;
    col += mix(plasmaColor, vec3(1.0, 0.95, 0.9), 0.5) * burst * energy;
  }

  // Beat pulse
  col *= 1.0 + effectiveBeat * 0.15;
  col *= 1.0 + climaxBoost * 0.5;

  // Cosmic background radiation glow
  col += plasmaColor * 0.02 * slowE;

  // Vignette
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(screenPos * vigScale, screenPos * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.002, 0.001, 0.005), col, vignette);

  // Icon emergence
  {
    float nf = snoise(vec3(screenPos * 2.0, uTime * 0.1));
    col += iconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uClimaxPhase, uSectionIndex);
    col += heroIconEmergence(screenPos, uTime, energy, bass, palCol1, palCol2, nf, uSectionIndex);
  }

  // Post-processing
  col = applyPostProcess(col, vUv, screenPos);

  gl_FragColor = vec4(col, 1.0);
}
`;
