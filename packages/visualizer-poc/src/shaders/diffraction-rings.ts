/**
 * Diffraction Rings — raymarched 3D optical bench.
 * A laser beam strikes a crystal aperture, creating volumetric diffraction
 * patterns in space: Airy discs, interference fringes, rainbow caustics,
 * all rendered with proper 3D depth. The laser source is visible as a
 * bright coherent beam that refracts through the crystal geometry.
 *
 * Visual aesthetic:
 *   - Quiet: single faint ring expanding in darkness, crystal barely visible
 *   - Building: fringe count increases, beam brightens, crystal catches light
 *   - Peak: full rainbow spectrum caustics, multiple diffraction orders
 *   - Release: fringes fade to single ring, crystal dims
 *   - Climax: crystal shatters into fragments, each spawning its own beam
 *
 * Audio reactivity:
 *   uBass              → pattern scale (ring diameter)
 *   uEnergy            → laser brightness + fringe count
 *   uDrumOnset         → crystal rotation snap
 *   uVocalPresence     → beam glow intensity
 *   uHarmonicTension   → wavelength shift (color change)
 *   uSectionType       → jam=rotating crystal rapid pattern shift,
 *                         space=single ring in darkness,
 *                         chorus=full rainbow spectrum
 *   uClimaxPhase       → crystal shatters into multiple beams
 *   uSlowEnergy        → overall intensity envelope
 *   uMelodicPitch      → diffraction order emphasis
 *   uOnsetSnap         → fringe pulse ripple
 *   uPalettePrimary    → laser hue tint
 *   uPaletteSecondary  → caustic hue tint
 *   uChromaHue         → spectral offset
 *   uBeatStability     → pattern coherence
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const diffractionRingsVert = /* glsl */ `
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
  caEnabled: true,
  temporalBlendEnabled: false,
});

export const diffractionRingsFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Wavelength (nm) → sRGB ───
// Maps 380-780nm visible spectrum to approximate sRGB
vec3 drfWavelengthToRGB(float wavelength) {
  float w = clamp(wavelength, 380.0, 780.0);
  vec3 rgb;
  if (w < 440.0) {
    rgb = vec3(-(w - 440.0) / 60.0, 0.0, 1.0);
  } else if (w < 490.0) {
    rgb = vec3(0.0, (w - 440.0) / 50.0, 1.0);
  } else if (w < 510.0) {
    rgb = vec3(0.0, 1.0, -(w - 510.0) / 20.0);
  } else if (w < 580.0) {
    rgb = vec3((w - 510.0) / 70.0, 1.0, 0.0);
  } else if (w < 645.0) {
    rgb = vec3(1.0, -(w - 645.0) / 65.0, 0.0);
  } else {
    rgb = vec3(1.0, 0.0, 0.0);
  }
  // Intensity falloff at edges of visible spectrum
  float factor;
  if (w < 420.0) {
    factor = 0.3 + 0.7 * (w - 380.0) / 40.0;
  } else if (w > 700.0) {
    factor = 0.3 + 0.7 * (780.0 - w) / 80.0;
  } else {
    factor = 1.0;
  }
  return rgb * factor;
}

// ─── 2x2 Rotation matrix ───
mat2 drfRot2(float a) {
  float c = cos(a); float s = sin(a);
  return mat2(c, -s, s, c);
}

// ─── Crystal SDF: faceted hexagonal prism ───
// Returns distance to a hexagonal crystal with beveled edges
float drfCrystalSDF(vec3 pos, float radius, float height) {
  // Hexagonal cross-section
  vec2 q = abs(pos.xz);
  float hex = max(q.x * 0.866025 + q.y * 0.5, q.y) - radius;
  // Height bounds
  float yDist = abs(pos.y) - height;
  // Combine: smooth union for beveled edges
  float bevel = 0.02;
  vec2 dd = max(vec2(hex, yDist), 0.0);
  return length(dd) + min(max(hex, yDist), 0.0) - bevel;
}

// ─── Crystal fragment SDF: for climax shatter ───
float drfFragmentSDF(vec3 pos, vec3 offset, float size, float rotAngle) {
  vec3 lp = pos - offset;
  lp.xz *= drfRot2(rotAngle);
  lp.xy *= drfRot2(rotAngle * 0.7);
  // Irregular tetrahedron approximation
  float d = max(max(
    dot(lp, normalize(vec3(1.0, 1.0, 0.0))),
    dot(lp, normalize(vec3(-1.0, 0.5, 1.0)))),
    dot(lp, normalize(vec3(0.0, -1.0, 0.5)))
  ) - size;
  return d;
}

// ─── Scene SDF: crystal + fragments ───
float drfMap(vec3 pos, float drumSnap, float climaxAmt, float crystalAngle, float jamSpin) {
  // Crystal position: centered at origin
  vec3 crystalPos = pos;
  // Drum onset causes angular snap; jam mode adds continuous spin
  float totalAngle = crystalAngle + jamSpin;
  crystalPos.xz *= drfRot2(totalAngle);
  crystalPos.xy *= drfRot2(totalAngle * 0.3);

  float crystalRadius = 0.3;
  float crystalHeight = 0.5;

  // Main crystal — fades out during climax shatter
  float crystalFade = 1.0 - smoothstep(0.3, 0.8, climaxAmt);
  float dist = drfCrystalSDF(crystalPos, crystalRadius, crystalHeight);
  // Bias distance when fading to prevent artifacts
  dist = mix(dist, dist + 2.0, 1.0 - crystalFade);

  // Climax: shattered fragments orbit outward
  if (climaxAmt > 0.05) {
    float shatterSpread = climaxAmt * 1.5;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float angle = fi * TAU / 5.0 + totalAngle * 0.5;
      float vertOff = sin(fi * 2.3 + totalAngle) * 0.3 * climaxAmt;
      vec3 fragOffset = vec3(
        cos(angle) * shatterSpread,
        vertOff,
        sin(angle) * shatterSpread
      );
      float fragSize = 0.08 + 0.04 * sin(fi * 1.7);
      float fragDist = drfFragmentSDF(pos, fragOffset, fragSize, totalAngle + fi * 1.2);
      dist = min(dist, fragDist);
    }
  }

  return dist;
}

// ─── Airy disc pattern: J1(x)/x diffraction envelope ───
// Approximation of the Airy function for circular aperture diffraction
float drfAiryDisc(float radius, float wavelengthScale) {
  float x = radius * wavelengthScale;
  if (abs(x) < 0.001) return 1.0;
  // sinc-like approximation of 2*J1(x)/x
  float j1Approx = sin(x) / x;
  return j1Approx * j1Approx;
}

// ─── Interference fringe pattern ───
// Multi-slit interference with adjustable fringe count
float drfInterference(float pathDiff, float fringeCount) {
  float phase = pathDiff * fringeCount * TAU;
  // Intensity: cos^2 envelope modulated by sinc diffraction
  float cosSq = 0.5 + 0.5 * cos(phase);
  float envelope = drfAiryDisc(pathDiff, fringeCount * 0.5);
  return cosSq * envelope;
}

// ─── Diffraction pattern color: spectral sampling ───
vec3 drfDiffractionColor(float pathDiff, float tensionShift, float spectrumWidth) {
  vec3 col = vec3(0.0);
  float totalWeight = 0.0;
  // Sample visible spectrum at 10 wavelengths
  for (int i = 0; i < 10; i++) {
    float fi = float(i) / 10.0;
    float wavelength = 420.0 + fi * 280.0 + tensionShift * 60.0;
    float phase = pathDiff * TAU / (wavelength * 0.001);
    float intensity = 0.5 + 0.5 * cos(phase * spectrumWidth);
    intensity *= intensity; // sharpen fringes
    vec3 spectral = drfWavelengthToRGB(wavelength);
    col += spectral * intensity;
    totalWeight += 1.0;
  }
  return col / totalWeight;
}

// ─── Volumetric laser beam ───
// Renders a coherent beam from source through crystal
vec3 drfLaserBeam(vec3 pos, vec3 beamOrigin, vec3 beamDir, float brightness,
                  float vocalGlow, float beamHue) {
  // Distance from point to beam axis
  vec3 toPos = pos - beamOrigin;
  float along = dot(toPos, beamDir);
  vec3 closest = beamOrigin + beamDir * along;
  float dist = length(pos - closest);

  // Core beam: tight gaussian
  float core = exp(-dist * dist * 800.0) * brightness;
  // Glow: wider soft halo, enhanced by vocal presence
  float glow = exp(-dist * dist * 40.0) * brightness * 0.3 * (1.0 + vocalGlow * 2.0);
  // Scattering: very wide atmospheric scatter
  float scatter = 1.0 / (1.0 + dist * dist * 12.0) * brightness * 0.05;

  // Only render beam in forward direction from source
  float forwardMask = smoothstep(-0.5, 0.5, along);

  vec3 beamColor = hsv2rgb(vec3(beamHue, 0.6, 1.0));
  vec3 glowColor = hsv2rgb(vec3(beamHue + 0.05, 0.3, 1.0));

  return (beamColor * core + glowColor * glow + vec3(0.8, 0.85, 1.0) * scatter) * forwardMask;
}

// ─── Volumetric diffraction field ───
// Renders the 3D diffraction pattern that forms after light passes through crystal
vec3 drfPatternVolume(vec3 pos, float energy, float bass, float tension,
                      float melodicPitch, float fringeCount, float spectrumWidth,
                      float patHue, float patHue2) {
  // Diffraction pattern exists in the z+ half (after crystal)
  float behindCrystal = smoothstep(-0.2, 0.8, pos.z);
  if (behindCrystal < 0.01) return vec3(0.0);

  // Radial distance from beam axis in pattern plane
  float radial = length(pos.xy);
  // Scale pattern by bass (wider rings at high bass)
  float patternScale = 1.0 + bass * 1.5;
  float scaledRadial = radial / patternScale;

  // Distance behind crystal affects pattern spread
  float zSpread = max(pos.z, 0.1);
  float spreadRadial = scaledRadial / (zSpread * 0.5);

  // Airy disc: central bright spot with concentric dark/bright rings
  float airyPattern = drfAiryDisc(spreadRadial * 6.0, 3.0 + energy * 5.0);

  // Interference fringes modulated by fringe count
  float interference = drfInterference(spreadRadial, fringeCount);

  // Combine: Airy envelope * interference detail
  float combined = airyPattern * 0.6 + interference * 0.4;
  combined *= combined; // contrast boost

  // Spectral color from path difference
  vec3 spectralCol = drfDiffractionColor(spreadRadial, tension, spectrumWidth);

  // Palette tinting
  vec3 tint1 = hsv2rgb(vec3(patHue, 0.5, 1.0));
  vec3 tint2 = hsv2rgb(vec3(patHue2, 0.4, 1.0));
  float tintMix = 0.5 + 0.5 * sin(spreadRadial * 8.0 + tension * 3.0);
  vec3 tintedSpec = spectralCol * mix(tint1, tint2, tintMix);

  // Depth attenuation: pattern fades with distance
  float depthFade = exp(-zSpread * 0.3);
  // Radial falloff
  float radialFade = exp(-radial * radial * 0.8);

  // Melodic pitch emphasizes higher diffraction orders
  float orderEmphasis = 1.0 + melodicPitch * 0.5 * sin(spreadRadial * 20.0);

  return tintedSpec * combined * behindCrystal * depthFade * radialFade * orderEmphasis * energy;
}

// ─── Caustic highlights: rainbow caustic patterns on nearby surfaces ───
vec3 drfCaustics(vec3 pos, float time, float energy, float tension, float bass) {
  // Caustics are brightest near the crystal
  float proximity = exp(-length(pos) * 0.5);
  if (proximity < 0.01) return vec3(0.0);

  // Multi-scale caustic pattern via layered sine interference
  float c1 = sin(pos.x * 15.0 + pos.z * 10.0 + time * 0.5) *
             cos(pos.y * 12.0 - pos.z * 8.0 + time * 0.3);
  float c2 = sin(pos.x * 8.0 - pos.y * 14.0 + time * 0.7 + 2.0) *
             cos(pos.z * 11.0 + pos.x * 6.0 + time * 0.4);
  float caustic = max(0.0, c1 + c2) * 0.5;
  caustic = pow(caustic, 2.0 + (1.0 - energy) * 2.0);

  // Rainbow coloring based on position
  float pathLen = length(pos.xy) * 4.0 + tension * 2.0;
  vec3 causticColor = drfDiffractionColor(pathLen, tension, 1.0 + bass * 0.5);

  return causticColor * caustic * proximity * energy * 0.6;
}

// ─── Crystal surface refraction glow ───
vec3 drfCrystalGlow(vec3 pos, vec3 normal, float crystalDist, float energy,
                    float beamHue, float tension) {
  if (crystalDist > 0.15) return vec3(0.0);

  // Surface proximity glow
  float surfaceGlow = exp(-crystalDist * 40.0);

  // Fresnel-like rim lighting
  vec3 viewDir = normalize(-pos);
  float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.0);

  // Internal refraction: prismatic dispersion
  float dispersion = sin(dot(pos, vec3(10.0, 12.0, 8.0)) + tension * 5.0) * 0.5 + 0.5;
  vec3 refractColor = drfWavelengthToRGB(450.0 + dispersion * 250.0 + tension * 60.0);

  // Crystal body color
  vec3 crystalBase = hsv2rgb(vec3(beamHue + 0.1, 0.2, 0.4));
  vec3 crystalRim = hsv2rgb(vec3(beamHue + 0.3, 0.6, 1.0));

  return (crystalBase * surfaceGlow + crystalRim * fresnel * 0.8 + refractColor * dispersion * 0.3) * energy;
}

// ─── Compute normal via central differences ───
vec3 drfNormal(vec3 pos, float drumSnap, float climaxAmt, float crystalAngle, float jamSpin) {
  vec2 eps = vec2(0.002, 0.0);
  float d0 = drfMap(pos, drumSnap, climaxAmt, crystalAngle, jamSpin);
  return normalize(vec3(
    drfMap(pos + eps.xyy, drumSnap, climaxAmt, crystalAngle, jamSpin) - d0,
    drfMap(pos + eps.yxy, drumSnap, climaxAmt, crystalAngle, jamSpin) - d0,
    drfMap(pos + eps.yyx, drumSnap, climaxAmt, crystalAngle, jamSpin) - d0
  ));
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // ─── Audio uniform clamping ───
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float vocalPresence = clamp(uVocalPresence, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float climaxPhase = uClimaxPhase;
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float chromaHueMod = uChromaHue * 0.12;

  float slowTime = uDynamicTime * 0.04;

  // ─── Section-type modulation ───
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Jam: rapid crystal rotation, rapid pattern shifts
  float jamSpinRate = sJam * 2.5;
  // Space: single ring in darkness — minimal energy, low fringe count
  float spaceDim = sSpace * 0.7; // dims everything by 70%
  // Chorus: full rainbow spectrum — wide spectrum sampling
  float chorusSpectrum = 1.0 + sChorus * 2.0;
  // Solo: dramatic single beam, high contrast
  float soloContrast = 1.0 + sSolo * 0.5;

  // ─── Climax: crystal shatter amount ───
  float climaxAmt = smoothstep(1.5, 3.0, climaxPhase) * climaxIntensity;

  // ─── Crystal rotation: drum onset snaps, jam spins ───
  // Accumulated angle from drum onsets (snaps crystal orientation)
  float crystalAngle = floor(drumOnset * 3.0 + 0.5) * PI * 0.25 + slowTime * 0.2;
  float jamSpin = uDynamicTime * jamSpinRate;

  // ─── Camera setup ───
  vec3 ro, rd;
  setupCameraRay(uv, aspect, ro, rd);

  // Fallback camera if uCamPos is default/zero
  float camLen = length(uCamPos);
  if (camLen < 0.01) {
    ro = vec3(0.0, 0.3, -3.0);
    vec3 lookAt = vec3(0.0, 0.0, 0.5);
    vec3 fwd = normalize(lookAt - ro);
    vec3 rSide = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 vUp = cross(rSide, fwd);
    float fovScale = tan(radians(55.0) * 0.5);
    vec2 sp = (uv - 0.5) * aspect;
    rd = normalize(fwd + rSide * sp.x * fovScale + vUp * sp.y * fovScale);
  }

  // ─── Background: deep darkness with subtle gradient ───
  vec3 col = vec3(0.005, 0.003, 0.01);
  // Faint radial gradient suggesting optical bench environment
  float bgGrad = exp(-length(p) * 0.5);
  col += vec3(0.01, 0.008, 0.02) * bgGrad;
  // Space mode: extra darkness
  col *= 1.0 - spaceDim * 0.8;

  // ─── Raymarching: crystal solid geometry ───
  float totalDist = 0.0;
  float minCrystalDist = 100.0;
  vec3 crystalHitPos = vec3(0.0);
  bool crystalFound = false;
  int maxSteps = 64;

  for (int i = 0; i < 64; i++) {
    vec3 marchPos = ro + rd * totalDist;
    float dist = drfMap(marchPos, drumOnset, climaxAmt, crystalAngle, jamSpin);

    if (dist < minCrystalDist) {
      minCrystalDist = dist;
      crystalHitPos = marchPos;
    }

    if (dist < 0.002) {
      crystalFound = true;
      break;
    }

    if (totalDist > 15.0) break;
    totalDist += dist * 0.8; // slightly conservative for crystal detail
  }

  // ─── Crystal rendering ───
  if (crystalFound) {
    vec3 norm = drfNormal(crystalHitPos, drumOnset, climaxAmt, crystalAngle, jamSpin);
    float beamHue = uPalettePrimary + chromaHueMod;
    vec3 crystalCol = drfCrystalGlow(crystalHitPos, norm, 0.0, energy, beamHue, tension);

    // Specular highlight from laser direction
    vec3 laserDir = normalize(vec3(0.0, 0.0, 1.0));
    vec3 viewDir = normalize(ro - crystalHitPos);
    vec3 halfDir = normalize(laserDir + viewDir);
    float spec = pow(max(0.0, dot(norm, halfDir)), 64.0);
    crystalCol += vec3(1.0, 0.95, 0.9) * spec * energy * 1.5;

    // Refraction rainbow on crystal body
    float dispAngle = dot(norm, laserDir);
    vec3 refractRainbow = drfWavelengthToRGB(450.0 + dispAngle * 200.0 + tension * 80.0);
    crystalCol += refractRainbow * 0.3 * energy;

    col += crystalCol * soloContrast;
  } else {
    // Crystal near-miss glow (subsurface / proximity illumination)
    float beamHue = uPalettePrimary + chromaHueMod;
    vec3 nearGlow = drfCrystalGlow(crystalHitPos, normalize(crystalHitPos), minCrystalDist, energy, beamHue, tension);
    col += nearGlow * 0.5;
  }

  // ─── Volumetric pass: laser beam + diffraction pattern + caustics ───
  // March through volume accumulating light contributions
  vec3 volumeLight = vec3(0.0);
  float volStepSize = 0.15;
  int volSteps = 40;
  float volDist = 0.5; // start in front of crystal

  float beamHue = uPalettePrimary + chromaHueMod;
  float beamBrightness = (0.3 + energy * 0.7) * (1.0 - spaceDim * 0.6);
  float fringeCount = 3.0 + energy * 12.0 - sSpace * 8.0;
  float spectrumWidth = chorusSpectrum;
  float patHue = uPalettePrimary + chromaHueMod;
  float patHue2 = uPaletteSecondary;

  // Laser source position (behind the crystal)
  vec3 laserOrigin = vec3(0.0, 0.0, -4.0);
  vec3 laserDir = normalize(vec3(0.0, 0.0, 1.0));

  for (int i = 0; i < 40; i++) {
    vec3 volPos = ro + rd * volDist;

    // Laser beam
    vec3 beamContrib = drfLaserBeam(volPos, laserOrigin, laserDir,
                                     beamBrightness, vocalPresence, beamHue);
    volumeLight += beamContrib * volStepSize * 0.4;

    // Diffraction pattern (behind crystal)
    vec3 patternContrib = drfPatternVolume(volPos, energy, bass, tension,
                                            melodicPitch, fringeCount, spectrumWidth,
                                            patHue, patHue2);
    volumeLight += patternContrib * volStepSize * 1.2;

    // Caustic highlights
    vec3 causticContrib = drfCaustics(volPos, slowTime, energy, tension, bass);
    volumeLight += causticContrib * volStepSize * 0.6;

    // Climax: multiple beams from shattered fragments
    if (climaxAmt > 0.05) {
      for (int j = 0; j < 5; j++) {
        float fj = float(j);
        float fragAngle = fj * TAU / 5.0 + crystalAngle * 0.5 + jamSpin;
        vec3 fragDir = normalize(vec3(
          sin(fragAngle) * 0.5,
          cos(fj * 2.3) * 0.3,
          0.8
        ));
        vec3 fragOrigin = vec3(
          cos(fragAngle) * climaxAmt * 1.5,
          sin(fj * 2.3) * 0.3 * climaxAmt,
          sin(fragAngle) * climaxAmt * 1.5
        );
        float fragHue = beamHue + fj * 0.12;
        vec3 fragBeam = drfLaserBeam(volPos, fragOrigin, fragDir,
                                      beamBrightness * climaxAmt * 0.5, vocalPresence, fragHue);
        volumeLight += fragBeam * volStepSize * 0.25;
      }
    }

    volDist += volStepSize;
    if (volDist > 10.0) break;
  }

  col += volumeLight;

  // ─── Onset snap: ripple pulse through existing pattern ───
  if (onsetSnap > 0.15) {
    float rippleDist = length(p);
    float ripple = sin(rippleDist * 25.0 - uTime * 6.0) * exp(-rippleDist * 2.5);
    vec3 rippleColor = drfDiffractionColor(rippleDist * 3.0, tension, spectrumWidth);
    col += rippleColor * ripple * onsetSnap * 0.4;
  }

  // ─── Beat stability: pattern coherence ───
  // High stability → sharp fringes; low stability → smeared
  float stabilitySmear = 1.0 - beatStab * 0.3;
  col = mix(col, col * stabilitySmear, 0.3);

  // ─── Palette tinting (dual palette) ───
  vec3 tint1 = hsv2rgb(vec3(patHue, uPaletteSaturation * 0.3, 1.0));
  vec3 tint2 = hsv2rgb(vec3(patHue2, uPaletteSaturation * 0.25, 0.9));
  float tintMix = fbm3(vec3(p * 1.5, slowTime * 0.1));
  col *= mix(vec3(1.0), mix(tint1, tint2, tintMix * 0.5 + 0.5), 0.2);

  // ─── Climax intensity boost ───
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxIntensity;
  col *= 1.0 + climaxBoost * 0.6;

  // ─── Slow energy envelope ───
  col *= 0.4 + slowE * 0.6;

  // ─── Solo contrast enhancement ───
  if (sSolo > 0.01) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, col * (lum * 0.8 + 0.2) / max(lum, 0.001), sSolo * 0.3);
  }

  // ─── SDF icon emergence ───
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(patHue, uPaletteSaturation, 1.0));
    vec3 c2 = hsv2rgb(vec3(patHue2, uPaletteSaturation, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, climaxPhase, uSectionIndex) * 0.5;
  }

  // ─── Hero icon emergence ───
  {
    float nf = fbm3(vec3(p * 1.5, slowTime + 50.0));
    vec3 c1 = hsv2rgb(vec3(patHue + 0.1, uPaletteSaturation, 1.0));
    vec3 c2 = hsv2rgb(vec3(patHue2 + 0.1, uPaletteSaturation, 1.0));
    col += heroIconEmergence(p, uTime, energy, bass, c1, c2, nf, uSectionIndex);
  }

  // ─── Vignette ───
  float vigScale = mix(0.3, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col *= vignette;

  // ─── Post-processing ───
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
