/**
 * River — flowing water viewed from slightly above, looking downstream.
 * Animated UV-flow surface with fbm noise creating realistic water patterns.
 * Designed for versatile use: meditative glass-mirror in quiet passages,
 * churning white-water rapids at peak energy.
 *
 * Audio reactivity:
 *   uEnergy     -> flow speed (glass-still to rapids), foam density, turbulence
 *   uBass       -> ripple amplitude, visible low-frequency wave patterns
 *   uHighs      -> surface sparkle, fine ripple detail
 *   uMids       -> mid-frequency surface texture variation
 *   uOnsetSnap  -> splash impact rings, brief white-water bursts
 *   uSlowEnergy -> ambient drift speed, overall current strength
 *   uChromaHue  -> water color temperature (warm amber to cool blue)
 *   uStemVocals -> mist/fog intensity above the water surface
 *   uVocalPresence -> mist height and density
 *   uPalettePrimary   -> deep water color
 *   uPaletteSecondary -> sky/reflection color
 *   uSectionType -> jam=faster flow, space=still mirror, solo=focused rapids
 *   uMelodicPitch -> reflection brightness height
 *   uHarmonicTension -> water choppiness, cross-current turbulence
 *   uBeatStability -> groove tightens ripple patterns
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const riverVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const riverFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({ grainStrength: 'light', flareEnabled: false, halationEnabled: true, caEnabled: true })}

varying vec2 vUv;

#define PI 3.14159265

// --- Perspective projection: tilt UV for downstream river view ---
// Maps screen UV to river surface coordinates with ~30 degree downward look.
// Y stretches toward horizon, X stays centered.
vec2 riverPerspective(vec2 uv) {
  vec2 centered = uv - vec2(0.5);
  // Depth: compress Y toward horizon (top of screen = far downstream)
  float depth = 0.3 + uv.y * 1.8;
  float perspX = centered.x / (depth * 0.7);
  float perspY = pow(uv.y, 0.6) * 4.0 - 1.0;
  return vec2(perspX, perspY);
}

// --- Water flow FBM: directional noise that flows downstream ---
float waterFBM(vec3 p, float flowSpeed, float turbulence) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  // Downstream flow bias: noise samples drift in +Y direction
  vec3 flow = vec3(turbulence * 0.3, flowSpeed, 0.0);
  for (int i = 0; i < 6; i++) {
    val += amp * snoise(p * freq + flow * float(i) * 0.15);
    freq *= 2.12;
    amp *= 0.48;
    // Rotate XZ per octave for organic swirl
    p.xz = mat2(0.8, 0.6, -0.6, 0.8) * p.xz;
  }
  return val;
}

// --- Ripple rings: concentric rings from bass impacts ---
float rippleRing(vec2 uv, vec2 center, float time, float strength) {
  float dist = length(uv - center);
  float wave = sin(dist * 30.0 - time * 8.0) * 0.5 + 0.5;
  wave *= smoothstep(0.8, 0.0, dist) * strength;
  wave *= smoothstep(0.02, 0.1, dist); // hole in center
  return wave;
}

// --- Foam / white water: high-frequency noise gated by energy ---
float foamPattern(vec3 p, float energy) {
  float n = fbm6(p * 3.0);
  float threshold = mix(0.8, 0.2, energy); // more foam at high energy
  return smoothstep(threshold, threshold + 0.15, n);
}

// --- Spray particles: tiny bright dots scattered in rapids ---
float sprayParticles(vec2 uv, float time, float energy) {
  if (energy < 0.5) return 0.0;
  float spray = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float seed = fi * 73.156;
    vec2 pos = vec2(
      fract(sin(seed) * 43758.5) - 0.5,
      fract(sin(seed + 31.7) * 43758.5)
    );
    // Spray moves downstream and sideways
    pos.y = fract(pos.y + time * (0.3 + fi * 0.05));
    pos.x += sin(time * 2.0 + fi) * 0.15;
    float dist = length(uv - pos);
    float brightness = fract(sin(seed + 17.3) * 43758.5);
    spray += smoothstep(0.015, 0.003, dist) * brightness;
  }
  return spray * smoothstep(0.5, 0.9, energy) * 0.6;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  // --- Clamp audio inputs ---
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float onset = clamp(uOnsetSnap, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float chromaH = clamp(uChromaHue, 0.0, 1.0);
  float stemVocals = clamp(uStemVocals, 0.0, 1.0);
  float vocalPres = clamp(uVocalPresence, 0.0, 1.0);

  // === SECTION-TYPE MODULATION ===
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sChorus = smoothstep(1.5, 2.5, sectionT) * (1.0 - step(2.5, sectionT));
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // --- Derived audio modifiers ---
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float melPitch = clamp(uMelodicPitch, 0.0, 1.0);
  float melDir = clamp(uMelodicDirection, -1.0, 1.0);
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float localTempoScale = uLocalTempo / 120.0;

  // === FLOW DYNAMICS ===
  // Flow speed: massive range from glass-still to white-water rapids
  float flowSpeed = mix(0.02, 0.8, energy * energy) * localTempoScale;
  flowSpeed *= mix(1.0, 1.6, sJam);    // jam = faster current
  flowSpeed *= mix(1.0, 0.1, sSpace);  // space = near-still mirror
  flowSpeed *= mix(1.0, 1.3, sSolo);   // solo = focused rapids
  flowSpeed += uFastEnergy * 0.15;
  flowSpeed += uEnergyTrend * 0.05;

  float slowTime = uDynamicTime * 0.15;
  float flowTime = uDynamicTime * flowSpeed;

  // === PERSPECTIVE RIVER COORDINATES ===
  vec2 riverUV = riverPerspective(uv);
  // Animate downstream flow
  riverUV.y += flowTime;
  // Lateral drift from melodic direction
  riverUV.x += melDir * 0.08;

  // === WATER SURFACE: multi-layer FBM with downstream flow ===
  float turbulence = tension * 0.5 + onset * 0.8;
  vec3 waterPos = vec3(riverUV * 1.5, slowTime * 0.3);

  // Primary water displacement (large waves)
  float waterDisp = waterFBM(waterPos, flowSpeed * 2.0, turbulence);
  // Secondary fine ripples
  float fineRipple = waterFBM(waterPos * 3.0 + vec3(17.0, 0.0, 0.0), flowSpeed * 3.0, turbulence * 0.5) * 0.3;
  // Bass ripples: low-frequency concentric patterns
  float bassRipple = sin(length(riverUV - vec2(0.0, riverUV.y * 0.3)) * 12.0 - uDynamicTime * 4.0 * bass) * bass * 0.15;

  float totalDisp = waterDisp + fineRipple + bassRipple;

  // === WATER COLOR ===
  // Base: deep blue-green, shifting with palette and chroma
  float hue1 = uPalettePrimary + chromaH * 0.08;
  float hue2 = uPaletteSecondary + chromaH * 0.06;
  float sat = mix(0.5, 0.8, slowE) * uPaletteSaturation;

  vec3 deepColor = hsv2rgb(vec3(hue1, sat, 0.25 + energy * 0.15));
  vec3 midColor = hsv2rgb(vec3(mix(hue1, hue2, 0.5), sat * 0.9, 0.35 + energy * 0.2));
  vec3 shallowColor = hsv2rgb(vec3(hue2, sat * 0.7, 0.5 + energy * 0.25));

  // Depth-based water color (perspective Y = depth)
  float depth = smoothstep(0.0, 1.0, uv.y);
  vec3 waterColor = mix(deepColor, shallowColor, depth * 0.7);
  waterColor = mix(waterColor, midColor, totalDisp * 0.3 + 0.35);

  // === SKY / BACKGROUND (above horizon) ===
  // Horizon line: top portion of screen is sky
  float horizonLine = smoothstep(0.08, 0.18, uv.y);
  vec3 skyColor = mix(
    vec3(0.02, 0.03, 0.08),        // deep night sky at top
    vec3(0.06, 0.08, 0.15),         // lighter near horizon
    uv.y * 2.0
  );
  // Stars reflected in calm water
  float starLayer = 0.0;
  {
    vec2 starUV = uv * vec2(80.0, 40.0);
    vec2 cell = floor(starUV);
    vec2 f = fract(starUV);
    float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5);
    float h2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5);
    vec2 starPos = vec2(h, h2);
    float dist = length(f - starPos);
    float hasStar = step(0.72, h);
    float brightness = h2 * 0.5 + 0.5;
    float twinkle = 0.7 + 0.3 * sin(uTime * 1.5 + h * 50.0);
    starLayer = hasStar * brightness * smoothstep(0.025, 0.005, dist) * twinkle;
  }

  // === REFLECTIONS ===
  // Sky reflects on the water surface. Calmer water = clearer reflection.
  float reflectionClarity = mix(0.7, 0.1, energy); // glass = mirror, rapids = broken
  reflectionClarity *= mix(1.0, 1.5, sSpace);       // space = perfect mirror
  reflectionClarity *= mix(1.0, 0.3, sJam);         // jam = churned up

  // Distort reflection UV by water displacement
  vec2 reflUV = uv;
  reflUV.y = 1.0 - reflUV.y; // flip for reflection
  reflUV += vec2(totalDisp * 0.03, totalDisp * 0.02) * (1.0 - reflectionClarity);

  // Sky reflection on water
  vec3 skyReflection = skyColor * 0.8;
  skyReflection += vec3(0.8, 0.85, 1.0) * starLayer * reflectionClarity * 0.5;

  // Moonlight / melodic glow on the water surface
  float moonGlow = smoothstep(0.3, 0.0, length(p - vec2(0.2, 0.3)));
  moonGlow *= melPitch * 0.4 + 0.1;
  skyReflection += vec3(0.6, 0.65, 0.8) * moonGlow * reflectionClarity;

  // Blend reflection into water
  float fresnelAngle = pow(1.0 - abs(depth - 0.5) * 2.0, 2.0);
  float reflectAmount = mix(0.15, 0.6, reflectionClarity) * (0.5 + fresnelAngle * 0.5);
  waterColor = mix(waterColor, skyReflection, reflectAmount);

  // === SURFACE HIGHLIGHTS: energy-driven sparkle ===
  float sparkle = 0.0;
  {
    vec3 sparklePos = vec3(riverUV * 8.0, slowTime);
    float n = snoise(sparklePos);
    float threshold = mix(0.85, 0.55, energy + highs * 0.3);
    sparkle = smoothstep(threshold, threshold + 0.05, n);
    sparkle *= mix(0.3, 1.0, energy);
    sparkle *= 0.4 + highs * 0.6;  // highs drive sparkle density
  }
  waterColor += vec3(0.9, 0.92, 1.0) * sparkle * 0.35;

  // === FOAM / WHITE WATER ===
  float foam = foamPattern(vec3(riverUV, flowTime * 0.5), energy);
  // Foam increases with onset hits
  foam += onset * smoothstep(0.3, 0.8, energy) * 0.4;
  // Foam color: white with slight blue tint
  vec3 foamColor = vec3(0.85, 0.9, 0.95);
  waterColor = mix(waterColor, foamColor, foam * energy * 0.7);

  // === BASS RIPPLE RINGS ===
  {
    float ring1 = rippleRing(riverUV, vec2(0.0, flowTime * 0.5), uDynamicTime, bass * 0.3);
    float ring2 = rippleRing(riverUV, vec2(-0.3, flowTime * 0.3 + 1.0), uDynamicTime * 1.2, bass * 0.2);
    float rings = ring1 + ring2;
    waterColor += vec3(0.6, 0.7, 0.9) * rings * mix(0.5, 1.0, energy);
  }

  // === SPRAY PARTICLES (high energy only) ===
  float spray = sprayParticles(p, uDynamicTime * 0.3, energy);
  waterColor += vec3(1.0, 0.98, 0.95) * spray;

  // === SHORELINE / BANKS: dark silhouettes on sides ===
  float bankLeft = smoothstep(0.12, 0.0, uv.x) * (0.8 + 0.2 * fbm3(vec3(uv.y * 5.0, slowTime * 0.1, 0.0)));
  float bankRight = smoothstep(0.88, 1.0, uv.x) * (0.8 + 0.2 * fbm3(vec3(uv.y * 5.0, slowTime * 0.1, 7.0)));
  // Organic bank edge with noise
  float bankNoiseL = fbm3(vec3(uv.y * 12.0, slowTime * 0.05, 3.0)) * 0.04;
  float bankNoiseR = fbm3(vec3(uv.y * 12.0, slowTime * 0.05, 11.0)) * 0.04;
  bankLeft = smoothstep(0.14 + bankNoiseL, 0.04 + bankNoiseL, uv.x);
  bankRight = smoothstep(0.86 - bankNoiseR, 0.96 - bankNoiseR, uv.x);
  float banks = max(bankLeft, bankRight);
  vec3 bankColor = vec3(0.02, 0.03, 0.01); // dark earth/vegetation
  bankColor += vec3(0.01, 0.02, 0.0) * fbm3(vec3(uv * 10.0, 0.0)); // subtle texture

  // === MIST / FOG: vocal-driven atmospheric haze ===
  float mistDensity = stemVocals * 0.5 + vocalPres * 0.3;
  mistDensity *= mix(1.0, 1.5, sSpace);   // space = heavy mist
  mistDensity *= mix(1.0, 0.4, sJam);     // jam = less mist (blown away)
  float mistHeight = 0.3 + vocalPres * 0.3 + melPitch * 0.15;
  // Mist rises from the water surface
  float mistY = smoothstep(mistHeight + 0.15, mistHeight - 0.1, uv.y);
  float mistNoise = fbm3(vec3(p.x * 2.0, uv.y * 3.0, slowTime * 0.2));
  float mist = mistY * (mistNoise * 0.5 + 0.5) * mistDensity;
  // Wisps: thinner streaks that drift
  float wisps = fbm3(vec3(p.x * 6.0, uv.y * 2.0 - slowTime * 0.15, slowTime * 0.3));
  wisps = smoothstep(0.3, 0.7, wisps) * mistDensity * 0.4;
  mist += wisps;
  vec3 mistColor = mix(
    vec3(0.15, 0.18, 0.25),
    vec3(0.25, 0.28, 0.35),
    mistNoise * 0.5 + 0.5
  );

  // === CLIMAX REACTIVITY ===
  float climaxPhase = uClimaxPhase;
  float climaxI = uClimaxIntensity;
  float isClimax = step(1.5, climaxPhase) * step(climaxPhase, 3.5);
  float climaxBoost = isClimax * climaxI;
  // Climax: intensify everything
  waterColor *= 1.0 + climaxBoost * 0.3;
  foam += climaxBoost * 0.2;
  sparkle += climaxBoost * 0.15;

  // === COMPOSE FINAL IMAGE ===
  vec3 col = waterColor;

  // Blend in sky above horizon
  col = mix(skyColor + vec3(0.8, 0.85, 1.0) * starLayer * 0.3, col, horizonLine);

  // Apply banks
  col = mix(col, bankColor, banks);

  // Apply mist on top
  col = mix(col, mistColor, clamp(mist, 0.0, 0.7));

  // === SDF ICON EMERGENCE: stealie/icons at peaks ===
  {
    float nf = waterFBM(vec3(p * 2.0, slowTime), 0.0, 0.0);
    vec3 iconCol1 = hsv2rgb(vec3(hue1, sat, 0.8));
    vec3 iconCol2 = hsv2rgb(vec3(hue2, sat * 0.9, 0.7));
    vec3 iconLight = iconEmergence(p, uTime, energy, bass, iconCol1, iconCol2, nf, climaxPhase, uSectionIndex);
    col += iconLight * 0.6;
  }

  // === BEAT PULSE: gentle brightness swell on the water ===
  {
    float bp = beatPulseHalf(uMusicalTime);
    float bpGated = bp * smoothstep(0.3, 0.6, uBeatConfidence);
    col *= 1.0 + bpGated * 0.08;
  }

  // === VIGNETTE ===
  float vigScale = mix(0.25, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.01, 0.02, 0.03), col, vignette);

  // === POST-PROCESSING ===
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
