/**
 * Firelit Room — raymarched intimate cabin interior with hearth fire.
 *
 * The audit identified an "intimate acoustic passages" gap: deep_ocean
 * covers quiet-cosmic well, but no shader places the viewer in a
 * human-scale warm space. Campfire exists but reads as cartoon-ish.
 *
 * This is the place. A small wood-walled room with a stone hearth on
 * one side, fire glow as the key light, deep amber shadows, and a
 * cool window-fill on the opposite wall. Used during Friend of the
 * Devil, Brokedown Palace, Peggy-O, Stella Blue, Wharf Rat, Ripple,
 * Black Peter, Box of Rain — songs that want intimacy + warmth.
 *
 * Audio reactivity (12 uniforms):
 *   uEnergy           → fire intensity, light reach across the room
 *   uVocalEnergy      → fire crackle / warmth swell when Garcia sings
 *   uBass             → low rumble in floor + wall flicker
 *   uHarmonicTension  → wall darkness shift (tension = darker corners)
 *   uVocalPresence    → spotlit center of room when vocals lead
 *   uBeatSnap         → spark pulses from hearth on beat
 *   uChordIndex       → wood color tint (warm chord families)
 *   uSlowEnergy       → camera drift speed across the room
 *   uShaderHoldProgress → camera path evolution (sweep right then back)
 *   uMelodicPitch     → window light brightness (vocal pitch lifts moonlight)
 *   uCentroid         → ember sparkle density (high freq → sparks)
 *   uDynamicRange     → contrast between fire-warm and shadow-cool
 *
 * Architectural raymarch with three SDFs:
 *   floor + back wall + side wall (box-stack)
 *   stone hearth (rounded rectangle on left wall)
 *   window aperture (cold-light cutout in right wall)
 *
 * Lighting model: dual-source — warm fire (point light at hearth center)
 * + cool window (directional from right). Fresnel rim. AO via repeated
 * SDF queries. No global illumination — direct + ambient floor.
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";
import { buildRaymarchNormal, buildDepthAlphaOutput } from "./shared/raymarching.glsl";
import { lightingGLSL } from "./shared/lighting.glsl";

export const firelitRoomVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const postProcess = buildPostProcessGLSL({
  bloomEnabled: true,
  bloomThresholdOffset: -0.06,   // bloom comes in earlier — fire glow is the point
  caEnabled: false,              // no chromatic aberration — clean intimate look
  dofEnabled: false,             // shallow DOF would feel digital; this is film
  eraGradingEnabled: true,
  halationEnabled: true,         // halation around fire = film-warm
  grainStrength: "normal",
  lightLeakEnabled: true,
  lensDistortionEnabled: false,
  beatPulseEnabled: false,
});
const frNormal = buildRaymarchNormal("frMap($P, fr, energy, bass)", { eps: 0.002, name: "frCalcNormal" });
const frDepthAlpha = buildDepthAlphaOutput("td", "10.0");

export const firelitRoomFrag = /* glsl */ `
precision highp float;
${sharedUniformsGLSL}
${noiseGLSL}
${lightingGLSL}
${postProcess}
varying vec2 vUv;
#define TAU 6.28318530

// Rounded box SDF (Inigo Quilez canonical)
float frBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// Room SDF: viewer is at origin facing +Z. Walls face inward.
//   floor  at y = -1.6  (eye height ~ 0)
//   ceiling at y = +1.4 (low — intimate cabin)
//   back wall at z = +3.5
//   left wall at x = -2.5 (hearth side)
//   right wall at x = +2.5 (window side)
//   no front wall — viewer's back
float frMap(vec3 p, float fr, float energy, float bass) {
  // Floor (slight wood-plank bumpiness via fbm later in shading; SDF stays flat)
  float floor_d = p.y + 1.6;
  // Ceiling
  float ceil_d = 1.4 - p.y;
  // Back wall
  float back_d = 3.5 - p.z;
  // Left wall (with hearth cavity carved in)
  float left_d = p.x + 2.5;
  // Right wall (with window cutout)
  float right_d = 2.5 - p.x;

  // Hearth cavity — carve a rounded rectangle out of the left wall
  // Centered at x=-2.5, y=-0.8, z=2.0 (mid-room depth, low on wall)
  vec3 hp = p - vec3(-2.5, -0.8, 2.0);
  // Slight breathing on bass — stone "heaves" subtly on low notes
  float heave = bass * 0.04;
  float hearth = frBox(hp, vec3(0.05, 0.7 + heave, 0.9), 0.15);
  // Carve: max(wall, -cavity) creates an opening
  left_d = max(left_d, -hearth);

  // Window cutout — rectangular opening in right wall, upper portion
  vec3 wp = p - vec3(2.5, 0.2, 1.5);
  float window_open = frBox(wp, vec3(0.05, 0.5, 0.4), 0.05);
  right_d = max(right_d, -window_open);

  // Mantel — horizontal beam above the hearth
  vec3 mp = p - vec3(-2.3, 0.05, 2.0);
  float mantel = frBox(mp, vec3(0.18, 0.06, 1.0), 0.02);

  // Hearth interior — visible glowing volume (will get emissive treatment in shading)
  vec3 hip = p - vec3(-2.3, -0.8, 2.0);
  float hearth_interior = frBox(hip, vec3(0.18, 0.55, 0.78), 0.08);

  // Result: union of floor, ceiling, back/left/right walls, mantel; subtract hearth opening
  float room = min(floor_d, ceil_d);
  room = min(room, back_d);
  room = min(room, left_d);
  room = min(room, right_d);
  room = min(room, mantel);
  // Hearth interior treated as a separate object (negative inside, returned for emissive)
  // Here we use min so the raymarch hits it; shading branches on whether we're inside.
  return min(room, hearth_interior);
}

${frNormal}

void main() {
  vec2 uv = vUv;
  vec2 asp = vec2(uResolution.x/uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * asp;

  // Audio uniforms
  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float vocalE = clamp(uVocalEnergy, 0.0, 1.0);
  float vocalP = clamp(uVocalPresence, 0.0, 1.0);
  float beatS = clamp(uBeatSnap, 0.0, 1.0);
  float harmT = clamp(uHarmonicTension, 0.0, 1.0);
  float melP = clamp(uMelodicPitch, 0.0, 1.0);
  float centroid = clamp(uCentroid, 0.0, 1.0);
  float dynR = clamp(uDynamicRange, 0.0, 1.0);
  int chordIdx = int(uChordIndex);

  // Time evolution — slow drift across the room over the song
  float fr = uDynamicTime * (0.015 + slowE * 0.05);
  float holdP = clamp(uShaderHoldProgress, 0.0, 1.0);

  // Camera path: starts looking at hearth (left), drifts toward center
  // over the first 70% of the hold, then settles. Slow pan, no shake.
  float panT = smoothstep(0.0, 0.7, holdP);
  vec3 ro = vec3(
    -1.4 + panT * 1.0,        // x: -1.4 (looking left) → -0.4 (centered)
    -0.2 + sin(fr * 0.08) * 0.04, // y: subtle breath
    0.0
  );
  vec3 lookAt = vec3(
    -1.6 + panT * 1.4,        // shift gaze with camera
    -0.4,
    2.5
  );
  vec3 fw = normalize(lookAt - ro);
  vec3 ri = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 up = cross(fw, ri);
  float fov = 0.92;
  vec3 rd = normalize(p.x * ri + p.y * up + fov * fw);

  // Raymarch
  float td = 0.0;
  vec3 hp = ro;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    vec3 ps = ro + rd * td;
    float d = frMap(ps, fr, energy, bass);
    if (d < 0.003) { hp = ps; hit = true; break; }
    if (td > 10.0) break;
    td += d * 0.85;
  }

  // ─── Palette ───
  // Fire warmth: deep amber base, bright orange-red flame, gold highlights
  vec3 fireWarm = vec3(1.0, 0.55, 0.20);          // direct flame color
  vec3 emberGlow = vec3(1.0, 0.30, 0.08);         // deep ember
  vec3 woodTone = vec3(0.32, 0.18, 0.10);         // warm wood
  vec3 stoneTone = vec3(0.22, 0.18, 0.16);        // hearth stone
  // Window cool: pale blue-silver moonlight
  vec3 moonCool = vec3(0.45, 0.60, 0.85);

  // Chord-based wood tint shift — warm chord families pull wood toward amber,
  // cool chords toward umber.
  float chordWarm = sin(float(chordIdx) * 0.523 + 0.5) * 0.5 + 0.5;
  woodTone = mix(woodTone * vec3(0.9, 0.85, 0.95), woodTone * vec3(1.1, 1.0, 0.85), chordWarm);

  vec3 col;
  if (hit) {
    vec3 n = frCalcNormal(hp);

    // Identify which surface we hit. Hearth interior position & normal.
    vec3 hearthCenter = vec3(-2.3, -0.8, 2.0);
    float distFromHearth = length(hp - hearthCenter);
    float isHearth = step(distFromHearth, 1.1);  // inside ~1.1 units of hearth

    vec3 surfaceColor;
    float emissive = 0.0;

    if (isHearth > 0.5) {
      // Interior of hearth — emissive glowing cavity
      // Flickering fire pattern via FBM noise
      float fireFlicker = fbm3(hp * 4.0 + vec3(fr * 2.5, fr * 1.8, fr * 3.2));
      fireFlicker = smoothstep(0.2, 0.9, fireFlicker);
      // Audio-reactive flame intensity: vocals → swell, beats → crackle
      float flameIntensity = 0.55 + vocalE * 0.35 + beatS * 0.18 + bass * 0.12;
      vec3 flameColor = mix(emberGlow, fireWarm, fireFlicker);
      // Bright core, dim edges
      float coreFalloff = 1.0 - smoothstep(0.0, 1.0, distFromHearth);
      surfaceColor = flameColor * flameIntensity * coreFalloff;
      emissive = 1.0 + vocalE * 0.6;  // strongly emissive
    } else {
      // Wall / floor / ceiling — wood with subtle grain
      // Determine which surface via normal direction
      float isFloor = step(0.7, n.y);
      float isCeil = step(0.7, -n.y);
      float isLeft = step(0.7, n.x);
      float isRight = step(0.7, -n.x);
      // Wood plank pattern — vertical stripes for walls, parallel for floor
      vec2 woodUV = (isFloor > 0.5 || isCeil > 0.5)
        ? vec2(hp.x * 0.8, hp.z * 1.2)
        : vec2(hp.y * 1.5, hp.z * 0.8);
      float plank = step(0.5, fract(woodUV.y * 2.0));
      // Warm grain via FBM
      float grain = fbm3(vec3(woodUV * 8.0, 0.0));
      vec3 plankBase = mix(woodTone * 0.85, woodTone, plank);
      surfaceColor = plankBase * (0.7 + grain * 0.3);

      // Hearth stone (the surrounding wall around the cavity)
      // If we're on the left wall close to hearth, use stone color
      if (isLeft > 0.5 && distFromHearth < 1.6 && distFromHearth > 1.05) {
        // Stone with rough fbm
        float stoneRough = fbm3(hp * 6.0);
        surfaceColor = stoneTone * (0.65 + stoneRough * 0.35);
      }
    }

    // ─── Lighting ───

    // Warm fire as point light at hearth center
    vec3 firePos = vec3(-2.3, -0.6, 2.0);
    vec3 fireLightDir = normalize(firePos - hp);
    float fireDist = length(firePos - hp);
    // Audio-reactive flicker
    float flicker = 0.85 + 0.15 * sin(fr * 18.0 + hp.y * 4.0) * (1.0 - vocalE * 0.3);
    flicker += beatS * 0.20;
    // Inverse-square falloff with audio-reactive reach
    float fireReach = 4.0 + energy * 1.5 + vocalE * 1.0;
    float fireFalloff = fireReach / (1.0 + fireDist * fireDist * 1.4);
    float fireDiffuse = max(dot(n, fireLightDir), 0.0);
    vec3 fireContribution = fireWarm * fireDiffuse * fireFalloff * flicker;

    // Cool window fill (directional, from +X)
    vec3 windowDir = normalize(vec3(1.0, 0.3, -0.4));
    // Window light strength: melodic pitch lifts moonlight (vocal pitch climbing → brighter window)
    float windowStrength = 0.18 + melP * 0.12 + dynR * 0.08;
    float windowDiffuse = max(dot(n, windowDir), 0.0);
    vec3 windowContribution = moonCool * windowDiffuse * windowStrength;

    // Ambient floor — never pure black, warm baseline
    float ambient = 0.04 + harmT * 0.03;  // tension darkens corners
    vec3 ambientLight = mix(emberGlow, woodTone, 0.5) * ambient;

    // Fresnel rim — subtle warm rim on edges
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 rimLight = fireWarm * fresnel * 0.12 * (0.6 + vocalP * 0.4);

    // AO — quick 3-tap query
    float ao = 1.0;
    for (int j = 1; j < 4; j++) {
      float aoStep = float(j) * 0.12;
      float aoD = frMap(hp + n * aoStep, fr, energy, bass);
      ao -= (aoStep - aoD) * (0.4 / float(j));
    }
    ao = clamp(ao, 0.18, 1.0);

    // Compose
    if (isHearth > 0.5) {
      // Emissive surface — direct color, modest lighting, AO doesn't apply
      col = surfaceColor + fireContribution * 0.3;
    } else {
      col = surfaceColor * (ambientLight + fireContribution + windowContribution) * ao;
      col += rimLight;
    }

    // Energy widens dynamic range
    col *= 0.7 + energy * 0.5;

    // Depth fog — distant surfaces gather warm-orange haze (smoke from hearth)
    float depthFade = clamp(td / 9.0, 0.0, 1.0);
    col = mix(col, fireWarm * 0.05, depthFade * depthFade * 0.4);

  } else {
    // Sky/void miss — open ceiling shaft (rare, only if camera tilts up). Fall back to dim warm.
    col = mix(emberGlow, woodTone, 0.4) * 0.04;
  }

  // ─── Volumetric fire glow ───
  // March through the room from camera, accumulating warm haze around fire.
  // Spectral centroid drives ember sparkle density (high freq → more sparks).
  vec3 firePos2 = vec3(-2.3, -0.6, 2.0);
  float vol = 0.0;
  for (int g = 0; g < 8; g++) {
    float gt = 0.5 + float(g) * 1.0;
    if (gt > td && hit) break;
    vec3 gp = ro + rd * gt;
    float distToFire = length(firePos2 - gp);
    // Inverse falloff
    float glow = exp(-distToFire * 0.7);
    // Audio-driven shimmer
    float shimmer = fbm3(gp * 2.0 + vec3(fr * 3.0)) * 0.5 + 0.5;
    vol += glow * shimmer * 0.025 * (0.5 + vocalE * 0.4 + beatS * 0.2);
  }
  col += fireWarm * vol;

  // Beat-sync sparks — small bright dots near hearth on beat
  if (beatS > 0.05) {
    vec3 sparkBase = vec3(-2.3, -0.6, 2.0);
    for (int s = 0; s < 4; s++) {
      float sf = float(s);
      vec3 sparkPos = sparkBase + vec3(
        sin(fr * 12.0 + sf * 1.7) * 0.4,
        0.3 + sf * 0.12 + sin(fr * 8.0 + sf) * 0.15,
        cos(fr * 10.0 + sf * 2.3) * 0.6
      );
      // Project spark to view
      vec3 toSpark = sparkPos - ro;
      float fwdDist = dot(toSpark, fw);
      if (fwdDist < 0.3 || fwdDist > 8.0) continue;
      vec3 projP = toSpark / fwdDist;
      float dx = dot(projP, ri) / fov;
      float dy = dot(projP, up) / fov;
      vec2 sparkScreen = vec2(dx, dy) * vec2(asp.y / asp.x, 1.0);
      float sd = length(p - sparkScreen);
      // Hot orange spark, audio-reactive intensity
      float sparkBright = exp(-sd * sd * (1500.0 - centroid * 400.0)) * beatS * (0.6 + centroid * 0.5);
      col += vec3(1.2, 0.7, 0.3) * sparkBright;
    }
  }

  // Warm shadow floor — never pure black (intimate spaces have ember reflection)
  col = max(col, vec3(0.025, 0.014, 0.008));

  // Beat pulse on overall brightness
  col *= 1.0 + beatS * 0.06;

  // Shared color temperature for crossfade continuity
  col = applyTemperature(col);
  col = applyPostProcess(col, uv, p);
  gl_FragColor = vec4(col, 1.0);
  ${frDepthAlpha}
}
`;
