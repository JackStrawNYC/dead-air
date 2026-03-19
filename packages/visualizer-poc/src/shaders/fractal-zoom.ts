import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const fractalZoomVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const fractalZoomFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}
uniform sampler2D uPrevFrame;
${noiseGLSL}
${buildPostProcessGLSL({ grainStrength: 'normal', bloomEnabled: true, anaglyphEnabled: true })}

varying vec2 vUv;

// Smooth iteration count for continuous coloring
float smoothIterations(vec2 z, vec2 c, int maxIter) {
  float n = 0.0;
  for (int i = 0; i < 96; i++) {
    if (i >= maxIter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    n += 1.0;
    if (dot(z, z) > 256.0) break;
  }
  if (dot(z, z) > 256.0) {
    // Smooth coloring: subtract fractional escape
    float sl = n - log2(log2(dot(z, z))) + 4.0;
    return sl;
  }
  return -1.0; // inside the set
}

// Palette function: attempt cosine palette with hue shift
vec3 fractalPalette(float t, float hueShift) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(hueShift, hueShift + 0.33, hueShift + 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  float zoomDensity = 1.0 + (uJamDensity - 0.5) * 0.6;
  // Determine iteration count: 96 during climax, 64 normally
  int maxIter = uClimaxPhase > 1.5 ? 96 : int(64.0 * zoomDensity);

  // Beat confidence gating for zoom reactivity
  float effectiveBeat = uBeatSnap * smoothstep(0.3, 0.7, uBeatConfidence);
  float melInfluence = uMelodicPitch * uMelodicConfidence;

  // Zoom level: continuous exponential zoom
  float zoomSpeed = 0.1 * mix(1.0, -1.0, step(0.0, -uMelodicDirection));
  float zoom = pow(2.0, uDynamicTime * zoomSpeed);

  // Coherence-driven zoom control
  float coherence = clamp(uCoherence, 0.0, 1.0);
  // High coherence: smooth zoom (reduce jitter multiplier)
  // Low coherence: amplify zoom jitter 2x
  float coherenceJitterMult = coherence > 0.7 ? mix(1.0, 0.3, (coherence - 0.7) / 0.3)
                            : coherence < 0.3 ? mix(1.0, 2.0, (0.3 - coherence) / 0.3)
                            : 1.0;

  // Section type: 0=intro, 1=verse, 2=chorus, 3=bridge, 4=solo, 5=jam, 6=outro, 7=space
  float sectionT = uSectionType;
  float jamSpeedMult = smoothstep(4.5, 5.5, sectionT) * (1.0 - step(5.5, sectionT)) * 0.5 + 1.0; // jam: 1.5x
  float spaceSpeedMult = 1.0 - smoothstep(6.5, 7.5, sectionT) * 0.6; // space: 0.4x
  float soloSpeedMult = smoothstep(3.5, 4.5, sectionT) * (1.0 - step(4.5, sectionT)) * 0.3 + 1.0; // solo: 1.3x
  zoomSpeed *= jamSpeedMult * spaceSpeedMult * soloSpeedMult;

  // Zoom smoothness: high beatStability = steady, low = jittery (confidence-gated)
  float jitter = (1.0 - uBeatStability) * 0.02 * coherenceJitterMult * smoothstep(0.3, 0.7, uBeatConfidence);
  float jitterX = snoise(vec2(uDynamicTime * 3.7, 0.0)) * jitter;
  float jitterY = snoise(vec2(0.0, uDynamicTime * 3.7)) * jitter;

  // Slowly drifting zoom center offset
  vec2 center = vec2(
    -0.743643887037151 + sin(uDynamicTime * 0.013) * 0.002 + jitterX,
    0.131825904205330 + cos(uDynamicTime * 0.017) * 0.002 + jitterY
  );

  // Melodic pitch shifts zoom target Y
  center.y += (melInfluence - 0.5) * 0.01;

  // Map UV to complex plane centered on zoom target
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y; // aspect ratio correction
  vec2 pos = uv / zoom + center;

  // Mandelbrot c = UV position (classic), Julia c = slowly drifting constant
  vec2 mandelbrot_c = pos;
  vec2 julia_c = vec2(
    -0.8 + sin(uDynamicTime * 0.05) * 0.2,
    0.156 + cos(uDynamicTime * 0.037) * 0.15
  );

  // Blend between Mandelbrot and Julia based on harmonic tension
  vec2 c = mix(mandelbrot_c, julia_c, uHarmonicTension);

  // Starting z: for Mandelbrot z=0, for Julia z=pos, blend accordingly
  vec2 z0 = mix(vec2(0.0), pos, uHarmonicTension);

  // Compute smooth iteration count
  float s = smoothIterations(z0, c, maxIter);

  // Color mapping
  float hueShift = uChromaHue / 360.0 + float(uChordIndex) * 0.083;
  vec3 col;

  if (s < 0.0) {
    // Inside the set: dark with subtle energy glow
    col = vec3(0.01) + vec3(uEnergy * 0.05, 0.0, uEnergy * 0.02);
  } else {
    float t = s / float(maxIter);
    col = fractalPalette(t * 3.0 + uDynamicTime * 0.02, hueShift);

    // Bass drives saturation pulse
    float bassPulse = uBass * 0.4;
    vec3 gray = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
    col = mix(gray, col, 1.0 + bassPulse);

    // Energy drives brightness
    col *= 0.7 + uEnergy * 0.6;
  }


  // Climax boost: extra brightness and saturation
  if (uClimaxPhase > 1.5) {
    col *= 1.3;
    vec3 gray2 = vec3(dot(col, vec3(0.299, 0.587, 0.114)));
    col = mix(gray2, col, 1.4);
  }

  // Vignette
  float dist = length(vUv - 0.5);
  float vignette = 1.0 - smoothstep(0.4, 0.85, dist);
  col *= vignette;

  // Apply shared post-processing chain
  col = applyPostProcess(col, vUv);

  // Feedback trails: section-type-aware decay
  vec3 prev = texture2D(uPrevFrame, vUv).rgb;
  float sJam_fb = smoothstep(4.5, 5.5, uSectionType) * (1.0 - step(5.5, uSectionType));
  float sSpace_fb = smoothstep(6.5, 7.5, uSectionType);
  float sChorus_fb = smoothstep(1.5, 2.5, uSectionType) * (1.0 - step(2.5, uSectionType));
  float baseDecay_fb = mix(0.94, 0.94 - 0.07, energy);
  float feedbackDecay = baseDecay_fb + sJam_fb * 0.04 + sSpace_fb * 0.06 - sChorus_fb * 0.06;
  feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  // Jam phase feedback: exploration=long trails, building=moderate, peak=max persistence, resolution=clearing
  if (uJamPhase >= 0.0) {
    float jpExplore = step(-0.5, uJamPhase) * step(uJamPhase, 0.5);
    float jpBuild   = step(0.5, uJamPhase) * step(uJamPhase, 1.5);
    float jpPeak    = step(1.5, uJamPhase) * step(uJamPhase, 2.5);
    float jpResolve = step(2.5, uJamPhase);
    feedbackDecay += jpExplore * 0.03 + jpBuild * 0.01 + jpPeak * 0.05 - jpResolve * 0.04;
    feedbackDecay = clamp(feedbackDecay, 0.80, 0.97);
  }
  col = max(col, prev * feedbackDecay);

  gl_FragColor = vec4(col, 1.0);
}
`;
