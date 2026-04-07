/**
 * Fire on the Mountain Smoke — rising smoke column with ember glow.
 * Protean Clouds engine (nimitz, CC BY-NC-SA 3.0) with strong upward
 * velocity, emissive hot cores, and explosive burst dynamics.
 * Camera looks upward through churning smoke. Aggressive and dangerous.
 *
 * Audio reactivity:
 *   uBass            -> upward velocity (bass pulses shoot smoke upward)
 *   uOnsetSnap       -> burst eruptions in density (sudden thick clouds)
 *   uStemDrumOnset   -> explosion bursts from below
 *   uEnergy          -> overall intensity, ember brightness
 *   uClimaxIntensity -> entire frame engulfed, maximum ember glow
 *   uHighs           -> fine ember sparkle particles
 *   uDynamicRange    -> contrast between dark smoke and bright cores
 *   uTempoDerivative -> accelerating = smoke surges faster
 *   uBeatStability   -> stable groove = rhythmic pulsation in column
 *   uSemanticAggressive -> amplifies violence and chaos
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const fireMountainSmokeVert = /* glsl */ `
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
  bloomThresholdOffset: -0.2,
  caEnabled: true,
  lensDistortionEnabled: true,
  lightLeakEnabled: true,
  thermalShimmerEnabled: true,
  eraGradingEnabled: true,
});

export const fireMountainSmokeFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${postProcess}

varying vec2 vUv;

// ─── Protean Clouds core (nimitz) ───
// https://www.shadertoy.com/view/3l23Rh — CC BY-NC-SA 3.0

mat2 _fms_rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

const mat3 _fms_m3 = mat3(
  0.33338, 0.56034, -0.71817,
  -0.87887, 0.32651, -0.15323,
  0.15162, 0.69596, 0.61339
) * 1.93;

float _fms_mag2(vec2 p) { return dot(p, p); }

float _fms_linstep(float mn, float mx, float x) {
  return clamp((x - mn) / (mx - mn), 0.0, 1.0);
}

float _fms_prm1 = 0.0;
vec2  _fms_bsMo = vec2(0);

// Displacement — vertical column with lateral turbulence
vec2 _fms_disp(float t) {
  return vec2(sin(t * 0.3) * 0.6, cos(t * 0.22) * 0.3) * 1.5;
}

// Density function — Protean turbulence with upward bias and ember injection
vec2 _fms_map(vec3 p, float bassVel, float burstAmt) {
  vec3 p2 = p;
  p2.xy -= _fms_disp(p.z).xy;

  // Rising rotation — smoke spiraling upward
  float rotAmount = 0.15 + _fms_prm1 * 0.08 + bassVel * 0.1;
  p.xy *= _fms_rot(sin(p.z * 0.8 + p.y * 0.3) * rotAmount + uTime * 0.12);
  float cl = _fms_mag2(p2.xy);
  float d = 0.0;
  p *= 0.61;
  float z = 1.0;
  float trk = 1.0;
  float dspAmp = 0.12 + _fms_prm1 * 0.25;

  // Bass drives upward turbulence
  dspAmp += bassVel * 0.2;
  // Burst eruptions add sudden density distortion
  dspAmp += burstAmt * 0.4;

  for (int i = 0; i < 5; i++) {
    // Upward bias in displacement — y component always pushes up
    vec3 disp = sin(p.zxy * 0.75 * trk + uTime * trk * 0.6) * dspAmp;
    disp.y = abs(disp.y) * 0.5 + disp.y * 0.5; // bias upward
    p += disp;
    d -= abs(dot(cos(p), sin(p.yzx)) * z);
    z *= 0.57;
    trk *= 1.4;
    p = p * _fms_m3;
  }
  d = abs(d + _fms_prm1 * 3.0) + _fms_prm1 * 0.3 - 2.5 + _fms_bsMo.y;
  return vec2(d + cl * 0.2 + 0.25, cl);
}

// Ember particles — hot bright sparks floating in the column
vec3 _fms_embers(vec3 pos, float energy, float highs) {
  vec3 embers = vec3(0.0);
  // Hash-based ember positions
  vec3 cell = floor(pos * 4.0);
  vec3 frac = fract(pos * 4.0);

  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  if (h > 0.88) {
    vec3 emberPos = vec3(
      fract(sin(dot(cell + 1.0, vec3(269.5, 183.3, 246.1))) * 43758.5453),
      fract(sin(dot(cell + 2.0, vec3(113.5, 271.9, 124.6))) * 43758.5453),
      fract(sin(dot(cell + 3.0, vec3(419.2, 371.9, 281.6))) * 43758.5453)
    ) * 0.7 + 0.15;

    float dist = length(frac - emberPos);
    float emberSize = 0.06 + highs * 0.04;
    float ember = exp(-dist * dist / (emberSize * emberSize));

    // Ember color: orange core to red edge
    vec3 emberColor = mix(vec3(1.0, 0.3, 0.05), vec3(1.0, 0.7, 0.2), ember);
    float flicker = sin(uTime * (8.0 + h * 12.0) + h * 50.0) * 0.3 + 0.7;

    embers += emberColor * ember * (0.3 + energy * 0.7) * flicker * (0.5 + highs * 0.5);
  }
  return embers;
}

vec4 _fms_render(vec3 ro, vec3 rd, float time, float energy, float bass,
                 float burstAmt, float climaxEngulf, float highs,
                 float dynRange, float aggression) {
  vec4 rez = vec4(0);
  const float ldst = 8.0;
  vec3 lpos = vec3(_fms_disp(time + ldst) * 0.5, time + ldst);
  float t = 1.0;
  float fogT = 0.0;

  // More steps for aggressive rendering
  int maxSteps = 70 + int(energy * 50.0) + int(aggression * 15.0);

  // Light direction: from below (fire source)
  vec3 lightDir = normalize(vec3(0.2, -1.0, 0.3));
  vec3 fireColor = vec3(1.0, 0.4, 0.05);

  for (int i = 0; i < 135; i++) {
    if (i >= maxSteps) break;
    if (rez.a > 0.99) break;

    vec3 pos = ro + t * rd;
    vec2 mpv = _fms_map(pos, bass, burstAmt);
    float den = clamp(mpv.x - 0.3, 0.0, 1.0) * 1.12;
    float dn = clamp((mpv.x + 2.0), 0.0, 3.0);

    // Climax: engulf everything
    den *= 0.8 + climaxEngulf * 0.6;
    // Dynamic range increases contrast between thin and thick areas
    den = pow(den, mix(1.0, 0.7, dynRange));

    vec4 col = vec4(0);
    if (mpv.x > 0.6) {
      // Smoke base color: dark charcoal with subtle warm undertone
      vec3 smokeBase = sin(vec3(3.0, 1.5, 0.8) + mpv.y * 0.12 + sin(pos.z * 0.5) * 0.3 + 0.8) * 0.5 + 0.5;
      smokeBase *= vec3(0.25, 0.12, 0.08); // charcoal with warm bias

      col = vec4(smokeBase, 0.1);
      col *= den * den * den;
      col.rgb *= _fms_linstep(4.0, -2.5, mpv.x) * 2.5;

      // Volumetric lighting from below (fire)
      float dif = clamp((den - _fms_map(pos + vec3(0.0, -0.8, 0.0), bass, burstAmt).x) / 9.0, 0.001, 1.0);
      dif += clamp((den - _fms_map(pos + vec3(0.35, 0.0, 0.0), bass, burstAmt).x) / 2.5, 0.001, 1.0);

      // Fire-lit from below: orange/red ambient
      vec3 ambientColor = vec3(0.035, 0.012, 0.005);
      vec3 difColor = vec3(0.08, 0.03, 0.008);
      col.xyz *= den * (ambientColor + 1.8 * difColor * dif);

      // === HOT EMISSIVE CORES ===
      // Where density is highest, emit orange/white glow (fire underneath)
      float hotness = smoothstep(1.5, 3.0, mpv.x);
      if (hotness > 0.01) {
        // Temperature: orange at edges, white-hot at core
        float coreTemp = smoothstep(0.0, 1.0, hotness);
        vec3 hotColor = mix(
          vec3(1.0, 0.3, 0.02),  // deep orange
          vec3(1.0, 0.85, 0.5),   // white-hot
          coreTemp * coreTemp
        );

        // Emissive glow scales with energy and dynamic range
        float emissive = hotness * (0.2 + energy * 0.4 + dynRange * 0.2);
        emissive *= 1.0 + climaxEngulf * 0.8;
        col.rgb += hotColor * emissive * 0.12;
      }

      // Forward scatter from fire below
      float fireDot = max(0.0, dot(rd, lightDir));
      float fireScatter = pow(fireDot, 3.0) * energy * 0.3;
      col.rgb += fireColor * fireScatter * den * 0.05;
    }

    // Hot atmospheric fog: smoky orange haze
    float fogC = exp(t * 0.18 - 2.0);
    vec4 fogLayer = vec4(0.08, 0.03, 0.01, 0.08) * clamp(fogC - fogT, 0.0, 1.0);
    fogLayer.rgb *= 1.0 + energy * 0.5;
    col.rgba += fogLayer;
    fogT = fogC;

    // Embers at this position
    vec3 emberGlow = _fms_embers(pos, energy, highs);
    col.rgb += emberGlow * (1.0 - rez.a) * 0.08;

    rez = rez + col * (1.0 - rez.a);
    t += clamp(0.5 - dn * dn * 0.05, 0.08, 0.25);
  }
  return clamp(rez, 0.0, 1.0);
}

// Saturation-preserving interpolation (nimitz)
float _fms_getsat(vec3 c) {
  float mi = min(min(c.x, c.y), c.z);
  float ma = max(max(c.x, c.y), c.z);
  return (ma - mi) / (ma + 1e-7);
}

vec3 _fms_iLerp(vec3 a, vec3 b, float x) {
  vec3 ic = mix(a, b, x) + vec3(1e-6, 0.0, 0.0);
  float sd = abs(_fms_getsat(ic) - mix(_fms_getsat(a), _fms_getsat(b), x));
  vec3 dir = normalize(vec3(2.0 * ic.x - ic.y - ic.z, 2.0 * ic.y - ic.x - ic.z, 2.0 * ic.z - ic.y - ic.x));
  float lgt = dot(vec3(1.0), ic);
  float ff = dot(dir, normalize(ic));
  ic += 1.5 * dir * sd * ff * lgt;
  return clamp(ic, 0.0, 1.0);
}

// Heat distortion UV displacement
vec2 heatDistort(vec2 uv, vec2 p, float energy, float bass) {
  float distortAmt = (0.003 + energy * 0.008 + bass * 0.005);
  float n1 = snoise(vec3(p * 8.0, uTime * 2.0));
  float n2 = snoise(vec3(p * 12.0 + 5.0, uTime * 2.5));
  // Stronger distortion near bottom (closer to fire)
  float heatMask = smoothstep(0.5, -0.3, p.y);
  return uv + vec2(n1, n2) * distortAmt * heatMask;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (vUv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float highs = clamp(uHighs, 0.0, 1.0);
  float onsetSnap = clamp(uOnsetSnap, 0.0, 1.0);
  float drumOnset = clamp(uStemDrumOnset, 0.0, 1.0);
  float dynRange = clamp(uDynamicRange, 0.0, 1.0);
  float tempoAccel = clamp(uTempoDerivative * 0.5 + 0.5, 0.0, 1.0); // normalize around 0
  float beatStab = clamp(uBeatStability, 0.0, 1.0);
  float aggression = clamp(uSemanticAggressive, 0.0, 1.0);
  float climaxIntensity = clamp(uClimaxIntensity, 0.0, 1.0);
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxEngulf = isClimax * climaxIntensity;

  // Section type
  float sJam = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace = smoothstep(6.5, 7.5, uSectionType);
  float sSolo = smoothstep(3.5, 4.5, uSectionType) * (1.0 - step(4.5, uSectionType));

  // Heat distortion on UV
  vec2 distortedUv = heatDistort(uv, p, energy, bass);
  vec2 distP = (distortedUv - 0.5) * aspect;

  // Time: aggressive, driven by bass velocity
  float bassVel = bass + tempoAccel * 0.3;
  float timeScale = 2.0 + energy * 2.0 + bassVel * 1.5 + sJam * 1.0 - sSpace * 1.0;
  timeScale += aggression * 0.8;
  float time = uDynamicTime * timeScale;

  // Burst amount from onsets and drum hits
  float burstAmt = onsetSnap * 0.6 + drumOnset * 0.8;
  burstAmt *= 1.0 + aggression * 0.4;

  // Palette
  float hue1 = uPalettePrimary;
  float hue2 = uPaletteSecondary;
  vec3 palCol1 = paletteHueColor(hue1, 0.75, 0.9);
  vec3 palCol2 = paletteHueColor(hue2, 0.8, 0.95);

  // Camera: looking upward through smoke column
  vec3 ro = vec3(0.0, -1.5, time);
  // Sway with beat stability — stable groove = rhythmic sway
  float swayAmt = 0.2 + beatStab * 0.15;
  ro.x += sin(uTime * 0.15) * swayAmt;
  ro.y += sin(uTime * 0.1) * 0.1;
  ro.xy += _fms_disp(ro.z) * 0.7;

  float tgtDst = 3.5;
  vec3 target = normalize(ro - vec3(_fms_disp(time + tgtDst) * 0.7, time + tgtDst));
  // Look upward into the smoke column
  target.y += 0.4 + energy * 0.2;
  target = normalize(target);

  vec3 rightdir = normalize(cross(target, vec3(0, 1, 0)));
  vec3 updir = normalize(cross(rightdir, target));
  rightdir = normalize(cross(updir, target));
  vec3 rd = normalize((distP.x * rightdir + distP.y * updir) * 1.0 - target);

  // Audio-reactive parameters
  _fms_prm1 = smoothstep(-0.4, 0.4, sin(uTime * 0.2));
  _fms_prm1 += bass * 0.35;
  _fms_prm1 += burstAmt * 0.5;
  _fms_prm1 += climaxEngulf * 0.4;
  // Solo: more dramatic density
  _fms_prm1 += sSolo * 0.2;
  // Space: thinner
  _fms_prm1 *= mix(1.0, 0.5, sSpace);

  vec4 scn = _fms_render(ro, rd, time, energy, bassVel, burstAmt,
                          climaxEngulf, highs, dynRange, aggression);
  vec3 col = scn.rgb;

  // Saturation-preserving color blend — warm bias
  col = _fms_iLerp(col.bgr, col.rgb, clamp(1.0 - _fms_prm1 * 0.5, 0.05, 1.0));

  // === FIRE GLOW FROM BELOW ===
  // Strong orange/red gradient from bottom of frame
  float fireGrad = smoothstep(0.3, -0.5, p.y);
  vec3 fireGlow = mix(
    vec3(0.8, 0.2, 0.02),  // deep red-orange
    vec3(1.0, 0.6, 0.1),    // bright orange-gold
    energy
  );
  fireGlow *= fireGrad * (0.15 + energy * 0.25 + climaxEngulf * 0.3 + bass * 0.1);
  col += fireGlow;

  // === DRUM ONSET EXPLOSION FLASH ===
  if (drumOnset > 0.3) {
    float flashMask = smoothstep(0.4, -0.2, p.y); // flash from below
    vec3 flashColor = vec3(1.0, 0.5, 0.1) * drumOnset * flashMask * 0.2;
    col += flashColor;
  }

  // === ONSET BURST: bright core eruption ===
  if (onsetSnap > 0.5) {
    float burstDist = length(p - vec2(0.0, -0.2));
    float burstMask = exp(-burstDist * burstDist * 4.0) * onsetSnap;
    col += vec3(1.0, 0.7, 0.2) * burstMask * 0.15;
  }

  // === RHYTHMIC PULSATION (beat-locked smoke surges) ===
  float beatPulse = uBeatSnap * beatStab;
  col *= 1.0 + beatPulse * 0.12;

  // Palette warm tint
  float palMix = 0.1 + energy * 0.1;
  col = mix(col, col * mix(palCol1, palCol2, sin(uTime * 0.12) * 0.5 + 0.5), palMix);

  // Gamma — dark and contrasty
  col = pow(col, vec3(0.55, 0.62, 0.68)) * vec3(1.0, 0.95, 0.88);

  // Vignette — aggressive dark edges
  vec2 q = vUv;
  float vigStrength = 0.18 - energy * 0.04;
  col *= pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), vigStrength) * 0.7 + 0.3;

  // Onset flash
  col += vec3(1.0, 0.6, 0.2) * onsetSnap * 0.05 * energy;

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

  // === POST PROCESS ===
  col = applyPostProcess(col, distortedUv, distP);

  gl_FragColor = vec4(col, 1.0);
}
`;
