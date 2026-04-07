/**
 * St. Stephen Electric Storm — thunderhead clouds with internal lightning.
 * Based on Protean Clouds engine (nimitz, Shadertoy view/3l23Rh, CC BY-NC-SA 3.0)
 *
 * Massive thunderhead clouds with internal illumination from lightning.
 * Electric, aggressive, powerful. Camera embedded in the storm.
 * At peak: whole volume strobing with internal light, electrified.
 *
 * Audio reactivity:
 *   uOnsetSnap       -> lightning flashes INSIDE the volume (bright cores)
 *   uEnergy          -> cloud roil speed (builds as song builds)
 *   uStemDrumOnset   -> secondary lightning triggers
 *   uBass            -> thunder rumble (low-frequency density wobble)
 *   uSlowEnergy      -> base cloud movement speed
 *   uSpectralFlux    -> electrical agitation of the cloud mass
 *   uImprovisationScore -> adds chaotic lightning forks
 *   uPalettePrimary  -> cloud tint
 *   uPaletteSecondary -> lightning color
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const stStephenLightningVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const postProcess = buildPostProcessGLSL({
  grainStrength: "normal",
  halationEnabled: true,
  bloomEnabled: true,
  bloomThresholdOffset: -0.12,
  caEnabled: true,
  dofEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: false,
  beatPulseEnabled: true,
  eraGradingEnabled: true,
});

export const stStephenLightningFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

#define PI 3.14159265

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _ss_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _ss_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _ss_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

// Thunderhead displacement — aggressive, churning rotation
vec2 _ss_disp(float t) {
  return vec2(sin(t * 0.18) * 1.8, cos(t * 0.14) * 1.4) * 1.8;
}

// Thunderhead density — MASSIVE, roiling, turbulent
vec2 _ss_map(vec3 p, float prm, float bassRumble) {
  vec3 p2 = p;
  p2.xy -= _ss_disp(p.z).xy;

  // Aggressive rotation — churning thunderhead
  p.xy *= _ss_rot(sin(p.z * 0.4 + uTime * 0.08) * 0.12 + uTime * 0.06);

  float cl = dot(p2.xy, p2.xy);
  float d = 0.0;
  p *= 0.58;
  float z = 1.0;
  float trk = 1.0;

  // High turbulence — electric, roiling
  float dspAmp = 0.18 + prm * 0.15;
  // Bass rumble distorts the density field
  dspAmp += bassRumble * 0.12;

  for (int i = 0; i < 5; i++) {
    p += sin(p.zxy * 0.8 * trk + uTime * trk * 0.6) * dspAmp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.58;
    trk *= 1.45;
    p = p * _ss_m3;
  }

  d = abs(d + prm * 3.2) + prm * 0.35 - 2.3;
  return vec2(d + cl * 0.18 + 0.22, cl);
}

// Lightning bolt positions — seeded by time, triggered by onsets
// Returns an array of up to 4 lightning point light positions
// Each position is a 3D point inside the cloud volume
vec3 lightningPos(int index, float time, float trigger) {
  float seed = float(index) * 73.156;
  float phase = fract(sin(seed + floor(time * 4.0 + trigger * 2.0)) * 43758.5);
  float phase2 = fract(sin(seed * 1.3 + floor(time * 3.0 + trigger)) * 21345.6);
  float phase3 = fract(sin(seed * 2.7 + floor(time * 5.0)) * 67890.1);

  // Scatter lightning positions throughout the volume
  vec3 pos = vec3(
    (phase - 0.5) * 4.0,
    (phase2 - 0.5) * 3.0,
    time + (phase3 - 0.5) * 6.0
  );
  return pos;
}

// Lightning flash envelope — sharp attack, medium decay
float lightningFlash(float trigger, float time, int index) {
  float seed = float(index) * 47.3;
  // Quantize time to create discrete flash events
  float flashTime = floor(time * 3.0 + trigger * 5.0 + seed) * 0.333;
  float dt = time - flashTime;

  // Sharp attack (2ms), medium decay (150ms)
  float env = exp(-dt * 8.0) * step(0.0, dt) * step(dt, 0.5);
  // Only flash when trigger is active
  env *= smoothstep(0.1, 0.3, trigger);

  // Add secondary strobe at high energy
  float strobe = exp(-fract(time * 6.0 + seed * 0.1) * 4.0) * 0.3;
  env += strobe * smoothstep(0.5, 0.8, trigger);

  return env;
}

vec4 _ss_render(vec3 ro, vec3 rd, float time, float prm, float energy,
                float bassRumble, float onsetFlash, float drumFlash) {
  vec4 rez = vec4(0);
  const float ldst = 8.0;
  vec3 lpos = vec3(_ss_disp(time + ldst) * 0.5, time + ldst);
  float t = 1.0;
  float fogT = 0.0;

  // More steps for denser thunderheads
  int maxSteps = 70 + int(energy * 50.0);

  // Combined lightning trigger intensity
  float lightningTrigger = max(onsetFlash, drumFlash * 0.8);

  // Pre-compute 4 lightning positions
  vec3 lp0 = lightningPos(0, time, onsetFlash);
  vec3 lp1 = lightningPos(1, time, drumFlash);
  vec3 lp2 = lightningPos(2, time, onsetFlash + drumFlash);
  vec3 lp3 = lightningPos(3, time, onsetFlash * 2.0);

  // Pre-compute flash envelopes
  float fl0 = lightningFlash(onsetFlash, time, 0);
  float fl1 = lightningFlash(drumFlash, time, 1);
  float fl2 = lightningFlash(max(onsetFlash, drumFlash), time, 2);
  float fl3 = lightningFlash(onsetFlash * energy, time, 3);

  for (int i = 0; i < 120; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.99) break;

    vec3 pos = ro + t * rd;
    vec2 mpv = _ss_map(pos, prm, bassRumble);
    float den = clamp(mpv.x - 0.3, 0.0, 1.0) * 1.15;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    vec4 col = vec4(0);
    if (mpv.x > 0.6) {
      // === THUNDERHEAD COLORS: deep purple, charcoal ===
      vec3 thunderBase = vec3(0.15, 0.12, 0.22); // deep purple-charcoal
      vec3 thunderDeep = vec3(0.08, 0.06, 0.14); // near-black purple
      float depthT = smoothstep(0.5, 3.0, t);
      vec3 cloudColor = mix(thunderBase, thunderDeep, depthT * 0.6);

      col = vec4(
        cloudColor + sin(vec3(0.3, 0.2, 0.6) + mpv.y * 0.06) * 0.05,
        0.09
      );
      col *= den * den * den;
      col.rgb *= _ss_linstep(4.0, -2.5, mpv.x) * 2.2;

      // Differential lighting
      float dif = clamp((den - _ss_map(pos + 0.8, prm, bassRumble).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _ss_map(pos + 0.35, prm, bassRumble).x) / 2.5, 0.001, 1.0);

      // Dark ambient — the storm is lit primarily by lightning
      vec3 ambient = vec3(0.005, 0.004, 0.01);
      vec3 diffLight = vec3(0.015, 0.012, 0.03) * dif;
      col.xyz *= den * (ambient + diffLight * 1.3);

      // === INTERNAL LIGHTNING ILLUMINATION ===
      // Each lightning point illuminates the cloud from WITHIN
      // The key effect: dense cloud interiors glow when lightning strikes nearby

      // Lightning point 0: electric blue-white (primary, onset-driven)
      {
        float dist = length(pos - lp0);
        float atten = 1.0 / (1.0 + dist * dist * 0.3);
        vec3 lightColor = vec3(0.7, 0.75, 1.0); // electric blue-white
        float illum = atten * fl0 * den * 3.0;
        col.rgb += lightColor * illum;
      }

      // Lightning point 1: violet (drum-driven)
      {
        float dist = length(pos - lp1);
        float atten = 1.0 / (1.0 + dist * dist * 0.4);
        vec3 lightColor = vec3(0.6, 0.4, 1.0); // electric violet
        float illum = atten * fl1 * den * 2.5;
        col.rgb += lightColor * illum;
      }

      // Lightning point 2: pure white (combined trigger)
      {
        float dist = length(pos - lp2);
        float atten = 1.0 / (1.0 + dist * dist * 0.35);
        vec3 lightColor = vec3(0.9, 0.92, 1.0); // bright white
        float illum = atten * fl2 * den * 2.0;
        col.rgb += lightColor * illum;
      }

      // Lightning point 3: blue-cyan (energy-gated)
      {
        float dist = length(pos - lp3);
        float atten = 1.0 / (1.0 + dist * dist * 0.5);
        vec3 lightColor = vec3(0.4, 0.7, 1.0); // blue-cyan
        float illum = atten * fl3 * den * 1.8 * energy;
        col.rgb += lightColor * illum;
      }

      // === BASS DENSITY WOBBLE: thunder rumble ===
      // Low-frequency sine wobble on density during bass hits
      float rumble = sin(pos.y * 2.0 + pos.z * 1.5 + uTime * 0.5) * bassRumble * 0.15;
      col.rgb *= 1.0 + rumble;
    }

    // Dark purple fog
    float fogC = exp(t * 0.2 - 2.2);
    col.rgba += vec4(0.03, 0.02, 0.06, 0.1) * clamp(fogC - fogT, 0.0, 1.0);
    fogT = fogC;

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.08, 0.28);
  }
  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _ss_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _ss_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_ss_getsat(ic) - mix(_ss_getsat(a), _ss_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

// Screen-space lightning bolt branching overlay
float lightningBranch(vec2 p, float time, float seed) {
  // Vertical bolt with horizontal jitter
  float x = p.x + seed * 2.0 - 1.0;
  float segY = floor(p.y * 8.0);
  float jitter = fract(sin(segY * 127.1 + seed * 311.7 + floor(time * 3.0) * 43.3) * 43758.5) - 0.5;
  x += jitter * 0.15;

  // Bolt width narrows with distance from center
  float bolt = exp(-abs(x) * 80.0);
  // Branch probability
  float branchSeed = fract(sin(segY * 47.3 + seed * 93.1) * 12345.6);
  if (branchSeed > 0.7) {
    float bx = x + (branchSeed - 0.7) * 3.0 * sign(jitter);
    bolt += exp(-abs(bx) * 60.0) * 0.5;
  }
  return bolt;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float slowE = clamp(uSlowEnergy, 0.0, 1.0);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uStemDrumOnset, 0.0, 1.0);
  float spectralFlux = clamp(uSpectralFlux, 0.0, 1.0);
  float improv = clamp(uImprovisationScore, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * clamp(uClimaxIntensity, 0.0, 1.0);

  // Section-type gates
  float sectionT = uSectionType;
  float sJam = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT));
  float sSpace = smoothstep(6.5, 7.5, sectionT);
  float sSolo = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT));

  // Energy drives cloud roil speed
  float timeScale = 2.0 + energy * 3.0 + sJam * 1.5;
  float time = uDynamicTime * timeScale;

  // === CAMERA: embedded inside the storm, looking into swirling thunder ===
  vec3 ro = vec3(0.0, 0.0, time);
  // Shake with energy — the storm is alive
  ro += vec3(
    sin(uTime * 1.5) * energy * 0.3,
    cos(uTime * 1.2) * energy * 0.15,
    0.0
  );
  float dspAmp = 0.8;
  ro.xy += _ss_disp(ro.z) * dspAmp;

  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_ss_disp(time + tgtDst) * dspAmp, time + tgtDst));
  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((p.x * rightdir + p.y * updir) * 1.0 - target);
  rd.xy *= _ss_rot(-_ss_disp(time + 3.5).x * 0.2);

  // === PROTEAN PARAMETERS ===
  float prm = smoothstep(-0.4, 0.4, sin(uTime * 0.25));
  // Dense thunderheads
  prm += 0.3;
  prm += bass * 0.2; // bass thickens
  prm += energy * 0.2; // energy builds density
  prm += spectralFlux * 0.1; // flux agitates
  // Jams: more aggressive roil
  prm += sJam * 0.25;
  // Space: thin out slightly
  prm -= sSpace * 0.2;
  // Climax: extreme density for maximum lightning contrast
  prm += climaxBoost * 0.15;

  float bassRumble = bass * (0.5 + energy * 0.5);

  vec4 scn = _ss_render(ro, rd, time, prm, energy, bassRumble, onsetSnap, drumOnset);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend (nimitz)
  col = _ss_iLerp(col.bgr, col.rgb, clamp(1.0 - prm, 0.05, 1.0));

  // === PALETTE TINTING: deep purple/charcoal ===
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(hue1, 0.85, 0.85);
  vec3 palCol2 = paletteHueColor(hue2, 0.85, 0.85);
  float palMix = 0.10 + energy * 0.08;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.12) * 0.5 + 0.5), palMix);

  // === SCREEN-SPACE LIGHTNING BOLTS ===
  // Visible bolt overlay on top of volumetric (at high energy / climax)
  float boltIntensity = onsetSnap * energy * 0.6 + drumOnset * energy * 0.3 + climaxBoost * 0.4;
  if (boltIntensity > 0.05) {
    // Up to 3 simultaneous bolts
    float bolt1 = lightningBranch(p, uDynamicTime * 4.0, 0.3) * lightningFlash(onsetSnap, uDynamicTime, 0);
    float bolt2 = lightningBranch(p, uDynamicTime * 3.5, 0.7) * lightningFlash(drumOnset, uDynamicTime, 1);
    float bolt3 = lightningBranch(p, uDynamicTime * 5.0, 0.5) * lightningFlash(max(onsetSnap, drumOnset), uDynamicTime, 2);

    float totalBolt = bolt1 + bolt2 * 0.7 + bolt3 * 0.5 * energy;

    // Electric blue-white bolt color with violet fringes
    vec3 boltCore = vec3(0.85, 0.9, 1.0); // blue-white
    vec3 boltFringe = vec3(0.5, 0.3, 1.0); // violet fringe
    vec3 boltColor = mix(boltFringe, boltCore, smoothstep(0.0, 0.5, totalBolt));

    col += boltColor * totalBolt * boltIntensity;
  }

  // === GLOBAL LIGHTNING FLASH ===
  // Full-screen flash on strong onsets — illuminates everything
  float globalFlash = onsetSnap * onsetSnap * 0.15 * energy;
  globalFlash += drumOnset * drumOnset * 0.08 * energy;
  col += vec3(0.6, 0.65, 0.9) * globalFlash;

  // === SKY: dark storm gradient ===
  float skyGrad = smoothstep(-0.3, 0.4, rd.y);
  vec3 skyDark = vec3(0.03, 0.02, 0.06); // near-black purple
  vec3 skyMid = vec3(0.08, 0.06, 0.14); // deep purple
  vec3 skyColor = mix(skyDark, skyMid, skyGrad);
  col = mix(skyColor, col, scn.a);

  // === SPECTRAL FLUX: electrical agitation ===
  // High flux adds violet shimmer on cloud edges
  float fluxShimmer = spectralFlux * fbm3(vec3(p * 4.0, uDynamicTime * 0.5)) * 0.06;
  col += vec3(0.4, 0.2, 0.8) * fluxShimmer * energy;

  // === IMPROVISATION: chaotic color shifts ===
  if (improv > 0.3) {
    vec3 chaosShift = vec3(
      sin(uTime * 2.3) * 0.03,
      sin(uTime * 3.1) * 0.02,
      sin(uTime * 1.7) * 0.04
    ) * improv;
    col += chaosShift * energy;
  }

  // Gamma: slightly lifted shadows for purple visibility
  col = pow(col, vec3(0.58, 0.62, 0.55)) * vec3(0.95, 0.93, 1.05);

  // Tight vignette — immersed in the storm
  vec2 q = vUv;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.1) * 0.7 + 0.3;

  // Beat pulse — punchy for St. Stephen's driving rhythm
  col *= 1.0 + uBeatSnap * 0.15 * (1.0 + climaxBoost * 0.4);

  // === AT PEAK: whole volume strobing, electrified ===
  if (climaxBoost > 0.3) {
    // Rapid strobe at climax
    float strobe = sin(uDynamicTime * 20.0) * 0.5 + 0.5;
    strobe = pow(strobe, 3.0); // sharp peaks
    col += vec3(0.5, 0.55, 0.8) * strobe * climaxBoost * 0.2;
  }

  // Chroma hue modulation
  if (abs(uChromaHue) > 0.01) {
    vec3 hsvCol = rgb2hsv(col);
    hsvCol.x = fract(hsvCol.x + uChromaHue * 0.1);
    col = hsv2rgb(hsvCol);
  }

  // === DEAD ICONOGRAPHY ===
  float _nf = snoise(vec3(p * 2.0, uTime * 0.1));
  col += iconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uClimaxPhase, uSectionIndex);
  col += heroIconEmergence(p, uTime, energy, bass, palCol1, palCol2, _nf, uSectionIndex);

  // Semantic: aggressive / chaotic boost electric intensity
  col *= 1.0 + uSemanticAggressive * 0.12 + uSemanticChaotic * 0.08;

  // === POST PROCESS ===
  col = applyPostProcess(col, uv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
