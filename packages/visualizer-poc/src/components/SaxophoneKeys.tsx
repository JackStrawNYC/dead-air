/**
 * SaxophoneKeys — Saxophone silhouette outline on one side of screen.
 * 12-16 key pads along the body that light up in sequence, mapping to frequency bands.
 * Keys flash gold when their frequency band is active.
 * Smooth golden body outline with detailed bell flare.
 * Musical note particles float from bell. Energy drives note emission rate.
 * Cycle: 50s, 16s visible.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const CYCLE = 1500; // 50s at 30fps
const DURATION = 480; // 16s visible

interface KeyPad {
  cx: number;   // relative to sax body path
  cy: number;
  radius: number;
  bandIdx: number; // which frequency band (0-6 from spectral contrast, or chroma)
}

interface NoteParticle {
  xOffset: number;
  riseSpeed: number;
  driftFreq: number;
  driftAmp: number;
  size: number;
  phase: number;
  noteType: number; // 0 = eighth, 1 = quarter, 2 = sixteenth
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SaxophoneKeys: React.FC<Props> = ({ frames }) => {
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

  // Sax positioned on right side of screen
  const saxX = width * 0.82;
  const saxTop = height * 0.08;
  const saxBottom = height * 0.85;
  const saxHeight = saxBottom - saxTop;

  // Key pads along the body
  const keyPads = React.useMemo(() => {
    const result: KeyPad[] = [];
    const numKeys = 14;
    for (let i = 0; i < numKeys; i++) {
      const t = (i + 1) / (numKeys + 1);
      // Keys follow a slight curve along the sax body
      const cy = saxTop + t * saxHeight * 0.75; // keys in upper 75%
      const curveOffset = Math.sin(t * Math.PI * 0.8) * 15;
      result.push({
        cx: curveOffset,
        cy,
        radius: 6 + (1 - t) * 4, // bigger keys near top
        bandIdx: i % 7, // map to 7 spectral contrast bands
      });
    }
    return result;
  }, [saxTop, saxHeight]);

  const noteParticles = React.useMemo(() => {
    const rng = seeded(4444);
    const result: NoteParticle[] = [];
    for (let i = 0; i < 12; i++) {
      result.push({
        xOffset: (rng() - 0.5) * 80,
        riseSpeed: 0.5 + rng() * 1.5,
        driftFreq: 0.008 + rng() * 0.02,
        driftAmp: 10 + rng() * 30,
        size: 8 + rng() * 8,
        phase: rng() * 200,
        noteType: Math.floor(rng() * 3),
      });
    }
    return result;
  }, []);

  // Timing gate
  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.88, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const baseOpacity = interpolate(energy, [0.02, 0.2], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut) * baseOpacity;

  if (opacity < 0.01) return null;

  const currentFrame = frames[idx];
  const contrast = currentFrame.contrast;

  // Sax body outline path (simplified saxophone silhouette)
  // Mouthpiece at top, body curves down, bell flares at bottom
  const bodyPath = `
    M${saxX - 3},${saxTop}
    C${saxX - 3},${saxTop + saxHeight * 0.1} ${saxX + 10},${saxTop + saxHeight * 0.2} ${saxX + 12},${saxTop + saxHeight * 0.35}
    C${saxX + 14},${saxTop + saxHeight * 0.5} ${saxX + 8},${saxTop + saxHeight * 0.6} ${saxX + 5},${saxTop + saxHeight * 0.7}
    C${saxX},${saxTop + saxHeight * 0.8} ${saxX - 15},${saxTop + saxHeight * 0.88} ${saxX - 40},${saxBottom}
    C${saxX - 55},${saxBottom + 15} ${saxX - 65},${saxBottom + 25} ${saxX - 50},${saxBottom + 30}
    C${saxX - 30},${saxBottom + 35} ${saxX - 10},${saxBottom + 20} ${saxX + 10},${saxBottom + 5}
  `;

  const bodyPathRight = `
    M${saxX + 3},${saxTop}
    C${saxX + 3},${saxTop + saxHeight * 0.1} ${saxX + 18},${saxTop + saxHeight * 0.2} ${saxX + 20},${saxTop + saxHeight * 0.35}
    C${saxX + 22},${saxTop + saxHeight * 0.5} ${saxX + 16},${saxTop + saxHeight * 0.6} ${saxX + 13},${saxTop + saxHeight * 0.7}
    C${saxX + 8},${saxTop + saxHeight * 0.8} ${saxX - 5},${saxTop + saxHeight * 0.88} ${saxX - 30},${saxBottom}
  `;

  // Bell center for note emission
  const bellCx = saxX - 40;
  const bellCy = saxBottom + 15;

  // Note emission rate based on energy
  const noteVisibility = interpolate(energy, [0.05, 0.25], [0.2, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Musical note SVG path builders
  const notePath = (type: number, size: number): string => {
    const s = size;
    switch (type) {
      case 0: // Eighth note
        return `M0,${-s} L0,${s * 0.3} M0,${-s} C${s * 0.4},${-s * 0.8} ${s * 0.6},${-s * 0.4} ${s * 0.3},${-s * 0.2} M-${s * 0.25},${s * 0.3} A${s * 0.25},${s * 0.18} 0 1 0 ${s * 0.25},${s * 0.3} A${s * 0.25},${s * 0.18} 0 1 0 ${-s * 0.25},${s * 0.3}`;
      case 1: // Quarter note (filled head + stem)
        return `M0,${-s} L0,${s * 0.3} M-${s * 0.25},${s * 0.3} A${s * 0.25},${s * 0.18} 0 1 0 ${s * 0.25},${s * 0.3} A${s * 0.25},${s * 0.18} 0 1 0 ${-s * 0.25},${s * 0.3}`;
      default: // Double beam
        return `M0,${-s} L0,${s * 0.3} M0,${-s} L${s * 0.3},${-s * 0.3} M0,${-s * 0.7} L${s * 0.3},0 M-${s * 0.25},${s * 0.3} A${s * 0.25},${s * 0.18} 0 1 0 ${s * 0.25},${s * 0.3} A${s * 0.25},${s * 0.18} 0 1 0 ${-s * 0.25},${s * 0.3}`;
    }
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{ opacity, willChange: "opacity" }}
      >
        <defs>
          <filter id="sax-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="key-glow">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Sax body outline */}
        <path
          d={bodyPath}
          fill="none"
          stroke="#C4A050"
          strokeWidth={2.5}
          opacity={0.5}
          strokeLinecap="round"
        />
        <path
          d={bodyPathRight}
          fill="none"
          stroke="#C4A050"
          strokeWidth={2}
          opacity={0.35}
          strokeLinecap="round"
        />

        {/* Mouthpiece detail */}
        <line
          x1={saxX}
          y1={saxTop - 10}
          x2={saxX}
          y2={saxTop + 5}
          stroke="#A08840"
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.4}
        />

        {/* Key pads */}
        {keyPads.map((key, ki) => {
          const bandValue = contrast[key.bandIdx];
          const isActive = bandValue > 0.4;
          const brightness = interpolate(bandValue, [0.2, 0.7], [0.15, 1.0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const keyColor = isActive ? `hsl(45, 90%, ${50 + brightness * 30}%)` : "#886830";
          const keyOpacity = isActive ? 0.7 + brightness * 0.3 : 0.3;

          return (
            <g key={`key-${ki}`}>
              <circle
                cx={saxX + key.cx}
                cy={key.cy}
                r={key.radius}
                fill={keyColor}
                opacity={keyOpacity}
                filter={isActive ? "url(#key-glow)" : undefined}
              />
              <circle
                cx={saxX + key.cx}
                cy={key.cy}
                r={key.radius - 1.5}
                fill="none"
                stroke="#FFD700"
                strokeWidth={0.8}
                opacity={brightness * 0.5}
              />
            </g>
          );
        })}

        {/* Musical note particles from bell */}
        {noteParticles.map((np, ni) => {
          if (ni / noteParticles.length > noteVisibility) return null;

          const t = ((cycleFrame + np.phase) % 120) / 120;
          const ny = bellCy - t * height * 0.35;
          const nx = bellCx + np.xOffset + Math.sin((cycleFrame + np.phase) * np.driftFreq) * np.driftAmp;
          const noteOp = (1 - t) * 0.5 * noteVisibility;

          if (noteOp < 0.03) return null;

          const noteD = notePath(np.noteType, np.size);
          const noteHue = 40 + t * 20;

          return (
            <g key={`note-${ni}`} transform={`translate(${nx},${ny})`}>
              <path
                d={noteD}
                fill="none"
                stroke={`hsl(${noteHue}, 80%, 65%)`}
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={noteOp}
              />
            </g>
          );
        })}

        {/* Bell flare glow */}
        <ellipse
          cx={bellCx}
          cy={bellCy}
          rx={30 + energy * 15}
          ry={20 + energy * 10}
          fill="#FFD700"
          opacity={0.05 + energy * 0.08}
          filter="url(#sax-glow)"
        />
      </svg>
    </div>
  );
};
