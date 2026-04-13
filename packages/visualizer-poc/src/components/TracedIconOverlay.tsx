/**
 * TracedIconOverlay — generic component that takes hand-traced SVG path data
 * for any Dead icon (bears, stealie, terrapins, skeleton, roses, bolt) and
 * animates it with audio reactivity.
 *
 * The geometry comes from TRACED ARTWORK (vector editor export), not math.
 * This component handles:
 *   - Rendering the SVG paths at any size
 *   - Audio-reactive breathing (organic scale pulse from slowEnergy)
 *   - Beat-synced glow pulse
 *   - Color shifting with chromaHue
 *   - Opacity from energy
 *   - Subtle rotation drift
 *   - Onset flash
 *
 * Usage:
 *   import { STEALIE_PATHS } from "../data/traced-icons/stealie";
 *   <TracedIconOverlay frames={frames} icon={STEALIE_PATHS} />
 *
 * To add a new icon:
 *   1. Open reference image in Inkscape/Illustrator
 *   2. Trace the outlines as SVG paths
 *   3. Export the path `d` attributes
 *   4. Create a TracedIconData object with the paths, viewBox, and colors
 *   5. Pass it to this component
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Icon data types                                                    */
/* ------------------------------------------------------------------ */

export interface IconPath {
  /** SVG path `d` attribute — the traced geometry */
  d: string;
  /** Fill color. Use "PRIMARY", "SECONDARY", "ACCENT" for palette-mapped colors */
  fill: string;
  /** Stroke color. Use "OUTLINE" for the standard black outline */
  stroke?: string;
  /** Stroke width in viewBox units */
  strokeWidth?: number;
  /** Fill rule */
  fillRule?: "nonzero" | "evenodd";
}

export interface TracedIconData {
  /** Name for identification */
  name: string;
  /** SVG viewBox dimensions — the coordinate space the paths were traced in */
  viewBox: { width: number; height: number };
  /** Ordered list of paths (back to front render order) */
  paths: IconPath[];
  /** Default color mapping */
  colors: {
    PRIMARY: string;      // main fill (e.g., bear body color, stealie red)
    SECONDARY: string;    // secondary fill (e.g., collar, stealie blue)
    ACCENT: string;       // accent (e.g., bolt gold, bear belly)
    OUTLINE: string;      // outline color (usually black)
  };
  /** Size as fraction of viewport min dimension. Default 0.35 */
  scale?: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
  icon: TracedIconData;
  /** Override scale. Default uses icon.scale or 0.35 */
  scale?: number;
  /** Override position. Default center */
  position?: { x: number; y: number };
  /** Cycle timing. Default 2400 total, 780 visible */
  cycleTotal?: number;
  visibleDuration?: number;
}

export const TracedIconOverlay: React.FC<Props> = ({
  frames,
  icon,
  scale: scaleOverride,
  position,
  cycleTotal = 2400,
  visibleDuration = 780,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const tempoFactor = useTempoFactor();
  const snap = useAudioSnapshot(frames);

  // Cycle gating
  const cycleFrame = frame % cycleTotal;
  if (cycleFrame >= visibleDuration) return null;
  const progress = cycleFrame / visibleDuration;
  const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const masterOpacity = Math.min(fadeIn, fadeOut) * 0.92;
  if (masterOpacity < 0.01) return null;

  // Size
  const baseScale = scaleOverride ?? icon.scale ?? 0.35;
  const minDim = Math.min(width, height);
  const iconSize = minDim * baseScale;

  // Position
  const cx = position?.x ?? width / 2;
  const cy = position?.y ?? height / 2;

  // Audio drives
  const slowE = snap.slowEnergy;
  const energy = snap.energy;
  const beatD = snap.beatDecay;
  const onset = snap.onsetEnvelope;
  const chromaHue = snap.chromaHue;

  // Breathing — organic scale pulse from slowEnergy
  const breathe = 1.0 + Math.sin(frame * 0.015 * tempoFactor) * 0.03 * (0.5 + slowE);
  const beatPulse = 1.0 + beatD * 0.02;
  const totalScale = breathe * beatPulse;

  // Subtle rotation drift
  const rotation = Math.sin(frame * 0.003 * tempoFactor) * 1.5;

  // Glow intensity from energy — subtle, don't overpower
  const glowRadius = 6 + energy * 12;
  const glowOpacity = 0.08 + slowE * 0.15;

  // Onset flash
  const flashOpacity = onset > 0.5 ? (onset - 0.5) * 0.3 : 0;

  // ChromaHue color shift — reduced to avoid desaturation
  const hueShift = (chromaHue - 180) * 0.08;

  // Resolve color tokens to actual colors
  function resolveColor(color: string): string {
    if (color === "PRIMARY") return icon.colors.PRIMARY;
    if (color === "SECONDARY") return icon.colors.SECONDARY;
    if (color === "ACCENT") return icon.colors.ACCENT;
    if (color === "OUTLINE") return icon.colors.OUTLINE;
    return color;
  }

  const vb = icon.viewBox;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        width: iconSize,
        height: iconSize * (vb.height / vb.width),
        transform: `translate(${(cx - width / 2)}px, ${(cy - height / 2)}px) scale(${totalScale}) rotate(${rotation}deg)`,
        opacity: masterOpacity,
        filter: `hue-rotate(${hueShift}deg)`,
        willChange: "transform, opacity, filter",
      }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${vb.width} ${vb.height}`}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Glow filter for beat pulse */}
            <filter id="icon-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={glowRadius} result="blur" />
              <feColorMatrix in="blur" type="matrix"
                values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${glowOpacity} 0`} />
            </filter>
          </defs>

          {/* Glow layer — blurred copy behind */}
          <g filter="url(#icon-glow)" opacity={glowOpacity}>
            {icon.paths.map((p, i) => (
              <path key={`glow-${i}`} d={p.d} fill={resolveColor(p.fill)} />
            ))}
          </g>

          {/* Main icon paths */}
          {icon.paths.map((p, i) => (
            <path
              key={`path-${i}`}
              d={p.d}
              fill={resolveColor(p.fill)}
              stroke={p.stroke ? resolveColor(p.stroke) : undefined}
              strokeWidth={p.strokeWidth}
              fillRule={p.fillRule}
              strokeLinejoin="round"
            />
          ))}

          {/* Onset flash overlay */}
          {flashOpacity > 0.01 && (
            <rect
              width={vb.width}
              height={vb.height}
              fill={`rgba(255, 255, 240, ${flashOpacity})`}
              style={{ mixBlendMode: "screen" }}
            />
          )}
        </svg>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Factory: create a named overlay from traced icon data              */
/* ------------------------------------------------------------------ */

export function createTracedIconOverlay(
  icon: TracedIconData,
  config?: { scale?: number; cycleTotal?: number; visibleDuration?: number },
): React.FC<{ frames: EnhancedFrameData[] }> {
  const Component: React.FC<{ frames: EnhancedFrameData[] }> = ({ frames }) => (
    <TracedIconOverlay frames={frames} icon={icon} {...config} />
  );
  Component.displayName = `TracedIcon(${icon.name})`;
  return Component;
}
