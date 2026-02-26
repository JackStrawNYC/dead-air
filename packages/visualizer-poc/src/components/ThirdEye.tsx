/**
 * ThirdEye — Giant eye that opens and closes.
 * Large eye shape (SVG ellipse + pointed ends) centered on screen.
 * Eye opens during energy peaks, closes during quiet.
 * Iris is a psychedelic spiral pattern (concentric colored rings).
 * Pupil dilates with energy. Eye color shifts with chroma.
 * Appears every 75s for 10s. Dramatic and trippy.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import type { EnhancedFrameData } from "../data/types";

const CYCLE = 2250; // 75 seconds at 30fps
const DURATION = 300; // 10 seconds visible
const TWO_PI = Math.PI * 2;

interface Props {
  frames: EnhancedFrameData[];
}

export const ThirdEye: React.FC<Props> = ({ frames }) => {
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

  const cycleFrame = frame % CYCLE;
  if (cycleFrame >= DURATION) return null;

  const progress = cycleFrame / DURATION;
  const fadeIn = interpolate(progress, [0, 0.15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(progress, [0.85, 1], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });
  const opacity = Math.min(fadeIn, fadeOut) * interpolate(energy, [0.03, 0.25], [0.2, 0.6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (opacity < 0.01) return null;

  const cx = width / 2;
  const cy = height / 2;

  // Eye opening: energy drives how open the eye is (scaleY of the eye shape)
  const openness = interpolate(energy, [0.02, 0.3], [0.15, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Eye dimensions
  const eyeW = Math.min(width, height) * 0.55;
  const eyeH = eyeW * 0.35 * openness;

  // Pupil dilation: energy drives pupil size
  const irisR = eyeW * 0.18;
  const pupilR = interpolate(energy, [0.02, 0.35], [irisR * 0.2, irisR * 0.65], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Chroma-driven hue: pick the strongest chroma pitch class
  const fd = frames[idx];
  let maxChroma = 0;
  let maxChromaIdx = 0;
  for (let c = 0; c < 12; c++) {
    if (fd.chroma[c] > maxChroma) {
      maxChroma = fd.chroma[c];
      maxChromaIdx = c;
    }
  }
  const irisHue = (maxChromaIdx / 12) * 360;
  const baseHue = (frame * 0.8 + irisHue) % 360;

  // Spiral iris rings
  const spiralRotation = frame * 1.2;
  const ringCount = 8;

  // Eye outline path: pointed ends with elliptical top/bottom arcs
  const halfW = eyeW / 2;
  const halfH = eyeH / 2;
  const eyePath = `
    M ${cx - halfW} ${cy}
    Q ${cx - halfW * 0.5} ${cy - halfH * 1.8}, ${cx} ${cy - halfH}
    Q ${cx + halfW * 0.5} ${cy - halfH * 1.8}, ${cx + halfW} ${cy}
    Q ${cx + halfW * 0.5} ${cy + halfH * 1.8}, ${cx} ${cy + halfH}
    Q ${cx - halfW * 0.5} ${cy + halfH * 1.8}, ${cx - halfW} ${cy}
    Z
  `;

  const glowColor = `hsl(${baseHue}, 100%, 65%)`;
  const glowColor2 = `hsl(${(baseHue + 120) % 360}, 100%, 65%)`;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg
        width={width}
        height={height}
        style={{
          opacity,
          filter: `drop-shadow(0 0 12px ${glowColor}) drop-shadow(0 0 30px ${glowColor2})`,
        }}
      >
        <defs>
          <clipPath id="eye-clip">
            <path d={eyePath} />
          </clipPath>
        </defs>

        {/* Eye outline */}
        <path
          d={eyePath}
          stroke={`hsl(${baseHue}, 100%, 70%)`}
          strokeWidth={2.5}
          fill="none"
        />

        {/* Clipped iris area */}
        <g clipPath="url(#eye-clip)">
          {/* Iris background */}
          <circle cx={cx} cy={cy} r={irisR * 1.3} fill={`hsl(${irisHue}, 60%, 15%)`} />

          {/* Psychedelic spiral rings */}
          <g transform={`rotate(${spiralRotation}, ${cx}, ${cy})`}>
            {Array.from({ length: ringCount }, (_, ri) => {
              const ringR = irisR * ((ri + 1) / ringCount);
              const hue = (baseHue + ri * 45) % 360;
              return (
                <circle
                  key={ri}
                  cx={cx}
                  cy={cy}
                  r={ringR}
                  stroke={`hsl(${hue}, 100%, 60%)`}
                  strokeWidth={2}
                  fill="none"
                  opacity={0.6}
                />
              );
            })}

            {/* Spiral lines radiating out */}
            {Array.from({ length: 12 }, (_, si) => {
              const angle = (si / 12) * TWO_PI;
              const spiralBend = Math.sin(frame * 0.05 + si) * 15;
              const x1 = cx + Math.cos(angle) * pupilR;
              const y1 = cy + Math.sin(angle) * pupilR;
              const x2 = cx + Math.cos(angle + spiralBend * 0.01) * irisR * 1.2;
              const y2 = cy + Math.sin(angle + spiralBend * 0.01) * irisR * 1.2;
              const hue = (baseHue + si * 30) % 360;
              return (
                <line
                  key={si}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={`hsl(${hue}, 100%, 65%)`}
                  strokeWidth={1.5}
                  opacity={0.5}
                />
              );
            })}
          </g>

          {/* Pupil */}
          <circle cx={cx} cy={cy} r={pupilR} fill="black" opacity={0.85} />

          {/* Pupil highlight */}
          <circle cx={cx - pupilR * 0.3} cy={cy - pupilR * 0.3} r={pupilR * 0.2} fill="white" opacity={0.4} />

          {/* Sclera veins (subtle) */}
          {Array.from({ length: 6 }, (_, vi) => {
            const angle = (vi / 6) * TWO_PI + frame * 0.002;
            const x1 = cx + Math.cos(angle) * irisR * 1.2;
            const y1 = cy + Math.sin(angle) * irisR * 1.2;
            const x2 = cx + Math.cos(angle) * halfW * 0.85;
            const y2 = cy + Math.sin(angle) * halfH * 0.7;
            return (
              <line
                key={vi}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={`hsl(${(baseHue + 180) % 360}, 80%, 60%)`}
                strokeWidth={0.8}
                opacity={0.25}
              />
            );
          })}
        </g>

        {/* Upper eyelid shadow */}
        <path
          d={`
            M ${cx - halfW} ${cy}
            Q ${cx - halfW * 0.5} ${cy - halfH * 1.8}, ${cx} ${cy - halfH}
            Q ${cx + halfW * 0.5} ${cy - halfH * 1.8}, ${cx + halfW} ${cy}
            L ${cx + halfW} ${cy - halfH * 2}
            L ${cx - halfW} ${cy - halfH * 2}
            Z
          `}
          fill={`hsl(${baseHue}, 40%, 10%)`}
          opacity={0.3 * (1 - openness)}
        />
      </svg>
    </div>
  );
};
