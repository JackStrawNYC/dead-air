/**
 * SetlistPaper — handwritten setlist on aged paper.
 * Layer 7, tier B, tags: dead-culture, retro.
 * Rectangular paper shape with torn/rough edges. 6-8 horizontal lines suggesting handwriting.
 * Paper color: cream/aged. Lines in dark ink. Paper flutters slightly with beatDecay.
 * Opacity 0.10-0.25. Pin/tack at top. Position: offset right, slightly rotated.
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/** Map 0-1 hue to an RGB hex string */
function hueToHex(h: number): string {
  const s = 0.85, l = 0.6;
  const hue = ((h % 1) + 1) % 1;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  const sector = Math.floor(hue * 6);
  if (sector === 0) { r = c; g = x; }
  else if (sector === 1) { r = x; g = c; }
  else if (sector === 2) { g = c; b = x; }
  else if (sector === 3) { g = x; b = c; }
  else if (sector === 4) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface Props {
  frames: EnhancedFrameData[];
}

export const SetlistPaper: React.FC<Props> = ({ frames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const snap = useAudioSnapshot(frames);
  const energy = snap.energy;
  const slowEnergy = snap.slowEnergy;
  const chromaHue = snap.chromaHue / 360;
  const tempoFactor = useTempoFactor();

  // Opacity: 0.10-0.25 (subtle overlay)
  const opacity = interpolate(energy, [0.02, 0.3], [0.10, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Paper flutter rotation with beatDecay — subtle
  const baseRotation = 3; // slightly rotated always
  const flutter = Math.sin(frame * 0.06 * tempoFactor) * snap.beatDecay * 1.5;
  const rotation = baseRotation + flutter;

  // Paper dimensions in viewBox
  const paperLeft = 15;
  const paperRight = 115;
  const paperTop = 18;
  const paperBottom = 168;
  const paperWidth = paperRight - paperLeft;
  const paperHeight = paperBottom - paperTop;

  // Torn/rough bottom edge — jagged path
  const tornEdge = `
    M ${paperLeft},${paperBottom}
    L ${paperLeft + 5},${paperBottom - 2}
    L ${paperLeft + 12},${paperBottom + 1}
    L ${paperLeft + 20},${paperBottom - 3}
    L ${paperLeft + 28},${paperBottom}
    L ${paperLeft + 35},${paperBottom - 2}
    L ${paperLeft + 42},${paperBottom + 2}
    L ${paperLeft + 50},${paperBottom - 1}
    L ${paperLeft + 58},${paperBottom - 3}
    L ${paperLeft + 65},${paperBottom + 1}
    L ${paperLeft + 72},${paperBottom - 2}
    L ${paperLeft + 80},${paperBottom}
    L ${paperLeft + 87},${paperBottom - 3}
    L ${paperLeft + 95},${paperBottom + 1}
    L ${paperRight},${paperBottom - 1}
  `;

  // Paper body with torn bottom
  const paperPath = `
    M ${paperLeft},${paperTop}
    L ${paperRight},${paperTop}
    L ${paperRight},${paperBottom - 1}
    ${tornEdge}
    L ${paperLeft},${paperBottom}
    Z
  `;

  // Handwriting lines — 7 lines with slight waviness
  const lines: React.ReactNode[] = [];
  const lineCount = 7;
  const lineStartY = paperTop + 22;
  const lineSpacing = (paperHeight - 30) / lineCount;
  const lineMarginLeft = paperLeft + 10;
  const lineMarginRight = paperRight - 10;

  for (let i = 0; i < lineCount; i++) {
    const y = lineStartY + i * lineSpacing;
    // Each line has slightly different length (like real handwriting)
    const lineLengthFactor = 0.6 + ((i * 37 + 13) % 17) / 17 * 0.4;
    const endX = lineMarginLeft + (lineMarginRight - lineMarginLeft) * lineLengthFactor;

    // Slight waviness in the line
    const midX = (lineMarginLeft + endX) / 2;
    const wave1 = Math.sin(i * 2.3 + 0.5) * 1.5;
    const wave2 = Math.sin(i * 1.7 + 1.2) * 1;

    lines.push(
      <path
        key={`line-${i}`}
        d={`M ${lineMarginLeft},${y} Q ${midX * 0.5 + lineMarginLeft * 0.5},${y + wave1} ${midX},${y + wave2} Q ${midX * 0.5 + endX * 0.5},${y - wave1 * 0.5} ${endX},${y + wave2 * 0.3}`}
        fill="none"
        stroke="#2a2218"
        strokeWidth={0.8 + Math.sin(i * 1.1) * 0.2}
        strokeLinecap="round"
        opacity={0.6 + Math.sin(i * 0.9) * 0.15}
      />,
    );
  }

  // Coffee stain ring (aged paper detail)
  const stainOpacity = 0.08;

  // Pin/tack at top center
  const pinX = (paperLeft + paperRight) / 2;
  const pinY = paperTop - 2;

  // Scale based on screen
  const baseSize = Math.min(width, height) * 0.28;

  // Subtle breathe
  const breathe = interpolate(slowEnergy, [0.02, 0.2], [0.98, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        paddingRight: width * 0.08,
      }}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg) scale(${breathe})`,
          transformOrigin: "top center",
          opacity,
          filter: "drop-shadow(3px 4px 6px rgba(0,0,0,0.3))",
          willChange: "transform, opacity",
        }}
      >
        <svg
          width={baseSize * 0.65}
          height={baseSize}
          viewBox="0 0 130 185"
          fill="none"
        >
          {/* Paper shadow */}
          <path
            d={paperPath}
            fill="#1a1a1a"
            opacity="0.15"
            transform="translate(3, 3)"
          />

          {/* Paper body — cream/aged color */}
          <path
            d={paperPath}
            fill="#f5e6c8"
            stroke="#c4a97d"
            strokeWidth="0.5"
          />

          {/* Aged paper texture — subtle grain spots */}
          <circle cx={40} cy={60} r={12} fill="#d4b896" opacity={stainOpacity} />
          <circle cx={42} cy={58} r={10} fill="none" stroke="#c4a97d" strokeWidth="0.5" opacity={stainOpacity * 1.5} />
          <circle cx={85} cy={130} r={6} fill="#d4b896" opacity={stainOpacity * 0.7} />

          {/* Fold crease line */}
          <line
            x1={paperLeft + 2} y1={(paperTop + paperBottom) / 2}
            x2={paperRight - 2} y2={(paperTop + paperBottom) / 2 + 1}
            stroke="#c4a97d"
            strokeWidth="0.3"
            opacity="0.3"
          />

          {/* Title line (first line bolder, shorter — like a title) */}
          <path
            d={`M ${lineMarginLeft},${paperTop + 12} L ${lineMarginLeft + 40},${paperTop + 12}`}
            stroke="#2a2218"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.7"
          />

          {/* Handwriting lines */}
          {lines}

          {/* Pin/tack */}
          <circle cx={pinX} cy={pinY} r={4} fill="#8b4513" stroke="#5a2d0c" strokeWidth="0.8" />
          <circle cx={pinX - 1} cy={pinY - 1} r={1.5} fill="#c4a97d" opacity="0.5" />
          {/* Pin shadow on paper */}
          <ellipse cx={pinX + 1} cy={pinY + 5} rx={3} ry={1.5} fill="#000" opacity="0.08" />

          {/* Corner curl — bottom right */}
          <path
            d={`M ${paperRight},${paperBottom - 12} Q ${paperRight + 2},${paperBottom - 5} ${paperRight - 5},${paperBottom - 1}`}
            fill="#e8d5b0"
            stroke="#c4a97d"
            strokeWidth="0.3"
            opacity="0.5"
          />
        </svg>
      </div>
    </div>
  );
};
