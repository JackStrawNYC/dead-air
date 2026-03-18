/**
 * Neural Web — synaptic network with firing nodes.
 * Interconnected nodes with pulsing axons. Drum hits trigger node firing cascades.
 * Signal propagation trails via feedback buffer.
 *
 * Audio reactivity:
 *   uDrumOnset     → node firing
 *   uMelodicPitch  → signal color
 *   uHarmonicTension → network connectivity density
 *   uBeatSnap      → synchronous firing pulse
 *   uBass          → axon thickness
 *   uMids          → branching factor
 */

import { noiseGLSL } from "./noise";
import { sharedUniformsGLSL } from "./shared/uniforms.glsl";
import { buildPostProcessGLSL } from "./shared/postprocess.glsl";

export const neuralWebVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const neuralWebFrag = /* glsl */ `
precision highp float;

${sharedUniformsGLSL}

${noiseGLSL}

${buildPostProcessGLSL({
  bloomEnabled: true,
  halationEnabled: true,
  caEnabled: true,
  grainStrength: "light",
})}

varying vec2 vUv;

#define PI 3.14159265
#define TAU 6.28318530

// Hash function for node positions
vec2 nodeHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Distance to nearest node in a grid cell
float nodeField(vec2 p, out vec2 nearestNode, float gridSize) {
  vec2 cell = floor(p / gridSize);
  float minDist = 1e5;
  nearestNode = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = cell + vec2(float(x), float(y));
      vec2 nodePos = (neighbor + nodeHash(neighbor)) * gridSize;
      float d = length(p - nodePos);
      if (d < minDist) {
        minDist = d;
        nearestNode = nodePos;
      }
    }
  }
  return minDist;
}

// Axon connection line SDF
float axonLine(vec2 p, vec2 a, vec2 b, float thickness) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - thickness;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - 0.5) * aspect;

  float energy = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mids = clamp(uMids, 0.0, 1.0);
  float drumOnset = clamp(uDrumOnset, 0.0, 1.0);
  float tension = clamp(uHarmonicTension, 0.0, 1.0);
  float beatSnap = clamp(uBeatSnap, 0.0, 1.0);
  float melodicPitch = clamp(uMelodicPitch, 0.0, 1.0);

  float slowTime = uDynamicTime * 0.04;
  float chromaHueMod = uChromaHue * 0.15;

  // --- Network grid ---
  float gridSize = mix(0.15, 0.08, tension);
  float branchFactor = 0.5 + mids * 0.5;

  vec3 col = vec3(0.01, 0.008, 0.02); // dark background

  // --- Feedback blend (previous frame provides trailing glow) ---
  vec4 prev = texture2D(uPrevFrame, vUv);
  col += prev.rgb * 0.94 * (0.8 + energy * 0.2);

  // --- Draw axon connections ---
  float axonThickness = 0.002 + bass * 0.004;

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 offset = vec2(sin(fi * 1.7 + slowTime), cos(fi * 2.3 + slowTime)) * 0.03;

    vec2 nodeA, nodeB;
    float dA = nodeField(p + offset, nodeA, gridSize);
    float dB = nodeField(p - offset + vec2(gridSize * branchFactor), nodeB, gridSize * 1.2);

    float axon = axonLine(p, nodeA, nodeB, axonThickness);

    if (axon < 0.01) {
      // Signal pulse traveling along axon
      float signalPos = fract(slowTime * 2.0 + fi * 0.13);
      vec2 signalPt = mix(nodeA, nodeB, signalPos);
      float signalDist = length(p - signalPt);
      float signal = exp(-signalDist * 80.0) * energy;

      // Firing cascade from drum onset
      float firePhase = fract(drumOnset * 3.0 + fi * 0.17);
      float firePulse = exp(-firePhase * 4.0) * drumOnset;

      float hue = uPalettePrimary + melodicPitch * 0.15 + chromaHueMod + fi * 0.05;
      float sat = mix(0.5, 1.0, energy) * uPaletteSaturation;
      float val = signal * 0.8 + firePulse * 0.5;

      vec3 axonColor = hsv2rgb(vec3(hue, sat, val));
      float edgeFade = smoothstep(0.01, 0.0, axon);
      col += axonColor * edgeFade * 0.4;
    }
  }

  // --- Draw nodes ---
  vec2 nearestNode;
  float nodeDist = nodeField(p, nearestNode, gridSize);

  // Node glow
  float nodeRadius = 0.008 + bass * 0.006;
  float nodeGlow = exp(-nodeDist / nodeRadius) * 0.6;

  // Firing nodes: drum onset triggers bright flash
  float nodeId = fract(sin(dot(nearestNode, vec2(12.9898, 78.233))) * 43758.5453);
  float fireThreshold = 1.0 - drumOnset;
  float isFiring = step(fireThreshold, nodeId) * drumOnset;

  // Synchronous pulse on beat
  float syncPulse = beatSnap * 0.5;

  float nodeHue = uPalettePrimary + nodeId * 0.1 + chromaHueMod;
  float nodeSat = mix(0.4, 1.0, energy) * uPaletteSaturation;
  float nodeVal = nodeGlow + isFiring * 0.8 + syncPulse * 0.3;

  vec3 nodeColor = hsv2rgb(vec3(nodeHue, nodeSat, min(nodeVal, 1.0)));
  col += nodeColor * nodeGlow;

  // --- Global firing flash on strong drum hits ---
  if (drumOnset > 0.6) {
    float flash = (drumOnset - 0.6) * 2.5;
    vec3 flashColor = hsv2rgb(vec3(uPaletteSecondary, 0.6, flash));
    col += flashColor * 0.2;
  }

  // --- Climax boost ---
  float isClimax = step(1.5, uClimaxPhase) * step(uClimaxPhase, 3.5);
  float climaxBoost = isClimax * uClimaxIntensity;
  col *= 1.0 + climaxBoost * 0.6;


  // --- SDF icon emergence ---
  {
    float nf = fbm3(vec3(p * 2.0, slowTime));
    vec3 c1 = hsv2rgb(vec3(uPalettePrimary, 0.8, 1.0));
    vec3 c2 = hsv2rgb(vec3(uPaletteSecondary, 0.8, 1.0));
    col += iconEmergence(p, uTime, energy, bass, c1, c2, nf, uClimaxPhase, uSectionIndex) * 0.5;
  }

  // --- Vignette ---
  float vigScale = mix(0.28, 0.20, energy);
  float vignette = 1.0 - dot(p * vigScale, p * vigScale);
  vignette = smoothstep(0.0, 1.0, vignette);
  col = mix(vec3(0.005, 0.003, 0.01), col, vignette);

  // --- Post-processing ---
  col = applyPostProcess(col, vUv, p);

  gl_FragColor = vec4(col, 1.0);
}
`;
