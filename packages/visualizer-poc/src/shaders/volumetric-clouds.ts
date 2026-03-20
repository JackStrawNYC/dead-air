/**
 * Volumetric Clouds — raymarched cumulus clouds with god rays.
 * Low energy affinity: atmospheric, contemplative. Quiet passages get
 * simple 24-step march; peaks ramp to 48 for richer detail.
 *
 * Audio reactivity:
 *   uBass        → billows / thickens clouds
 *   uEnergy      → god ray intensity + step count
 *   uDrumOnset   → density spikes (cloud bursts)
 *   uClimaxPhase → 2+ parts clouds revealing bright sun
 *   uSlowEnergy  → cloud drift speed
 *   uPalettePrimary   → cloud tint
 *   uPaletteSecondary → sky / god ray tint
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const volumetricCloudsVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({ grainStrength: "light", halationEnabled: true, dofEnabled: true });

export const volumetricCloudsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265

// Cloud density: 3-scale layered FBM with altitude masking
float cloudDensity(vec3 p, float bass, float time) {
  // Wind drift
  p.x += time * 0.4;
  p.z += time * 0.15;

  // 3-scale FBM layers
  float d = fbm(p * 0.3) * 0.6;
  d += fbm3(p * 0.6 + 2.0) * 0.3;
  d += fbm(p * 1.2 + 5.0) * 0.1;

  // Bass billows
  d *= 0.7 + bass * 0.5;

  // Altitude masking: clouds only between y=0..2.5
  float altMask = smoothstep(0.0, 0.5, p.y) * smoothstep(2.5, 1.8, p.y);
  d *= altMask;

  return clamp(d, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === ADVANCED AUDIO UNIFORMS ===
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float chordHue = float(int(uChordIndex)) / 24.0 * 0.12;

  float flowTime = uDynamicTime * (0.08 + slowE * 0.04) * mix(1.0, 1.4, sJam) * mix(1.0, 0.4, sSpace);

  // === PALETTE (chord-shifted) ===
  float hue1 = hsvToCosineHue(uPalettePrimary) + chordHue;
  vec3 cloudTint = 0.5 + 0.5 * cos(6.28318 * vec3(hue1, hue1 + 0.33, hue1 + 0.67));
  cloudTint = mix(cloudTint, vec3(0.85, 0.88, 0.92), 0.5 - tension * 0.15); // tension adds color saturation

  float hue2 = hsvToCosineHue(uPaletteSecondary);
  vec3 skyTint = 0.5 + 0.5 * cos(6.28318 * vec3(hue2, hue2 + 0.33, hue2 + 0.67));

  // === CLIMAX: parting clouds ===
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxIntensity;
  float cloudPart = isClimax * climaxIntensity * 0.4; // reduce density at climax

  // === RAY SETUP (from 3D camera uniforms) ===
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Sun position (rises with climax)
  vec3 sunPos = vec3(2.0, 3.0 + climaxBoost * 1.5, 5.0);
  vec3 sunDir = normalize(sunPos - ro);

  // === VOLUMETRIC CLOUD RAYMARCH ===
  // Energy-gated steps: 24 cheap at quiet, 48 rich at peaks; tension adds detail
  int steps = int(mix(24.0, 48.0, energy)) + int(sJam * 8.0) - int(sSpace * 8.0) + int(tension * 4.0);
  float stepSize = 0.18 - melodicPitch * 0.03; // higher pitch = finer step = denser clouds

  vec3 cloudAccum = vec3(0.0);
  float cloudAlpha = 0.0;

  for (int i = 0; i < 48; i++) {
    if (i >= steps) break;
    float fi = float(i);
    float t = 0.5 + fi * stepSize;
    vec3 pos = ro + rd * t;

    float density = cloudDensity(pos, bass, flowTime);

    // Drum onset density spikes
    density += drumOnset * 0.3 * exp(-fi * 0.1);
    // Vocal presence thickens clouds at high energy
    density += uStemVocals * 0.15 * smoothstep(0.4, 0.7, energy);

    // Climax parts clouds
    density *= (1.0 - cloudPart);

    density *= 0.06 * mix(1.0, 1.2, sJam) * mix(1.0, 0.6, sSpace);

    if (density > 0.001) {
      float alpha = density * (1.0 - cloudAlpha);

      // Depth color: bright near, cooler far
      vec3 cloudColor = mix(cloudTint * 0.7, cloudTint * 0.3, fi / float(steps));

      // Forward scatter toward sun
      float sunDot = max(0.0, dot(rd, sunDir));
      float scatter = pow(sunDot, 4.0) * energy * 0.4;
      cloudColor += scatter * vec3(1.0, 0.95, 0.8);

      cloudAccum += cloudColor * alpha;
      cloudAlpha += alpha;
    }
  }

  vec3 col = cloudAccum;

  // === GOD RAYS: 8-step secondary march toward sun ===
  // Henyey-Greenstein phase function (g=0.76)
  {
    float godRayAccum = 0.0;
    float sunDot = dot(rd, sunDir);
    float g = 0.76;
    float phase = (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * sunDot, 1.5));

    for (int g2 = 0; g2 < 8; g2++) {
      float gt = 0.5 + float(g2) * 0.4;
      vec3 gpos = ro + rd * gt;
      float fogDen = cloudDensity(gpos, bass, flowTime);
      vec3 toSun = normalize(sunPos - gpos);
      float lightDensity = cloudDensity(gpos + toSun * 0.5, bass, flowTime);
      float inscatter = fogDen * exp(-lightDensity * 4.0);
      godRayAccum += inscatter * 0.06;
    }

    vec3 rayColor = mix(vec3(1.0, 0.92, 0.7), skyTint * 0.8, 0.3);
    col += rayColor * godRayAccum * phase * (0.8 + energy * 1.5 + climaxBoost * 1.0);
  }

  // === SKY GRADIENT ===
  float skyGrad = smoothstep(-0.1, 0.6, rd.y);
  vec3 skyColor = mix(vec3(0.15, 0.12, 0.2), skyTint * 0.4, skyGrad);
  col = mix(skyColor, col, cloudAlpha);

  // Beat pulse
  col *= 1.0 + uBeatSnap * 0.12 * (1.0 + climaxBoost * 0.3);

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, uBass, cloudTint, skyTint, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, uBass, cloudTint, skyTint, _nf, uSectionIndex);

  // === POST PROCESS ===
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
