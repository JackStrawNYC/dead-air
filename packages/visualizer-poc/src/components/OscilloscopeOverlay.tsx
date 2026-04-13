/**
 * OscilloscopeOverlay — Thin glowing horizontal waveform line.
 *
 * The line's Y position at each X is driven by actual audio data
 * (nearby frames' RMS to simulate a waveform). Centered in the
 * middle third of the screen. Subtle glow filter. Low opacity.
 *
 * Audio reactivity:
 *   rms (frames) -> waveform shape
 *   energy       -> line brightness
 *   beatDecay    -> glow intensity
 *   chromaHue    -> line color
 *   slowEnergy   -> line thickness
 *   tempoFactor  -> waveform scroll speed
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

const CYCLE_TOTAL = 2400;
const VISIBLE_DURATION = 780;
const SAMPLE_COUNT = 128;

interface Props {
  frames: EnhancedFrameData[];
}

export const OscilloscopeOverlay: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const cycleFrame = frame % CYCLE_TOTAL;
  if (cycleFrame >= VISIBLE_DURATION) return null;
  const progress = cycleFrame / VISIBLE_DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.35;
  if (masterOpacity < 0.01) return null;

  const hue = snap.chromaHue;
  const lineColor = `hsl(${hue}, 65%, 65%)`;
  const glowColor = `hsla(${hue}, 70%, 60%, 0.5)`;
  const glowStd = interpolate(snap.beatDecay, [0, 0.5], [2, 6], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const strokeW = interpolate(snap.slowEnergy, [0, 0.3], [1.0, 2.2], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Build waveform from nearby frames' RMS
  const centerY = height * 0.5;
  const amplitude = height * 0.08;
  const currentIdx = Math.min(Math.max(0, frame), frames.length - 1);

  // Sample SAMPLE_COUNT points across the screen width
  const margin = width * 0.05;
  const usableW = width - margin * 2;

  const points: string[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / (SAMPLE_COUNT - 1);
    const x = margin + t * usableW;

    // Map each sample point to a nearby frame index (spread across a window of frames)
    const spread = Math.floor(SAMPLE_COUNT * 0.7 * tempoFactor);
    const sampleIdx = Math.floor(currentIdx - spread / 2 + t * spread);
    const clampedIdx = Math.min(Math.max(0, sampleIdx), frames.length - 1);
    const rms = frames.length > 0 ? frames[clampedIdx].rms : 0;

    // Add some sinusoidal variation for visual interest
    const wave = Math.sin(t * Math.PI * 6 + frame * 0.05 * tempoFactor) * 0.3;
    const y = centerY + (rms + wave * rms) * amplitude * 5 * (Math.sin(t * Math.PI) > 0 ? 1 : -1);

    points.push(i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }

  const waveformPath = points.join(" ");

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ opacity: masterOpacity, willChange: "opacity" }}>
        <defs>
          <filter id="osc-glow" x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation={glowStd} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Glow layer — wider, blurred */}
        <path
          d={waveformPath}
          stroke={glowColor}
          strokeWidth={strokeW * 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#osc-glow)"
        />

        {/* Main line */}
        <path
          d={waveformPath}
          stroke={lineColor}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Center reference line — very subtle */}
        <line
          x1={margin}
          y1={centerY}
          x2={width - margin}
          y2={centerY}
          stroke={`hsla(${hue}, 30%, 50%, 0.08)`}
          strokeWidth={0.5}
        />
      </svg>
    </div>
  );
};
