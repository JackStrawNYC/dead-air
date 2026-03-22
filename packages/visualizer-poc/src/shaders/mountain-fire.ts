/**
 * Mountain Fire — blazing wildfire behind a mountain silhouette at night.
 * Layered SDF/noise mountain range in the bottom third, volumetric fire
 * and smoke rising behind, ember particles on beat, starfield sky that
 * fades as fire intensity grows.
 *
 * Designed for songs with massive dynamic range: quiet passages show
 * a faint campfire glow with stars; peaks produce a raging inferno
 * consuming the sky in deep red/orange.
 *
 * Audio reactivity:
 *   uEnergy       -> fire intensity and height (campfire 0.1 -> inferno 0.9)
 *   uFlatness     -> smoke density / opacity
 *   uBeat/uBass   -> ember burst intensity, fire sway
 *   uOnsetSnap    -> ember burst triggers
 *   uMelodicPitch -> mountain silhouette height shift
 *   uChromaHue    -> fire color variation (orange -> crimson -> magenta)
 *   uSlowEnergy   -> sky color transition (blue/purple -> red/orange)
 *   uSectionType  -> jam=fire builds higher, space=embers only, solo=focused column
 *   uVocalEnergy  -> fire column brightness boost
 *   uHarmonicTension -> turbulence in smoke layer
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const mountainFireVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const mountainFireFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', bloomEnabled: true, halationEnabled: true, flareEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Mountain silhouette: layered noise ridgeline ---
// Returns height at horizontal position x (0-1 range output, bottom of screen = 0)
float mountainProfile(float x, float seed, float scale, float height) {
  float n1 = snoise(vec3(x * 3.0 * scale + seed, seed * 0.7, 0.0)) * 0.5;
  float n2 = snoise(vec3(x * 7.0 * scale + seed + 10.0, seed * 1.3, 0.0)) * 0.25;
  float n3 = snoise(vec3(x * 15.0 * scale + seed + 30.0, seed * 2.1, 0.0)) * 0.12;
  float n4 = snoise(vec3(x * 30.0 * scale + seed + 50.0, seed * 3.0, 0.0)) * 0.06;
  return (n1 + n2 + n3 + n4) * height + height * 0.5;
}

// --- Starfield ---
float stars(vec2 uv, float density) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.72, h);
  float brightness = h2 * 0.5 + 0.5;
  return hasStar * brightness * smoothstep(0.025, 0.004, dist);
}

// --- Ember particle field ---
// Hash-based pseudo-random particles that drift upward
float emberParticle(vec2 uv, float time, float seed) {
  vec2 cell = floor(uv * 60.0);
  float h = fract(sin(dot(cell + seed, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell + seed, vec2(269.5, 183.3))) * 43758.5453);
  float h3 = fract(sin(dot(cell + seed, vec2(419.2, 371.9))) * 43758.5453);
  // Only some cells have embers
  if (h < 0.85) return 0.0;
  vec2 f = fract(uv * 60.0);
  // Drift upward with time, sway horizontally
  float rise = fract(h2 + time * (0.1 + h3 * 0.15));
  float sway = sin(time * 2.0 + h * 20.0) * 0.15;
  vec2 emberPos = vec2(h + sway * 0.3, rise);
  float dist = length(f - emberPos);
  // Fade as they rise
  float fade = 1.0 - rise;
  float size = mix(0.015, 0.04, h3);
  return smoothstep(size, size * 0.3, dist) * fade * fade;
}

// --- Fire FBM: upward-biased turbulent noise ---
float fireFBM(vec3 p, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    val += amp * snoise(p * freq);
    p.xz = rot * p.xz;
    p.y *= 1.15;
    freq *= 2.2;
    amp *= 0.48;
  }
  return val;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float flatness = clamp(uFlatness, 0.0, 1.0);
  float melodicP = clamp(uMelodicPitch, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // === CLIMAX ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // Stem contributions
  float vocalWarmth = clamp(uVocalEnergy, 0.0, 1.0);
  float drumPunch = max(uDrumOnset, uDrumBeat);

  // Time
  float slowTime = uDynamicTime * 0.1;
  float beatPH = beatPulseHalf(uMusicalTime);

  // === FIRE INTENSITY: massive dynamic range ===
  // 0.0 = dead dark, 0.1 = campfire glow, 0.5 = moderate blaze, 0.9 = raging inferno
  float fireIntensity = energy;
  fireIntensity += climaxBoost * 0.3;
  fireIntensity += sJam * 0.2;          // jam builds fire higher
  fireIntensity -= sSpace * 0.5;         // space = embers only
  fireIntensity += sChorus * 0.1;
  fireIntensity += vocalWarmth * 0.1;
  fireIntensity = clamp(fireIntensity, 0.0, 1.0);

  // Fire height: how far up the screen fire reaches
  float fireHeight = mix(0.05, 0.75, fireIntensity);
  // Solo = focused bright column (narrower but taller)
  float soloFocus = sSolo;

  // === MOUNTAIN SILHOUETTE ===
  // Melodic pitch subtly shifts mountain height
  float pitchShift = (melodicP - 0.5) * 0.04;
  // Three layered ridgelines for depth
  float mtHeight1 = mountainProfile(p.x, 0.0, 1.0, 0.18 + pitchShift) - 0.32;
  float mtHeight2 = mountainProfile(p.x, 5.0, 0.8, 0.22 + pitchShift) - 0.36;
  float mtHeight3 = mountainProfile(p.x, 12.0, 1.2, 0.15 + pitchShift) - 0.28;
  // Mountain mask: 1.0 = below mountain, 0.0 = sky
  float mtMask1 = smoothstep(mtHeight1 + 0.005, mtHeight1 - 0.005, p.y);
  float mtMask2 = smoothstep(mtHeight2 + 0.005, mtHeight2 - 0.005, p.y);
  float mtMask3 = smoothstep(mtHeight3 + 0.005, mtHeight3 - 0.005, p.y);
  float mtMaskCombined = max(mtMask1, max(mtMask2, mtMask3));
  // Highest mountain edge for fire occlusion
  float mtEdge = max(mtHeight1, max(mtHeight2, mtHeight3));

  // === SKY COLOR: deep blue/purple (quiet) -> deep red/orange (peaks) ===
  vec3 skyQuiet = vec3(0.01, 0.015, 0.06);     // deep night blue
  vec3 skyMid = vec3(0.06, 0.02, 0.04);        // dusky purple
  vec3 skyHot = vec3(0.15, 0.04, 0.02);        // deep red glow
  float skyMix = smoothstep(0.1, 0.8, slowE);
  vec3 skyColor = mix(skyQuiet, skyMid, skyMix);
  skyColor = mix(skyColor, skyHot, smoothstep(0.5, 1.0, fireIntensity));
  // Vertical gradient: darker at top
  skyColor *= mix(0.6, 1.0, smoothstep(0.5, -0.2, p.y));
  vec3 col = skyColor;

  // === STARS: visible during quiet, fade as fire brightens ===
  float starFade = 1.0 - smoothstep(0.15, 0.6, fireIntensity);
  float starLayer1 = stars(uv + slowTime * 0.008, 90.0);
  float starLayer2 = stars(uv + slowTime * 0.004 + 7.0, 130.0) * 0.5;
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.5 + uv.x * 40.0 + uv.y * 25.0);
  vec3 starColor = vec3(0.85, 0.88, 1.0) * (starLayer1 + starLayer2) * twinkle * starFade;
  // Stars only in sky (above mountains)
  col += starColor * 0.5 * (1.0 - mtMaskCombined);

  // === FIRE COLOR from chromaHue ===
  // Base: warm orange-red, shifted by chroma hue
  float fireHue = 0.05 + chromaH * 0.08; // range 0.05 (red-orange) to 0.13 (amber)
  float fireHue2 = 0.0 + chromaH * 0.05;  // deeper red variant
  vec3 fireColor1 = hsv2rgb(vec3(fireHue, 0.95, 1.0));   // bright fire
  vec3 fireColor2 = hsv2rgb(vec3(fireHue2, 0.9, 0.85));  // deep ember
  vec3 fireColorTip = hsv2rgb(vec3(0.12 + chromaH * 0.03, 0.6, 1.0)); // yellow tip
  // Palette influence
  vec3 palColor = hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.8, 1.0));
  fireColor1 = mix(fireColor1, palColor, 0.15);

  // === VOLUMETRIC FIRE behind mountains ===
  // Fire exists in a vertical column rising from behind the mountain ridge
  float fireBase = mtEdge - 0.02; // fire starts just behind mountaintop
  float fireTop = fireBase + fireHeight;

  // Raymarching fire volume
  int fireSteps = int(mix(12.0, 28.0, fireIntensity));
  vec4 fireAcc = vec4(0.0);
  float fireStepSize = mix(0.04, 0.025, fireIntensity);

  for (int i = 0; i < 32; i++) {
    if (i >= fireSteps) break;
    if (fireAcc.a > 0.92) break;

    float t = float(i) * fireStepSize;
    float sampleY = fireBase + t;

    // Skip if below mountain or way above fire top
    if (p.y < fireBase - 0.1 || sampleY > fireTop + 0.1) continue;

    // Fire column width: narrower at top, solo = focused column
    float columnWidth = mix(0.6, 0.15, (sampleY - fireBase) / max(fireHeight, 0.01));
    columnWidth *= mix(1.0, 0.4, soloFocus); // solo narrows it
    float xDist = abs(p.x) / max(columnWidth, 0.01);

    // Solo mode: offset to center column
    float soloCenter = soloFocus * 0.0; // centered

    // Skip pixels too far from fire column
    if (xDist > 1.5) continue;

    // 3D sample position for noise
    vec3 firePos = vec3(
      p.x * 2.0 + sin(sampleY * 3.0 + slowTime) * bass * 0.3,
      sampleY * 3.0 - slowTime * 2.0 - uDynamicTime * 0.3, // upward motion
      slowTime * 0.5 + tension * 0.2
    );

    // FBM fire density
    int octaves = int(mix(3.0, 6.0, fireIntensity));
    float density = fireFBM(firePos, octaves);
    density = smoothstep(-0.2, 0.5, density);

    // Horizontal falloff (fire is columnar)
    float hFalloff = 1.0 - smoothstep(0.0, 1.0, xDist);
    hFalloff *= hFalloff; // quadratic

    // Vertical falloff: bright at base, fading at top
    float vPos = (sampleY - fireBase) / max(fireHeight, 0.01);
    float vFalloff = smoothstep(1.1, 0.0, vPos); // fade toward top
    vFalloff *= smoothstep(fireBase - 0.05, fireBase + 0.05, p.y); // fade at base

    density *= hFalloff * vFalloff * fireIntensity;

    if (density > 0.01) {
      // Color varies with height: deep red at base -> orange -> yellow tip
      vec3 fCol = mix(fireColor2, fireColor1, vPos * 0.5);
      fCol = mix(fCol, fireColorTip, smoothstep(0.3, 0.8, vPos) * 0.4);
      // Solo: brighter focused light
      fCol *= 1.0 + soloFocus * 0.5;
      // Beat pulse brightness
      fCol *= 1.0 + beatPH * 0.3 + drumPunch * 0.2;
      // Climax extra brightness
      fCol *= 1.0 + climaxBoost * 0.4;

      float alpha = density * fireStepSize * 8.0;
      alpha = min(alpha, 1.0);
      float weight = alpha * (1.0 - fireAcc.a);
      fireAcc.rgb += fCol * weight;
      fireAcc.a += weight;
    }
  }

  // Apply fire (only above mountains)
  float aboveMountain = 1.0 - mtMaskCombined;
  col += fireAcc.rgb * aboveMountain;

  // === SMOKE LAYER: driven by flatness ===
  float smokeDensity = flatness * 0.6 + energy * 0.2;
  smokeDensity *= mix(1.0, 1.5, sJam);
  smokeDensity *= mix(1.0, 0.3, sSpace);
  if (smokeDensity > 0.02) {
    vec3 smokePos = vec3(p.x * 1.5, (p.y - mtEdge) * 2.0 - slowTime * 0.8, slowTime * 0.3 + tension * 0.5);
    float smoke = fbm(smokePos);
    smoke = smoothstep(-0.1, 0.5, smoke);
    // Smoke only above mountains
    float smokeVertical = smoothstep(mtEdge - 0.05, mtEdge + 0.3, p.y) * smoothstep(0.5, mtEdge + 0.1, p.y);
    smoke *= smokeVertical * smokeDensity;
    // Smoke color: dark gray with slight warm tint from fire
    vec3 smokeColor = mix(vec3(0.08, 0.06, 0.05), fireColor2 * 0.3, fireIntensity * 0.3);
    col = mix(col, smokeColor, smoke * 0.5);
  }

  // === FIRE GLOW on mountains: rim light from behind ===
  {
    float rimGlow = 0.0;
    // Glow strongest near mountain edge
    float edgeDist1 = abs(p.y - mtHeight1);
    float edgeDist2 = abs(p.y - mtHeight2);
    float edgeDist3 = abs(p.y - mtHeight3);
    float minEdgeDist = min(edgeDist1, min(edgeDist2, edgeDist3));
    rimGlow = smoothstep(0.08, 0.0, minEdgeDist) * fireIntensity;
    // Only on the top edge (not below)
    rimGlow *= smoothstep(mtEdge - 0.15, mtEdge + 0.01, p.y);
    vec3 rimColor = mix(fireColor1, fireColorTip, 0.3);
    col += rimColor * rimGlow * 0.6;
  }

  // === MOUNTAIN SILHOUETTE RENDERING ===
  // Dark silhouette with depth layering
  {
    vec3 mtColorFar = vec3(0.015, 0.012, 0.025);    // farthest range
    vec3 mtColorMid = vec3(0.01, 0.008, 0.018);     // middle range
    vec3 mtColorNear = vec3(0.005, 0.004, 0.012);   // nearest, darkest
    // Fire illumination on mountain face
    vec3 fireIllum = fireColor1 * fireIntensity * 0.08;
    mtColorFar += fireIllum * 0.5;
    mtColorMid += fireIllum * 0.3;
    mtColorNear += fireIllum * 0.15;
    // Layer compositing: far first, then mid, then near
    if (mtMask3 > 0.5) col = mix(col, mtColorFar, mtMask3);
    if (mtMask2 > 0.5) col = mix(col, mtColorMid, mtMask2);
    if (mtMask1 > 0.5) col = mix(col, mtColorNear, mtMask1);
  }

  // === EMBER PARTICLES ===
  {
    // Base ember field: always some embers when there's any fire
    float emberBase = emberParticle(uv, uDynamicTime * 0.4, 0.0);
    float emberLayer2 = emberParticle(uv * 1.3 + 0.5, uDynamicTime * 0.35, 7.0);
    float emberLayer3 = emberParticle(uv * 0.8 + 0.3, uDynamicTime * 0.5, 13.0);
    float embers = (emberBase + emberLayer2 * 0.7 + emberLayer3 * 0.5);

    // Onset triggers burst of extra embers
    float onsetBurst = onset * 2.0;
    float burstEmbers = emberParticle(uv * 2.0, uDynamicTime * 0.6, floor(uMusicalTime) * 3.7);
    embers += burstEmbers * onsetBurst;

    // Beat pulse makes embers brighter
    embers *= (1.0 + beatPH * 0.5 + drumPunch * 0.3);

    // Embers only visible in fire zone and above mountains
    float emberZone = smoothstep(mtEdge - 0.1, mtEdge + 0.05, p.y);
    // Horizontal: embers near fire column, spreading wider with energy
    float emberSpread = mix(0.3, 0.8, fireIntensity);
    float emberH = smoothstep(emberSpread, 0.0, abs(p.x));
    embers *= emberZone * emberH * fireIntensity;

    // Space section: embers only (already reduced fireIntensity)
    // Color: bright orange-yellow
    vec3 emberColor = mix(fireColor1, fireColorTip, 0.6);
    emberColor *= 1.5; // embers are bright hot spots
    col += emberColor * embers * 0.4;
  }

  // === AMBIENT FIRE GLOW: diffuse warm light across sky ===
  {
    float glowStrength = fireIntensity * (0.05 + energy * 0.1);
    glowStrength += climaxBoost * 0.08;
    float glowY = smoothstep(0.5, mtEdge - 0.1, p.y);
    float glowX = 1.0 - smoothstep(0.0, 0.6, abs(p.x));
    vec3 ambientGlow = mix(fireColor2, fireColor1, 0.4) * glowY * glowX * glowStrength;
    col += ambientGlow;
  }

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm(vec3(p * 2.0, slowTime));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, fireColor1, fireColor2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight * 0.6;
  }

  // === HERO ICON EMERGENCE ===
  {
    float nf = fbm(vec3(p * 1.5, slowTime * 0.7));
    vec3 heroLight = heroIconEmergence(p, uTime, energy, bass, fireColor1, fireColorTip, nf, uSectionIndex);
    col += heroLight;
  }

  // === DARKNESS TEXTURE: subtle life in dead-black passages ===
  col += darknessTexture(vUv, uTime, energy);

  // === VIGNETTE ===
  float vigScale = mix(0.26, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.01, 0.01), col, vignette);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
