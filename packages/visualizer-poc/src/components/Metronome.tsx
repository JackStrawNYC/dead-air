/**
 * Metronome — Classic mechanical metronome with swinging arm synced to
 * detected tempo. Inverted pendulum arm with counterweight. Base is a
 * trapezoidal wooden body. Arm swing frequency matches the track tempo
 * (from frame data beat intervals). Brass/mahogany aesthetic.
 * Cycle: 45s, 15s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 1350; // 45s at 30fps
const DURATION = 450; // 15s visible

interface Props {
  frames: EnhancedFrameData[];
}

export const Metronome: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const idx = Math.min(Math.max(0, frame), frames.length - 1);
  let eSum = 0;
  let eCount = 0;
  for (let i = Math.max(0, idx - 75); i <= Math.min(frames.length - 1, idx + 75); i++) {
    eSum += frames[i].rms;
    eCount++;
  }
  const energy = eCount > 0 ? eSum / eCount : 0;

  // Estimate tempo from beat intervals (look at nearby beats)
  const tempoEstimate = React.useMemo(() => {
    const beatFrames: number[] = [];
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].beat) beatFrames.push(i);
    }
    if (beatFrames.length < 2) return 120; // default 120 BPM
    // Average interval over all beats
    let totalInterval = 0;
    for (let i = 1; i < beatFrames.length; i++) {
      totalInterval += beatFrames[i] - beatFrames[i - 1];
    }
    const avgIntervalFrames = totalInterval / (beatFrames.length - 1);
    // Convert frames to BPM (at 30fps)
    const bpm = (30 * 60) / avgIntervalFrames;
    return Math.max(40, Math.min(240, bpm));
  }, [frames]);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.03, 0.25], [0.25, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  // Position: left-center
  const cx = width * 0.22;
  const cy = height * 0.55;
  const bodyHeight = Math.min(width, height) * 0.32;
  const bodyTopW = bodyHeight * 0.18;
  const bodyBotW = bodyHeight * 0.3;

  // Colors
  const mahogany = "#6B2C14";
  const mahoganyLight = "#8B4726";
  const brassColor = "#D4A850";
  const brassDark = "#8B6914";
  const faceColor = "#FAF0D7";

  // Arm swing: frequency derived from tempo
  // BPM → beats per second → radians per frame
  const beatsPerFrame = tempoEstimate / (30 * 60);
  const swingFreq = beatsPerFrame * Math.PI; // half-oscillation per beat
  const swingAngle = Math.sin(frame * swingFreq) * 28; // ±28 degrees

  // Tick flash at extremes (when arm reverses)
  const armVelocity = Math.abs(Math.cos(frame * swingFreq));
  const isAtExtreme = armVelocity < 0.12;
  const tickFlash = isAtExtreme ? 0.3 + energy * 0.3 : 0;

  const glowSize = interpolate(energy, [0.03, 0.3], [1, 8], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Arm length and weight position
  const armLength = bodyHeight * 0.75;
  const weightY = armLength * 0.35; // weight slider position (higher = faster)

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 ${glowSize}px rgba(212, 168, 80, 0.3))`,
          willChange: "opacity",
        }}
      >
        <g transform={`translate(${cx}, ${cy})`}>
          {/* Body (trapezoidal) */}
          <polygon
            points={`${-bodyTopW},${-bodyHeight * 0.55} ${bodyTopW},${-bodyHeight * 0.55} ${bodyBotW},${bodyHeight * 0.45} ${-bodyBotW},${bodyHeight * 0.45}`}
            fill={mahogany}
            opacity={0.5}
            stroke={mahoganyLight}
            strokeWidth={2}
          />

          {/* Decorative face plate */}
          <rect
            x={-bodyTopW * 0.8}
            y={-bodyHeight * 0.3}
            width={bodyTopW * 1.6}
            height={bodyHeight * 0.4}
            rx={3}
            fill={faceColor}
            opacity={0.08}
            stroke={brassColor}
            strokeWidth={1}
          />

          {/* Tempo scale markings */}
          {[40, 60, 80, 100, 120, 160, 200].map((bpm, bi) => {
            const yPos = interpolate(bi, [0, 6], [-bodyHeight * 0.25, bodyHeight * 0.05], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <g key={`tempo-${bpm}`}>
                <line x1={-bodyTopW * 0.6} y1={yPos} x2={-bodyTopW * 0.3} y2={yPos} stroke={brassDark} strokeWidth={0.8} opacity={0.3} />
                <text x={bodyTopW * 0.1} y={yPos} textAnchor="middle" dominantBaseline="central" fill={brassDark} fontSize={6} fontFamily="serif" opacity={0.3}>
                  {bpm}
                </text>
              </g>
            );
          })}

          {/* Pivot point */}
          <circle cx={0} cy={0} r={5} fill={brassColor} opacity={0.6} stroke={brassDark} strokeWidth={1} />

          {/* Swinging arm (inverted pendulum, pivots from bottom) */}
          <g transform={`rotate(${swingAngle}, 0, 0)`}>
            {/* Arm rod */}
            <line
              x1={0} y1={bodyHeight * 0.15}
              x2={0} y2={-armLength}
              stroke={brassColor}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.7}
            />
            {/* Counterweight (slider) */}
            <rect
              x={-8}
              y={-weightY - 8}
              width={16}
              height={16}
              rx={2}
              fill={brassColor}
              opacity={0.6}
              stroke={brassDark}
              strokeWidth={1}
            />
            {/* Arm tip */}
            <circle cx={0} cy={-armLength} r={4} fill={brassColor} opacity={0.5} />
          </g>

          {/* Base decorative trim */}
          <line
            x1={-bodyBotW * 0.9} y1={bodyHeight * 0.45}
            x2={bodyBotW * 0.9} y2={bodyHeight * 0.45}
            stroke={brassColor} strokeWidth={2} opacity={0.4}
          />
          <line
            x1={-bodyBotW * 0.95} y1={bodyHeight * 0.48}
            x2={bodyBotW * 0.95} y2={bodyHeight * 0.48}
            stroke={brassDark} strokeWidth={1} opacity={0.3}
          />

          {/* Feet */}
          <rect x={-bodyBotW * 0.85} y={bodyHeight * 0.45} width={12} height={6} rx={2} fill={mahoganyLight} opacity={0.4} />
          <rect x={bodyBotW * 0.85 - 12} y={bodyHeight * 0.45} width={12} height={6} rx={2} fill={mahoganyLight} opacity={0.4} />

          {/* Tick flash at extremes */}
          {tickFlash > 0.05 && (
            <circle cx={0} cy={-armLength * 0.5} r={bodyHeight * 0.08} fill="#FFE0A0" opacity={tickFlash} />
          )}
        </g>
      </svg>
    </div>
  );
};
