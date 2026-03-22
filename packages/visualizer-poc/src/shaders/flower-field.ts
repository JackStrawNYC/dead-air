/**
 * Flower Field — art nouveau Dead poster come alive.
 * A living painting of stylized flowers that bloom and sway with the music.
 * SDF petal shapes, warm pastels at rest, explosive saturated bloom at peaks.
 *
 * Designed for mid-energy songs — gentle garden at rest, explosive bloom at peaks.
 * Art nouveau / Mucha poster aesthetic, NOT photorealistic.
 *
 * Audio reactivity:
 *   uEnergy      -> bloom state (closed buds at rest, full petal spread at peaks)
 *   uBass        -> field sway/ripple amplitude (bass hits wave through stems)
 *   uHighs       -> butterfly/pollen particle count above the field
 *   uOnsetSnap   -> petal burst animation trigger
 *   uSlowEnergy  -> overall color warmth and saturation
 *   uChromaHue   -> shifts petal colors with harmonic content
 *   uPalettePrimary   -> dominant petal color
 *   uPaletteSecondary -> secondary petal/stem color
 *   uVocalEnergy -> flowers glow warmer (vocals = sunlight)
 *   uSectionType -> jam=rapid blooming, space=gentle closed buds, solo=spotlight
 *   uMelodicPitch -> flower height modulation
 *   uHarmonicTension -> color vibrancy shifts
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const flowerFieldVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const flowerFieldFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', bloomEnabled: true, halationEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// --- Hash for grid-based flower placement ---
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 hash22(vec2 p) {
  return vec2(
    fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453),
    fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453)
  );
}

// --- SDF flower: circle center with petal lobes at regular angles ---
// bloomAmount 0-1 controls petal spread (0=tight bud, 1=full bloom)
float sdFlower(vec2 p, float petalCount, float bloomAmount, float petalPhase) {
  float r = length(p);
  float a = atan(p.y, p.x);

  // Center bud: always present
  float bud = r - 0.04;

  // Petals: lobes that spread outward with bloomAmount
  float petalSpread = mix(0.02, 0.12, bloomAmount);
  float petalWidth = mix(0.6, 1.0, bloomAmount);
  float petalR = petalSpread * (0.5 + 0.5 * pow(max(0.0, cos((a + petalPhase) * petalCount)), petalWidth));

  // Combine: smooth union of bud and petals
  float flower = min(bud, r - 0.035 - petalR);
  return flower;
}

// --- SDF stem: vertical line with slight curve ---
float sdStem(vec2 p, float height, float sway) {
  // Curved stem: quadratic bend
  float curve = sway * p.y * p.y;
  float d = abs(p.x - curve) - 0.003;
  // Vertical extent
  d = max(d, -p.y);
  d = max(d, p.y - height);
  return d;
}

// --- Leaf SDF: tear-drop shape ---
float sdLeaf(vec2 p, float size) {
  // Rotate slightly
  float a = 0.4;
  float ca = cos(a), sa = sin(a);
  p = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
  // Elongated ellipse
  float d = length(p * vec2(1.0, 2.5)) - size;
  return d;
}

// --- Butterfly SDF ---
float sdButterfly(vec2 p, float wingPhase) {
  // Wing flap animation
  float flap = sin(wingPhase) * 0.3;
  // Left wing
  vec2 lp = p - vec2(-0.015, 0.0);
  lp.x *= 1.0 + flap;
  float lw = length(lp * vec2(1.0, 1.5)) - 0.02;
  // Right wing
  vec2 rp = p - vec2(0.015, 0.0);
  rp.x *= 1.0 - flap;
  float rw = length(rp * vec2(1.0, 1.5)) - 0.02;
  // Body
  float body = length(p * vec2(5.0, 1.0)) - 0.008;
  return min(min(lw, rw), body);
}

// --- Pollen particle ---
float sdPollen(vec2 p) {
  return length(p) - 0.002;
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
  float vocalWarmth = clamp(uVocalEnergy, 0.0, 1.0);

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

  // === TIME ===
  float slowTime = uDynamicTime * 0.08;
  // Camera slowly pans across the field
  float panSpeed = 0.01 + sJam * 0.02 - sSpace * 0.005;
  float camX = uTime * panSpeed;
  float camY = sin(uTime * 0.003) * 0.05;

  // === BLOOM STATE: energy drives how open the flowers are ===
  float bloomState = mix(0.1, 1.0, energy);
  bloomState = mix(bloomState, 1.0, sJam * 0.5);  // Jam: rapid blooming
  bloomState = mix(bloomState, 0.15, sSpace * 0.7); // Space: gentle closed buds
  bloomState += climaxBoost * 0.3;
  bloomState = clamp(bloomState, 0.0, 1.0);

  // Onset burst: temporary extra bloom
  float burstPhase = onset * 0.4;
  bloomState = min(1.0, bloomState + burstPhase);

  // === BACKGROUND: warm gradient sky (golden hour feel) ===
  float skyGrad = smoothstep(-0.3, 0.6, p.y);
  // Warm pastels at rest, vibrant at peaks
  vec3 skyBottom = mix(vec3(0.95, 0.75, 0.50), vec3(1.0, 0.55, 0.30), energy * 0.5);
  vec3 skyTop = mix(vec3(0.55, 0.65, 0.90), vec3(0.35, 0.45, 0.85), energy * 0.3);
  // Vocal warmth makes sky more golden (vocals = sunlight)
  skyBottom = mix(skyBottom, vec3(1.0, 0.85, 0.55), vocalWarmth * 0.3);
  vec3 sky = mix(skyBottom, skyTop, skyGrad);

  // Subtle cloud wisps
  float cloudNoise = fbm3(vec3(p.x * 2.0 + camX * 0.5, p.y * 3.0, slowTime * 0.3));
  float cloudMask = smoothstep(0.2, 0.5, p.y) * smoothstep(0.7, 0.4, p.y);
  sky += vec3(1.0, 0.97, 0.92) * cloudNoise * cloudMask * 0.08;

  vec3 col = sky;

  // === PALETTE COLORS ===
  float hue1 = uPalettePrimary + chromaH * 0.08;
  float hue2 = uPaletteSecondary + chromaH * 0.06;
  float sat = mix(0.5, 0.95, energy) * uPaletteSaturation;
  float tensionSat = uHarmonicTension * 0.15;

  vec3 petalColor1 = hsv2rgb(vec3(hue1, sat + tensionSat, mix(0.85, 1.0, energy)));
  vec3 petalColor2 = hsv2rgb(vec3(hue2, sat * 0.9 + tensionSat, mix(0.8, 0.95, energy)));
  // Art nouveau warm pastels blend
  petalColor1 = mix(petalColor1, vec3(0.95, 0.60, 0.70), 0.15); // rose tint
  petalColor2 = mix(petalColor2, vec3(0.90, 0.80, 0.50), 0.15); // gold tint

  vec3 stemColor = mix(vec3(0.25, 0.55, 0.20), vec3(0.35, 0.70, 0.25), energy * 0.5);
  vec3 leafColor = mix(vec3(0.20, 0.50, 0.18), vec3(0.30, 0.65, 0.22), slowE);

  // === GRASS/STEMS LAYER at bottom ===
  float grassLine = -0.25 + snoise(vec3(p.x * 3.0 + camX, 0.0, slowTime * 0.2)) * 0.06;
  float grassMask = smoothstep(grassLine + 0.05, grassLine - 0.02, p.y);
  // Grass sways with bass
  float grassSway = bass * 0.02 * sin(p.x * 8.0 + uTime * 2.0);
  float grassNoise = fbm3(vec3((p.x + grassSway + camX) * 6.0, p.y * 10.0, slowTime * 0.5));
  vec3 grassCol = mix(stemColor * 0.7, stemColor, grassNoise * 0.5 + 0.5);
  col = mix(col, grassCol, grassMask * 0.85);

  // === FLOWER FIELD: grid of stylized flowers ===
  float flowerAccum = 0.0;
  vec3 flowerColorAccum = vec3(0.0);
  float stemAccum = 0.0;

  // Field coordinates with camera pan
  vec2 fieldP = p + vec2(camX, camY);

  // Grid: multiple scales for depth
  for (int layer = 0; layer < 3; layer++) {
    float layerF = float(layer);
    float scale = mix(6.0, 14.0, layerF / 2.0);
    float layerDepth = 1.0 - layerF * 0.25; // front flowers bigger
    float layerAlpha = mix(1.0, 0.5, layerF / 2.0);

    vec2 gridUV = fieldP * scale;
    vec2 cellID = floor(gridUV);
    vec2 cellUV = fract(gridUV) - 0.5;

    // Check this cell and neighbors for overlap
    for (int ox = -1; ox <= 1; ox++) {
      for (int oy = -1; oy <= 1; oy++) {
        vec2 neighbor = vec2(float(ox), float(oy));
        vec2 id = cellID + neighbor;

        // Random: presence, position, type
        float presence = hash21(id);
        if (presence < 0.35) continue; // sparse field

        vec2 offset = hash22(id * 1.31 + 7.0) * 0.6 - 0.3;
        vec2 fp = cellUV - neighbor - offset;
        fp /= scale * 0.08 * layerDepth; // normalize to flower space

        float flowerSeed = hash21(id * 2.71);
        float petalCount = floor(mix(5.0, 8.0, flowerSeed));

        // Per-flower bloom: modulated by position noise for wave effect
        float waveMod = snoise(vec3(id * 0.3, slowTime * 0.5)) * 0.3;
        float localBloom = clamp(bloomState + waveMod, 0.0, 1.0);

        // Bass sway: whole flower sways
        float swayAmount = bass * 0.15 * sin(id.x * 2.0 + uTime * 1.5 + id.y);
        swayAmount *= mix(1.0, 2.0, sJam); // Jam: more sway
        swayAmount *= mix(1.0, 0.3, sSpace); // Space: minimal sway
        fp.x += swayAmount * layerDepth;

        // Melodic pitch: taller flowers at higher pitch
        float pitchLift = uMelodicPitch * 0.1 * layerDepth;

        // Solo spotlight: only center flowers visible
        float soloMask = 1.0;
        if (sSolo > 0.3) {
          float distFromCenter = length(fieldP);
          soloMask = mix(1.0, smoothstep(0.5, 0.1, distFromCenter), sSolo);
        }

        // Stem
        float stemH = (0.2 + flowerSeed * 0.15 + pitchLift) * layerDepth;
        vec2 stemP = fp;
        stemP.y += stemH * 0.5;
        float stemD = sdStem(stemP, stemH, swayAmount * 0.5);
        float stemLine = smoothstep(0.015, 0.0, stemD) * layerAlpha * soloMask;

        // Leaf on stem
        vec2 leafP = fp - vec2(0.03, -stemH * 0.3);
        float leafD = sdLeaf(leafP, 0.02 * layerDepth);
        float leafLine = smoothstep(0.01, 0.0, leafD) * layerAlpha * soloMask * 0.7;

        // Flower head at top of stem
        vec2 flowerP = fp - vec2(swayAmount * 0.3, -stemH);
        float petalPhase = flowerSeed * TAU + slowTime * 0.2;
        float d = sdFlower(flowerP, petalCount, localBloom, petalPhase);

        // Glow: soft falloff around flower
        float glow = smoothstep(0.03, 0.0, d) * layerAlpha * soloMask;
        float edge = smoothstep(0.005, 0.0, abs(d)) * layerAlpha * soloMask * 0.5;

        // Color per flower: varies by seed
        vec3 thisColor = mix(petalColor1, petalColor2, flowerSeed);
        // Vocal warmth = sunlight: warmer glow
        thisColor = mix(thisColor, thisColor * vec3(1.15, 1.05, 0.90), vocalWarmth * 0.4);
        // Onset burst: brief flash of brightness
        thisColor *= 1.0 + onset * 0.5;

        flowerColorAccum += thisColor * (glow * 0.8 + edge * 0.4);
        flowerAccum += glow + edge * 0.3;

        // Stems and leaves
        col = mix(col, stemColor, stemLine * 0.6);
        col = mix(col, leafColor, leafLine * 0.5);
      }
    }
  }

  // Apply flower color
  col = mix(col, col + flowerColorAccum, clamp(flowerAccum, 0.0, 1.0));

  // === BUTTERFLY / POLLEN PARTICLES ===
  // Count driven by uHighs
  float particleCount = mix(3.0, 12.0, highs);
  vec3 particleAccum = vec3(0.0);

  for (int i = 0; i < 12; i++) {
    if (float(i) >= particleCount) break;
    float fi = float(i);
    float seed = hash21(vec2(fi * 17.3, fi * 31.7));
    float seed2 = hash21(vec2(fi * 53.1, fi * 7.9));

    // Floating path: Lissajous-like orbits
    float px = sin(uTime * (0.15 + seed * 0.1) + seed * TAU) * 0.5 * aspect.x;
    float py = mix(-0.1, 0.4, seed2) + sin(uTime * (0.2 + seed2 * 0.15) + fi) * 0.08;
    vec2 particleP = p - vec2(px + camX * 0.3, py);

    if (seed > 0.6) {
      // Butterfly
      float wingPhase = uTime * (3.0 + seed * 2.0);
      float d = sdButterfly(particleP * 8.0, wingPhase);
      float vis = smoothstep(0.02, 0.0, d);
      vec3 bColor = hsv2rgb(vec3(hue1 + seed * 0.2, 0.8, 0.9));
      particleAccum += bColor * vis * 0.4;
    } else {
      // Pollen sparkle
      float d = sdPollen(particleP * 15.0);
      float vis = smoothstep(0.01, 0.0, d);
      float twinkle = 0.5 + 0.5 * sin(uTime * 4.0 + fi * 3.0);
      particleAccum += vec3(1.0, 0.95, 0.80) * vis * twinkle * 0.3;
    }
  }
  col += particleAccum;

  // === SDF ICON EMERGENCE ===
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, petalColor1, petalColor2, nf, uClimaxPhase, uSectionIndex);
    col += iconLight;
  }

  // === VIGNETTE: warm edges for painting feel ===
  float vigScale = mix(0.30, 0.24, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  vec3 vigColor = mix(vec3(0.15, 0.10, 0.05), vec3(0.0), 0.5);
  col = mix(vigColor, col, vignette);

  // === ART NOUVEAU BORDER GLOW ===
  // Subtle warm border evocative of poster frame edges
  float borderDist = max(abs(p.x / aspect.x), abs(p.y));
  float borderGlow = smoothstep(0.48, 0.42, borderDist) * (1.0 - smoothstep(0.42, 0.38, borderDist));
  vec3 borderColor = mix(vec3(0.8, 0.6, 0.3), petalColor1, 0.3);
  col += borderColor * borderGlow * 0.06 * (0.5 + energy * 0.5);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
