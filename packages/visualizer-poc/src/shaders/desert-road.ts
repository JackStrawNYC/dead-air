/**
 * Desert Road — endless highway stretching to a vanishing point under a vast sky.
 * Warm oranges, dusty atmosphere, mesa silhouettes, telephone poles, cacti.
 * Designed for mid-energy songs with strong forward momentum.
 *
 * Movement driven by uLocalTempo — forward travel speed along the road.
 * Massive dynamic range: parked stargazing at low energy → pedal to the metal at high.
 *
 * Audio reactivity:
 *   uLocalTempo   → forward motion speed, center line scroll
 *   uEnergy       → heat shimmer intensity, dust amount, sky brightness
 *   uBass         → road vibration, low rumble distortion
 *   uOnsetSnap    → dust devil triggers, pole passing emphasis
 *   uBeat         → telephone pole passing rhythm
 *   uChromaHue    → sky sunset gradient hue shift
 *   uSlowEnergy   → sky darkness (low = stargazing, high = blazing sunset)
 *   uHighs        → mirage sharpness, star twinkle
 *   uStemVocals   → headlight glow intensity (solo mode)
 *   uSectionType  → jam=accelerating/blur, space=stopped/stargazing, solo=headlights
 *   uPalettePrimary   → dominant sky/dust color
 *   uPaletteSecondary → accent mesa/cactus silhouette tint
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const desertRoadVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const desertRoadFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'normal', thermalShimmerEnabled: true, flareEnabled: true, halationEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Starfield for night sky ---
float desertStars(vec2 uv, float density) {
  vec2 cell = floor(uv * density);
  vec2 f = fract(uv * density);
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
  vec2 starPos = vec2(h, h2);
  float dist = length(f - starPos);
  float hasStar = step(0.75, h);
  float brightness = h2 * 0.6 + 0.4;
  return hasStar * brightness * smoothstep(0.025, 0.004, dist);
}

// --- Mesa / butte silhouette SDF (trapezoid with noise) ---
float mesaSilhouette(vec2 p, float x, float baseW, float topW, float height, float seed) {
  vec2 mp = p - vec2(x, 0.0);
  // Trapezoid shape
  float t = clamp(mp.y / height, 0.0, 1.0);
  float w = mix(baseW, topW, t);
  float d = abs(mp.x) - w;
  float top = mp.y - height;
  // Noise-eroded top edge for rocky appearance
  float erosion = snoise(vec3(mp.x * 8.0 + seed, mp.y * 4.0, seed * 10.0)) * 0.04;
  top += erosion;
  float shape = max(d, top);
  return shape;
}

// --- Saguaro cactus silhouette ---
float saguaroCactus(vec2 p, float x, float height, float seed) {
  vec2 cp = p - vec2(x, 0.0);
  // Main trunk
  float trunk = max(abs(cp.x) - 0.008, cp.y - height);
  trunk = max(trunk, -cp.y);
  // Left arm
  float armH = height * (0.4 + fract(seed * 7.13) * 0.2);
  vec2 la = cp - vec2(-0.008, armH);
  float leftArm = max(abs(la.x + 0.012) - 0.006, abs(la.y) - 0.025);
  float leftUp = max(abs(cp.x + 0.02) - 0.006, max(cp.y - (armH + 0.05), -(cp.y - armH)));
  // Right arm
  float armH2 = height * (0.5 + fract(seed * 3.71) * 0.2);
  vec2 ra = cp - vec2(0.008, armH2);
  float rightArm = max(abs(ra.x - 0.012) - 0.006, abs(ra.y) - 0.02);
  float rightUp = max(abs(cp.x - 0.02) - 0.006, max(cp.y - (armH2 + 0.04), -(cp.y - armH2)));
  float d = trunk;
  d = min(d, min(leftArm, leftUp));
  d = min(d, min(rightArm, rightUp));
  return d;
}

// --- Dust devil particle column ---
vec3 dustDevil(vec2 p, float time, float onset, float energy, float seed) {
  if (onset < 0.3) return vec3(0.0);
  float x = fract(seed * 13.37) * 1.6 - 0.8;
  vec2 dp = p - vec2(x, -0.15);
  float angle = atan(dp.y, dp.x) + time * 3.0 * (1.0 + seed);
  float r = length(dp);
  float spiral = sin(angle * 3.0 + r * 20.0 - time * 8.0);
  float column = smoothstep(0.12, 0.0, abs(dp.x)) * smoothstep(-0.1, 0.3, dp.y) * smoothstep(0.5, 0.1, dp.y);
  float dust = column * (0.5 + 0.5 * spiral) * onset * energy;
  return vec3(0.9, 0.7, 0.4) * dust * 0.35;
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
  float mids = clamp(uMids, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // --- Derived audio values ---
  float localTempoScale = uLocalTempo / 120.0;
  float beatStability = clamp(uBeatStability, 0.0, 1.0);
  float stemVocals = clamp(uStemVocals, 0.0, 1.0);
  float bpH = beatPulseHalf(uMusicalTime);
  float bp = beatPulse(uMusicalTime);

  // === SPEED: forward motion driven by tempo and section ===
  // Space = stopped. Jam = accelerating. Normal = cruising.
  float baseSpeed = localTempoScale * mix(0.6, 1.4, energy);
  baseSpeed *= mix(1.0, 2.0, sJam);     // jam: pedal to the metal
  baseSpeed *= mix(1.0, 0.0, sSpace);   // space: pulled over, stargazing
  baseSpeed *= mix(1.0, 1.2, sChorus);  // chorus: steady cruising
  float forwardTime = uDynamicTime * baseSpeed * 0.3;

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;

  // === SKY: vast sunset/twilight gradient ===
  // Low energy = dark night sky. High energy = blazing sunset.
  float skyBrightness = mix(0.15, 1.0, slowE * 0.6 + energy * 0.4);
  float sunsetPos = 0.0; // horizon line

  // Sunset gradient colors shifting with chromaHue
  float hueShift = chromaH * 0.15;
  vec3 skyTop = mix(
    vec3(0.02, 0.01, 0.06),   // dark night
    vec3(0.15, 0.08, 0.35) + vec3(hueShift, 0.0, -hueShift),  // deep purple
    skyBrightness
  );
  vec3 skyMid = mix(
    vec3(0.03, 0.02, 0.08),
    vec3(0.85, 0.35, 0.15) + vec3(hueShift * 0.5, hueShift, 0.0), // orange fire
    skyBrightness
  );
  vec3 skyHorizon = mix(
    vec3(0.04, 0.03, 0.05),
    vec3(1.0, 0.65, 0.2) + vec3(0.0, hueShift, hueShift * 0.3), // golden horizon
    skyBrightness
  );

  // Palette integration
  vec3 palColor1 = hsv2rgb(vec3(uPalettePrimary, uPaletteSaturation * 0.7, 0.8));
  vec3 palColor2 = hsv2rgb(vec3(uPaletteSecondary, uPaletteSaturation * 0.6, 0.6));
  skyMid = mix(skyMid, palColor1, 0.2);
  skyHorizon = mix(skyHorizon, palColor1, 0.15);

  // Build sky gradient
  float skyY = p.y;
  vec3 col = mix(skyHorizon, skyMid, smoothstep(0.0, 0.15, skyY));
  col = mix(col, skyTop, smoothstep(0.15, 0.5, skyY));

  // Sun glow at horizon
  float sunDist = length(vec2(p.x * 0.5, p.y));
  float sunGlow = exp(-sunDist * 8.0) * skyBrightness * 0.6;
  col += vec3(1.0, 0.75, 0.3) * sunGlow;

  // === STARS: appear as sky darkens ===
  float nightFactor = smoothstep(0.4, 0.1, slowE) * smoothstep(0.3, 0.05, energy);
  nightFactor = max(nightFactor, sSpace * 0.8); // space = stargazing
  if (nightFactor > 0.01 && skyY > 0.0) {
    float twinkle = 0.6 + 0.4 * sin(uTime * 2.5 + uv.x * 60.0 + uv.y * 40.0);
    float s1 = desertStars(uv + uDynamicTime * 0.002, 90.0);
    float s2 = desertStars(uv + uDynamicTime * 0.001 + 5.0, 140.0) * 0.5;
    vec3 starCol = vec3(0.9, 0.85, 1.0) * (s1 + s2) * twinkle * nightFactor;
    starCol *= smoothstep(0.0, 0.1, skyY); // only above horizon
    col += starCol * 0.6;
  }

  // === HORIZON LINE ===
  float horizonY = 0.0;

  // === MESA / BUTTE SILHOUETTES ===
  // Multiple mesas at varying distances (parallax)
  float mesaMask = 0.0;
  // Far mesas (slow parallax)
  float farScroll = forwardTime * 0.02;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float seed = fi * 3.17 + 1.0;
    float mx = fract(fi * 0.37 + farScroll * 0.1) * 3.0 - 1.5;
    float mh = 0.08 + fract(seed * 2.31) * 0.12;
    float bw = 0.06 + fract(seed * 1.73) * 0.08;
    float tw = bw * (0.4 + fract(seed * 4.19) * 0.3);
    float d = mesaSilhouette(p - vec2(0.0, horizonY), mx, bw, tw, mh, seed);
    mesaMask = max(mesaMask, 1.0 - smoothstep(0.0, 0.003, d));
  }
  // Near mesas (faster parallax)
  float nearScroll = forwardTime * 0.08;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float seed = fi * 5.71 + 10.0;
    float mx = fract(fi * 0.43 + nearScroll * 0.05) * 4.0 - 2.0;
    float mh = 0.04 + fract(seed * 1.91) * 0.06;
    float bw = 0.1 + fract(seed * 2.37) * 0.15;
    float tw = bw * (0.5 + fract(seed * 3.13) * 0.3);
    float d = mesaSilhouette(p - vec2(0.0, horizonY), mx, bw, tw, mh, seed);
    mesaMask = max(mesaMask, 1.0 - smoothstep(0.0, 0.002, d));
  }
  // Mesa silhouettes: dark with subtle palette tint
  vec3 mesaColor = mix(vec3(0.04, 0.02, 0.03), palColor2 * 0.15, 0.3);
  col = mix(col, mesaColor, mesaMask * step(0.0, p.y));

  // === SAGUARO CACTI along roadside ===
  float cactusMask = 0.0;
  float cactusScroll = forwardTime * 0.15;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = fi * 7.31 + 20.0;
    float side = (mod(fi, 2.0) < 1.0) ? -1.0 : 1.0;
    float cx = side * (0.15 + fract(seed * 1.23) * 0.4);
    float scrollX = fract(fi * 0.31 + cactusScroll * 0.03) * 2.0 - 1.0;
    cx += scrollX * side * 0.3;
    float ch = 0.03 + fract(seed * 2.17) * 0.05;
    float d = saguaroCactus(p - vec2(0.0, horizonY - 0.005), cx, ch, seed);
    cactusMask = max(cactusMask, 1.0 - smoothstep(0.0, 0.002, d));
  }
  vec3 cactusColor = vec3(0.02, 0.01, 0.02);
  col = mix(col, cactusColor, cactusMask * step(-0.01, p.y) * step(p.y, 0.08));

  // === ROAD: asphalt strip to vanishing point ===
  // Perspective: road narrows toward horizon (vanishing point at center)
  float belowHorizon = step(p.y, horizonY);
  float roadDepth = smoothstep(horizonY, horizonY - 0.5, p.y);
  float roadWidth = mix(0.01, 0.35, roadDepth);
  float roadMask = (1.0 - smoothstep(roadWidth - 0.005, roadWidth, abs(p.x))) * belowHorizon;

  // Road surface: dark asphalt with subtle texture
  float roadNoise = snoise(vec3(p.x * 30.0, p.y * 10.0 + forwardTime * 2.0, 0.0)) * 0.03;
  vec3 asphalt = vec3(0.08, 0.07, 0.06) + roadNoise;

  // Road heat shimmer: UV displacement above the road surface
  float shimmerZone = smoothstep(horizonY - 0.15, horizonY - 0.02, p.y) * belowHorizon;
  float shimmerAmt = energy * 0.008 * shimmerZone;
  shimmerAmt *= mix(1.0, 2.5, sJam); // jam: intense heat shimmer
  shimmerAmt *= mix(1.0, 0.0, sSpace); // space: no shimmer when stopped
  vec2 shimmerUV = uv + vec2(
    sin(p.y * 80.0 + uTime * 4.0) * shimmerAmt,
    cos(p.x * 40.0 + uTime * 3.0) * shimmerAmt * 0.3
  );
  // Apply shimmer displacement to sky area near road
  if (shimmerAmt > 0.001 && p.y > horizonY - 0.15 && p.y < horizonY + 0.05) {
    vec2 shimP = (shimmerUV - 0.5) * aspect;
    float shimSkyY = shimP.y;
    vec3 shimCol = mix(skyHorizon, skyMid, smoothstep(0.0, 0.15, shimSkyY));
    col = mix(col, shimCol, shimmerZone * 0.4);
  }

  // Center line dashes: scrolling with forward motion
  float centerLineWidth = 0.003 * (1.0 + roadDepth * 0.5);
  float centerLine = (1.0 - smoothstep(centerLineWidth, centerLineWidth + 0.001, abs(p.x)));
  // Dashes: repeating pattern along road depth
  float dashSpeed = forwardTime * 5.0;
  float dashY = p.y - horizonY;
  float perspDash = dashY * 20.0 + dashSpeed;
  float dash = step(0.5, fract(perspDash));
  centerLine *= dash * belowHorizon * roadMask;
  vec3 lineColor = vec3(0.9, 0.85, 0.3); // yellow center line
  asphalt = mix(asphalt, lineColor, centerLine * 0.8);

  // Road edge lines (white)
  float edgeLineL = smoothstep(roadWidth - 0.008, roadWidth - 0.005, abs(p.x))
                  * (1.0 - smoothstep(roadWidth - 0.005, roadWidth - 0.002, abs(p.x)));
  asphalt = mix(asphalt, vec3(0.7, 0.7, 0.65), edgeLineL * belowHorizon * 0.5);

  // Apply road
  col = mix(col, asphalt, roadMask);

  // Desert ground on sides of road (below horizon, outside road)
  float groundMask = belowHorizon * (1.0 - roadMask);
  vec3 desertGround = vec3(0.35, 0.25, 0.15) * (0.3 + 0.2 * snoise(vec3(p.x * 5.0, p.y * 3.0 + forwardTime * 0.5, 1.0)));
  desertGround = mix(desertGround, palColor1 * 0.25, 0.2);
  col = mix(col, desertGround, groundMask * 0.7);

  // === TELEPHONE POLES: passing at regular intervals on beat ===
  float poleInterval = 0.25;
  float poleScroll = forwardTime * 1.5 + bp * 0.02;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float polePhase = fract(fi * poleInterval + poleScroll * 0.2);
    // Parallax: poles approach from distance
    float poleDepth = polePhase;
    float poleX = mix(0.5, 0.18, poleDepth) * (mod(fi, 2.0) < 1.0 ? 1.0 : -1.0);
    float poleHeight = mix(0.01, 0.25, poleDepth);
    float poleWidth = mix(0.001, 0.004, poleDepth);
    float poleY = horizonY - 0.01;
    // Pole vertical line
    vec2 pp = p - vec2(poleX, poleY);
    float poleMask = step(-poleHeight, pp.y) * step(pp.y, poleHeight)
                   * (1.0 - smoothstep(poleWidth, poleWidth + 0.001, abs(pp.x)));
    // Crossbar
    float crossY = poleHeight * 0.85;
    float crossW = poleWidth * 8.0;
    float crossMask = (1.0 - smoothstep(0.001, 0.002, abs(pp.y - crossY)))
                    * step(-crossW, pp.x) * step(pp.x, crossW);
    // Wire between poles (catenary hint)
    float wireSag = 0.01 * (1.0 - poleDepth);
    float wireY = crossY - wireSag * (pp.x / crossW) * (pp.x / crossW);
    float wireMask = (1.0 - smoothstep(0.0005, 0.001, abs(pp.y - wireY)))
                   * step(-crossW * 1.5, pp.x) * step(pp.x, crossW * 1.5);
    float allPole = max(poleMask, max(crossMask, wireMask * 0.5));
    allPole *= poleDepth * poleDepth; // fade with distance
    col = mix(col, vec3(0.03, 0.02, 0.02), allPole * 0.9);
  }

  // === DUST DEVILS on onset hits ===
  col += dustDevil(p, uTime, onset, energy, 1.0);
  col += dustDevil(p, uTime, onset, energy, 2.7);

  // Atmospheric dust haze
  float dustHaze = energy * 0.08 + onset * 0.05;
  dustHaze *= mix(1.0, 2.0, sJam); // jam: dusty blur
  col += vec3(0.8, 0.6, 0.3) * dustHaze * smoothstep(0.3, -0.1, p.y);

  // === JAM MODE: motion blur / speed lines ===
  if (sJam > 0.1) {
    float speedLines = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float ly = fract(fi * 0.37 + forwardTime * 0.8) * 0.5 - 0.25;
      float lx = (fract(fi * 0.71) - 0.5) * 2.0;
      float streak = smoothstep(0.003, 0.0, abs(p.y - ly))
                   * smoothstep(0.0, 0.3, abs(p.x - lx * 0.5));
      speedLines += streak;
    }
    col += vec3(0.9, 0.7, 0.4) * speedLines * sJam * 0.15;
  }

  // === SOLO MODE: headlights ===
  if (sSolo > 0.1) {
    // Twin headlight cones projecting forward
    float hlL = exp(-length(vec2((p.x + 0.06) * 3.0, (p.y + 0.1) * 1.5)) * 8.0);
    float hlR = exp(-length(vec2((p.x - 0.06) * 3.0, (p.y + 0.1) * 1.5)) * 8.0);
    vec3 headlightCol = vec3(1.0, 0.95, 0.8) * (hlL + hlR) * sSolo;
    // Road illumination cone
    float roadLight = smoothstep(0.3, 0.0, p.y + 0.1) * roadMask * 0.4;
    headlightCol += vec3(0.8, 0.75, 0.6) * roadLight * sSolo;
    col += headlightCol * (0.3 + stemVocals * 0.4);
  }

  // === SPACE MODE: extra stars, stillness ===
  if (sSpace > 0.3) {
    float extraStars = desertStars(uv * 1.5 + 30.0, 200.0) * 0.4;
    float milkyWay = smoothstep(0.15, 0.0, abs(p.x + sin(p.y * 2.0) * 0.1)) * 0.08;
    milkyWay *= smoothstep(0.0, 0.2, p.y);
    col += vec3(0.7, 0.75, 1.0) * extraStars * sSpace * smoothstep(0.0, 0.05, p.y);
    col += vec3(0.5, 0.5, 0.7) * milkyWay * sSpace;
  }

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm(vec3(p * 3.0, uDynamicTime * 0.1));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, palColor1, palColor2, nf, climaxPhase, uSectionIndex);
    col += iconLight * 0.6;
  }

  // === VIGNETTE: road trip framing ===
  float vigScale = mix(0.30, 0.22, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.02, 0.01, 0.01), col, vignette);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
