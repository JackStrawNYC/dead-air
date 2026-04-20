/**
 * CandleGlow — A+++ atmospheric overlay: a field of hundreds of warm
 * flickering light points across the lower two-thirds of the frame.
 * Pure light — no candles, no lighters, no hands. Just warm amber/gold
 * points of light with multi-layer glow halos, each flickering on its
 * own independent cycle. The effect of a thousand tiny flames seen from
 * a distance — atmospheric warmth without any illustrated objects.
 *
 * Each light has 3 concentric glow layers (outer halo, mid bloom, bright
 * core) with independent flicker phases. Lights cluster denser at the
 * bottom, thinning toward mid-frame. Subtle depth variation via size
 * and opacity (farther = smaller and dimmer).
 *
 * Audio reactivity:
 *   slowEnergy    → overall warmth and brightness
 *   energy        → flicker speed and amplitude
 *   bass          → gentle collective sway (low-frequency wave)
 *   beatDecay     → simultaneous brightness pulse across all lights
 *   onsetEnvelope → warm color flash
 *   chromaHue     → shifts between amber, gold, and warm white
 *   tempoFactor   → base flicker rate
 */

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const LIGHT_COUNT = 280;

interface Light {
  x: number;        // 0-1 horizontal position
  y: number;        // 0-1 vertical position (biased toward bottom)
  flickerSpeed: number;
  flickerPhase: number;
  flickerDepth: number;  // how much the brightness varies
  size: number;     // base radius
  hueOffset: number;
  swayPhase: number;
  swayAmp: number;
  depthFactor: number;  // 0=far, 1=near (affects size and opacity)
}

function buildLights(seed: number): Light[] {
  const rng = seeded(seed);
  const lights: Light[] = [];

  for (let i = 0; i < LIGHT_COUNT; i++) {
    // Y position biased toward bottom: more lights at bottom, fewer at top
    const rawY = rng();
    const y = 0.25 + rawY * rawY * 0.7; // quadratic bias: 0.25-0.95

    // Depth based on y position (lower = nearer = larger)
    const depthFactor = 0.3 + (y - 0.25) / 0.7 * 0.7;

    lights.push({
      x: rng(),
      y,
      flickerSpeed: 1.5 + rng() * 4.0,
      flickerPhase: rng() * Math.PI * 2,
      flickerDepth: 0.2 + rng() * 0.5,
      size: (1.5 + rng() * 2.5) * depthFactor,
      hueOffset: (rng() - 0.5) * 20, // ±10° from base amber
      swayPhase: rng() * Math.PI * 2,
      swayAmp: 0.002 + rng() * 0.006,
      depthFactor,
    });
  }
  return lights;
}

const lightsData = buildLights(55813);

export const CandleGlow: React.FC<{ frames: EnhancedFrameData[] }> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const audio = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const energy = audio.energy ?? 0;
  const slowEnergy = audio.slowEnergy ?? energy;
  const bass = audio.bass ?? 0;
  const beatDecay = audio.beatDecay ?? 0;
  const onset = audio.onsetEnvelope ?? 0;
  const chromaHue = audio.chromaHue ?? 0;

  const t = (frame / 30) * tempoFactor;
  const s = height / 1080; // resolution scaling

  // Beat pulse: all lights brighten together
  const beatPulse = 1.0 + beatDecay * 0.5;

  // Onset warm flash
  const warmFlash = onset > 0.3 ? onset * 0.3 : 0;

  // Base hue: warm amber (35°), shifts with chroma
  const baseHue = 35 + chromaHue * 15;

  // Collective bass sway
  const bassWave = Math.sin(t * 0.3) * bass * 0.01;

  const elements: React.ReactNode[] = [];

  for (let i = 0; i < LIGHT_COUNT; i++) {
    const light = lightsData[i];

    // Skip dim lights when energy is low
    if (light.depthFactor < 0.5 && slowEnergy < 0.2) continue;

    // Flicker: independent per light
    const flickerT = t * light.flickerSpeed * (0.8 + energy * 0.4);
    const flicker = 1.0 - light.flickerDepth * (
      0.5 + 0.3 * Math.sin(flickerT + light.flickerPhase)
          + 0.2 * Math.sin(flickerT * 2.3 + light.flickerPhase * 1.7)
    );

    // Position with sway
    const swayX = Math.sin(t * 0.5 + light.swayPhase) * light.swayAmp;
    const swayY = Math.cos(t * 0.4 + light.swayPhase * 1.3) * light.swayAmp * 0.5;
    const px = (light.x + swayX + bassWave) * width;
    const py = (light.y + swayY) * height;

    const brightness = flicker * beatPulse * (0.4 + slowEnergy * 0.6);
    const size = light.size * s;
    const hue = baseHue + light.hueOffset + warmFlash * 20;

    // Three-layer glow
    // Outer halo: large, soft, warm
    const haloR = size * 6;
    const haloOpacity = brightness * 0.08 * light.depthFactor;

    // Mid bloom
    const bloomR = size * 2.5;
    const bloomOpacity = brightness * 0.25 * light.depthFactor;

    // Core: bright point
    const coreR = size;
    const coreOpacity = brightness * 0.7 * light.depthFactor;

    if (coreOpacity < 0.02) continue;

    elements.push(
      <g key={i}>
        <circle
          cx={px}
          cy={py}
          r={haloR}
          fill={`hsla(${hue}, 90%, 60%, ${haloOpacity.toFixed(3)})`}
        />
        <circle
          cx={px}
          cy={py}
          r={bloomR}
          fill={`hsla(${hue}, 85%, 75%, ${bloomOpacity.toFixed(3)})`}
        />
        <circle
          cx={px}
          cy={py}
          r={coreR}
          fill={`hsla(${hue - 5}, 70%, 95%, ${coreOpacity.toFixed(3)})`}
        />
      </g>,
    );
  }

  if (elements.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {elements}
    </svg>
  );
};
