/**
 * Obsidian Mirror — profound stillness. A perfectly reflective black plane
 * (the obsidian lake) sits at the bottom 50% of the frame, mirroring a sparse
 * star field and a single distant moon from the upper 50% sky. Extremely slow,
 * gentle ripples perturb the reflection. Cool blue tint on the deepest blacks.
 *
 * Bridge shader for Veneta routing — used for the quietest emotional moments
 * (He's Gone, Sing Me Back Home, And We Bid You Goodnight intro). The visual
 * thesis: emptiness as a positive space. Motion is the enemy; reflection is
 * the subject.
 *
 * Audio reactivity (15+ uniforms):
 *   uEnergy           -> master opacity (very subtle, mostly stable)
 *   uSlowEnergy       -> ripple amplitude on the mirror
 *   uVocalEnergy      -> moon brightness (the moon "listens")
 *   uBeatSnap         -> very subtle star twinkle (decayed)
 *   uBeatConfidence   -> twinkle gating
 *   uChromaHue        -> moon tint (cool blue <-> warm gold, phase-change)
 *   uOnsetSnap        -> single-drop ripple impact
 *   uBass             -> reflection clarity (clearer when bass is present)
 *   uHighs            -> extreme starfield micro-shimmer
 *   uCoherence        -> water surface tension
 *   uSectionType      -> space/jam modulation
 *   uClimaxPhase      -> unused for climax (stillness), but moon halo nudge
 *   uShowWarmth       -> global warmth bias
 *   uVenueVignette    -> vignette depth
 *   uDynamicTime      -> slow drift time
 *   uSpaceScore       -> deepens stillness (pulls energy down further)
 *   uDynamicRange     -> reflection sharpness
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const obsidianMirrorVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const obsidianMirrorFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;

${noiseGLSL}
${lightingGLSL}

${buildPostProcessGLSL({
  grainStrength: "normal",
  bloomEnabled: false,
  halationEnabled: false,
  caEnabled: false,
  lightLeakEnabled: false,
  lensDistortionEnabled: true,
  beatPulseEnabled: false,
  eraGradingEnabled: true,
  temporalBlendEnabled: true,
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// ─── Deterministic hash for star field ───
float omHash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 omHash22(vec2 p) {
  float n = sin(dot(p, vec2(127.1, 311.7)));
  return fract(vec2(262144.0, 32768.0) * n);
}

// ─── Sparse star field ───
// 18 stars scattered across the upper-half sky. Returns (intensity, twinkle).
vec2 omStar(vec2 p, float time, float beatTwinkle, float highs) {
  float accum = 0.0;
  float twinkleOut = 0.0;

  // Fixed seeded positions — deterministic, no regeneration.
  vec2 starSeeds[18];
  starSeeds[0]  = vec2(0.07, 0.82);
  starSeeds[1]  = vec2(0.14, 0.91);
  starSeeds[2]  = vec2(0.21, 0.74);
  starSeeds[3]  = vec2(0.28, 0.96);
  starSeeds[4]  = vec2(0.33, 0.68);
  starSeeds[5]  = vec2(0.41, 0.88);
  starSeeds[6]  = vec2(0.48, 0.78);
  starSeeds[7]  = vec2(0.54, 0.94);
  starSeeds[8]  = vec2(0.61, 0.71);
  starSeeds[9]  = vec2(0.66, 0.85);
  starSeeds[10] = vec2(0.73, 0.62);
  starSeeds[11] = vec2(0.79, 0.89);
  starSeeds[12] = vec2(0.84, 0.76);
  starSeeds[13] = vec2(0.90, 0.93);
  starSeeds[14] = vec2(0.95, 0.67);
  starSeeds[15] = vec2(0.18, 0.60);
  starSeeds[16] = vec2(0.58, 0.58);
  starSeeds[17] = vec2(0.87, 0.55);

  for (int i = 0; i < 18; i++) {
    vec2 s = starSeeds[i];
    // Slight per-star brightness variation.
    float fi = float(i);
    float baseBright = 0.55 + omHash21(s + 3.17) * 0.45;

    // Individual twinkle phase so they don't pulse together.
    float phase = omHash21(s * 7.3) * TAU;
    float slowTwinkle = 0.5 + 0.5 * sin(time * 0.35 + phase);
    // Very subtle beat-tied twinkle burst on every 4th star.
    float beatMod = (mod(fi, 4.0) < 0.5) ? beatTwinkle : 0.0;

    float d = length(p - s);
    // Tight core + a tiny halo.
    float core = exp(-d * d * 9000.0) * 1.0;
    float halo = exp(-d * d *  450.0) * 0.18;
    float starI = (core + halo) * baseBright * (0.75 + 0.25 * slowTwinkle + beatMod * 0.35);

    // A whisper of high-frequency shimmer on every star when highs are present.
    starI *= 1.0 + highs * 0.20 * sin(time * 6.0 + phase * 2.0);

    accum += starI;
    twinkleOut = max(twinkleOut, slowTwinkle * step(0.001, starI));
  }

  return vec2(accum, twinkleOut);
}

// ─── Moon disc + halo ───
// Returns RGB contribution for a given screen point (moon lives in upper sky).
vec3 omMoon(vec2 p, vec2 center, float radius, vec3 tint, float brightness) {
  float d = length(p - center);
  // Hard disc with a soft edge.
  float disc = smoothstep(radius, radius * 0.92, d);
  // Tiered halo (tight, medium, wide).
  float haloTight  = exp(-d * d / (radius * radius *  4.0)) * 0.55;
  float haloMed    = exp(-d * d / (radius * radius * 18.0)) * 0.22;
  float haloWide   = exp(-d * d / (radius * radius * 80.0)) * 0.08;
  float halo = haloTight + haloMed + haloWide;

  // Gentle craters via fbm (visual texture on the disc).
  float crater = fbm3(vec3((p - center) * 18.0, 0.0)) * disc * 0.18;

  return (tint * (disc * (1.0 - crater) + halo)) * brightness;
}

// ─── Ripple field on the mirror surface ───
// Returns a vertical offset (water → small positive = pulls reflection up),
// plus a highlight term from crest curvature.
vec2 omRipple(vec2 p, float time, float amp, float onsetDrop, float coherence) {
  // Convert mirror-space p (y: 0 at shore, increasing downward into foreground)
  // to a wave-friendly domain. Horizontal wavelength varies gently across depth.
  float depth = clamp(p.y, 0.0, 1.0);

  // Base ultra-slow swell — two crossing low-freq waves.
  float w1 = sin(p.x * 9.0  + time * 0.22) * 0.5;
  float w2 = sin(p.x * 14.0 - time * 0.17 + depth * 3.0) * 0.35;
  // Fine micro-chop when coherence is high (tight still water).
  float w3 = sin(p.x * 42.0 + time * 0.55 + depth * 6.5) * 0.12 * mix(0.4, 1.0, coherence);

  float base = (w1 + w2 + w3) * amp * (0.25 + depth * 0.85);

  // "Single drop" — onsetDrop triggers a concentric ring from a fixed point.
  vec2 dropCenter = vec2(0.58, 0.25); // offset rightward, mid-depth
  float rd = length((p - dropCenter) * vec2(1.0, 1.6));
  float ringTime = time * 0.6;
  float ringPhase = rd * 18.0 - ringTime * 4.0;
  float ringEnv = exp(-rd * 5.0) * onsetDrop;
  float ring = sin(ringPhase) * ringEnv * 0.035;

  float yOffset = base * 0.022 + ring;

  // Approximate crest highlight via horizontal derivative of wave phase.
  float crest = cos(p.x * 9.0 + time * 0.22) * 9.0
              + cos(p.x * 14.0 - time * 0.17 + depth * 3.0) * 14.0;
  float highlight = smoothstep(5.0, 12.0, abs(crest)) * amp * 0.06;
  highlight += ringEnv * abs(cos(ringPhase)) * 0.25;

  return vec2(yOffset, highlight);
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 screenP = (uv - 0.5) * aspect;

  // ─── Audio clamping ───
  float energy       = clamp(uEnergy, 0.0, 1.0);
  float slowE        = clamp(uSlowEnergy, 0.0, 1.0);
  float vocal        = clamp(uVocalEnergy, 0.0, 1.0);
  float bass         = clamp(uBass, 0.0, 1.0);
  float highs        = clamp(uHighs, 0.0, 1.0);
  float coherence    = clamp(uCoherence, 0.0, 2.0);
  float onset        = clamp(uOnsetSnap, 0.0, 1.0);
  float beatConf     = smoothstep(0.3, 0.7, uBeatConfidence);
  // Exponentially decayed "beat decay" — gently fades after each beatSnap.
  float beatDecay    = uBeatSnap * beatConf;
  float chromaHue    = uChromaHue; // 0..1
  float spaceScore   = clamp(uSpaceScore, 0.0, 1.0);
  float dynRange     = clamp(uDynamicRange, 0.0, 1.0);
  float slowTime     = uDynamicTime * 0.012;

  // ─── Section modulation (space deepens stillness) ───
  float sT = uSectionType;
  float sJam   = smoothstep(4.5, 5.5, sT) * (1.0 - step(5.5, sT));
  float sSpace = smoothstep(6.5, 7.5, sT);
  // Pull energy down further in space sections.
  float stillness = 1.0 - 0.6 * sSpace - 0.5 * spaceScore;
  stillness = clamp(stillness, 0.2, 1.0);

  // ─── Master opacity (very subtle) ───
  // Almost flat — ranges from 0.92 to 1.02 only.
  float masterOpacity = 0.92 + energy * 0.10;

  // ─── Horizon line ───
  // y=0.5 in screen space (uv), which maps to screenP.y = 0.
  // Upper half (y > 0 in screenP centered coords) = sky.
  // Lower half (y < 0) = mirror.
  float horizonY = 0.0;
  // Tiny horizon dip from onset drops (water-level wobble).
  horizonY += onset * 0.002 * sin(screenP.x * 3.0);

  // ─── Cool blue base palette ───
  // Deepest blacks carry a cool blue cast. Warmth is strictly gated by chromaHue.
  vec3 coolBlack  = vec3(0.004, 0.008, 0.018);
  vec3 deepNight  = vec3(0.006, 0.011, 0.024);
  vec3 skyTop     = vec3(0.002, 0.004, 0.012);

  // ─── Moon tint: cool blue <-> warm gold phase change ───
  // chromaHue ~0..1. Map to a smooth oscillation between cool silver and warm gold.
  float moonPhase = 0.5 + 0.5 * sin(chromaHue * TAU + slowTime * 0.3);
  vec3 moonCool = vec3(0.92, 0.95, 1.00); // bluish silver
  vec3 moonWarm = vec3(1.00, 0.88, 0.66); // warm gold
  vec3 moonTint = mix(moonCool, moonWarm, moonPhase);

  // Moon position — upper left quadrant of sky, slightly offset from center.
  // Coordinates are in aspect-corrected screenP space (centered).
  vec2 moonCenter = vec2(-0.18, 0.22);
  // Extremely slow horizontal drift (like a real moon over an hour).
  moonCenter.x += sin(slowTime * 0.05) * 0.015;
  float moonRadius = 0.042;

  // Moon brightness — vocal makes the moon "listen".
  float moonBright = 0.55 + vocal * 0.55 + uClimaxPhase * 0.05;
  moonBright *= 0.92 + energy * 0.20;
  moonBright *= stillness;

  // ─── Color accumulator ───
  vec3 col;

  // Mask: are we in sky (top half) or mirror (bottom half)?
  float isSky    = step(horizonY, screenP.y);
  float isMirror = 1.0 - isSky;

  // ════════════════════════════════════════════════
  // SKY (top 50%)
  // ════════════════════════════════════════════════
  {
    // Vertical gradient — darker at zenith, slightly lifted near horizon.
    float skyGrad = smoothstep(0.5, 0.0, screenP.y);
    vec3 skyCol = mix(skyTop, deepNight, skyGrad);

    // Faintest fbm "dust lane" across the sky (almost invisible).
    float skyDust = fbm3(vec3(screenP * 2.2, slowTime * 0.08)) * 0.5 + 0.5;
    skyCol += vec3(0.003, 0.005, 0.010) * smoothstep(0.55, 0.85, skyDust);

    // Star field.
    // Use uv-space (0..1) for star sampling — matches starSeeds layout.
    // Remap: stars live in uv.y > 0.5 (upper half of frame).
    vec2 starUv = uv;
    vec2 starResult = omStar(starUv, uTime, beatDecay, highs);
    float starI = starResult.x;

    skyCol += vec3(0.85, 0.92, 1.00) * starI * 0.9;

    // Moon — placed in aspect-corrected screen space.
    skyCol += omMoon(screenP, moonCenter, moonRadius, moonTint, moonBright);

    col = mix(vec3(0.0), skyCol, isSky);
  }

  // ════════════════════════════════════════════════
  // MIRROR (bottom 50%) — reflection + ripples
  // ════════════════════════════════════════════════
  {
    // Ripple amplitude: slow-energy driven, with onset drop impact.
    float rippleAmp = 0.35 + slowE * 0.80 + dynRange * 0.15;
    rippleAmp *= stillness; // space sections flatten
    vec2 mirrorP = vec2(screenP.x, -screenP.y); // flip Y into mirror space
    // Depth coordinate: 0 at shore (horizon), 1 at foreground bottom.
    float depth = clamp(-screenP.y / 0.5, 0.0, 1.0);
    vec2 ripplePos = vec2(screenP.x, depth);
    vec2 rip = omRipple(ripplePos, uTime, rippleAmp, onset, coherence);
    float yOffset = rip.x;
    float crestHi = rip.y;

    // Reflection clarity: clearer with bass, blurrier without.
    float clarity = 0.40 + bass * 0.55 + dynRange * 0.10;
    clarity *= mix(0.75, 1.0, coherence);
    clarity = clamp(clarity, 0.25, 1.0);

    // Sample the sky by mirroring Y across the horizon, plus the ripple offset.
    // screenP.y is negative in the mirror half → mirrored y is -screenP.y.
    vec2 reflectP = vec2(screenP.x, -screenP.y + yOffset);
    // Apply horizontal wobble proportional to ripple amplitude for realism.
    reflectP.x += sin(screenP.x * 24.0 + uTime * 0.4 + depth * 6.0)
                  * rippleAmp * 0.012 * depth;

    // Re-sample sky at the mirrored point.
    vec3 reflectCol;
    {
      float skyGradR = smoothstep(0.5, 0.0, reflectP.y);
      vec3 skyColR = mix(skyTop, deepNight, skyGradR);
      float skyDustR = fbm3(vec3(reflectP * 2.2, slowTime * 0.08)) * 0.5 + 0.5;
      skyColR += vec3(0.003, 0.005, 0.010) * smoothstep(0.55, 0.85, skyDustR);

      // Mirrored star field — same seeds, mirrored uv.
      vec2 starUvR = vec2(uv.x, 1.0 - uv.y + yOffset * 0.2);
      // Add the horizontal ripple distortion to star uv, scaled by depth.
      starUvR.x += sin(starUvR.x * 22.0 + uTime * 0.35 + depth * 5.0)
                   * rippleAmp * 0.006 * depth;
      vec2 starResR = omStar(starUvR, uTime, beatDecay * 0.6, highs * 0.5);
      float starIR = starResR.x;
      // Stars in reflection are dimmer and slightly blurred by (1-clarity).
      skyColR += vec3(0.70, 0.80, 0.95) * starIR * 0.55 * clarity;

      // Mirrored moon — long reflection streak across the water.
      vec2 moonMirror = vec2(moonCenter.x, -moonCenter.y);
      skyColR += omMoon(reflectP, moonMirror, moonRadius * 0.92, moonTint, moonBright * 0.70);

      reflectCol = skyColR;
    }

    // ─── Long moon reflection streak ───
    // A vertical streak anchored directly below the moon, extending from
    // horizon into the foreground. This is the signature "lake at night" look.
    {
      float streakX = moonCenter.x;
      float dx = screenP.x - streakX;
      // Streak falloff: sharp horizontally, broken into segments by ripple.
      float streakDepth = clamp(-screenP.y, 0.0, 0.5);
      // Width grows slightly with depth (perspective spreads it).
      float streakWidth = 0.01 + streakDepth * 0.08;
      float streakH = exp(-(dx * dx) / (streakWidth * streakWidth));

      // Segmentation from ripple crests.
      float seg = 0.5 + 0.5 * sin(streakDepth * 35.0 - uTime * 0.8 + yOffset * 60.0);
      seg = smoothstep(0.15, 0.85, seg);
      // Slight irregular modulation.
      seg *= 0.6 + 0.4 * fbm3(vec3(screenP.xy * 5.0, slowTime));

      // Longitudinal falloff — brightest near horizon, fading into foreground.
      float streakLong = exp(-streakDepth * 5.0) * 1.2;
      float streakI = streakH * seg * streakLong * moonBright * 0.85;

      reflectCol += moonTint * streakI;
    }

    // Crest highlights: little bright sparkle lines where ripples curl.
    reflectCol += moonTint * crestHi * (0.25 + moonBright * 0.30);

    // Depth darkening — the foreground water is the darkest thing in frame.
    float depthDark = mix(1.0, 0.55, depth);
    reflectCol *= depthDark;

    // Cool blue bias on the mirror.
    reflectCol = mix(reflectCol, reflectCol * vec3(0.85, 0.95, 1.15), 0.35);

    // Blend with coolBlack so low-clarity sections fall toward the base.
    reflectCol = mix(coolBlack, reflectCol, clarity);

    col = mix(col, reflectCol, isMirror);
  }

  // ─── Thin mist band at the horizon line ───
  {
    float distToHorizon = abs(screenP.y - horizonY);
    float mist = exp(-distToHorizon * distToHorizon * 420.0);
    // Mist breathes with slowE.
    mist *= 0.20 + slowE * 0.25;
    vec3 mistColor = vec3(0.018, 0.026, 0.040);
    // Slight warm/cool modulation with moon phase.
    mistColor = mix(mistColor, mistColor * vec3(1.15, 1.05, 0.90), moonPhase * 0.35);
    col += mistColor * mist;
  }

  // ─── Global master opacity (very subtle) ───
  col *= masterOpacity;

  // ─── Dynamic range gate — clamp extremes to preserve stillness ───
  // The whole point is that nothing moves much. Cap any accidental overshoots.
  col = min(col, vec3(1.15));
  col = max(col, vec3(0.0));

  // ─── SDF icon emergence (very subdued here — stillness priority) ───
  {
    float nf = fbm3(vec3(screenP * 1.5, slowTime));
    vec3 c1 = moonTint * 0.6;
    vec3 c2 = vec3(0.6, 0.75, 1.0);
    col += iconEmergence(screenP, uTime, energy * 0.4, bass * 0.4, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.22;
    col += heroIconEmergence(screenP, uTime, energy * 0.5, bass * 0.5, c1, c2, nf, uSectionIndex) * 0.65;
  }

  // ─── Atmospheric depth fog (cool, very light) ───
  {
    float fogN = fbm3(vec3(screenP * 0.6, slowTime * 0.1));
    float fogD = 0.04 + (1.0 - energy) * 0.05;
    vec3 fogC = vec3(0.004, 0.008, 0.016);
    col = mix(col, fogC, fogD * (0.45 + fogN * 0.55));
  }

  // ─── Vignette (deep, draws eye to center) ───
  {
    float vigScale = 0.38;
    float vignette = 1.0 - dot(screenP * vigScale, screenP * vigScale);
    vignette = smoothstep(0.0, 1.0, vignette);
    col = mix(coolBlack, col, vignette);
  }

  // ─── Post-processing (bloom off, halation off, CA off) ───
  col = applyTemperature(col);
  col = applyPostProcess(col, vUv, screenP);

  gl_FragColor = vec4(col, 1.0);
}
`;
