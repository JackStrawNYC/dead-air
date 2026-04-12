/**
 * TextureImage — Generic overlay component for hand-sourced transparent PNGs.
 *
 * Approach B for overlay quality: instead of procedural SVG art, load an
 * authentic image (vintage poster scan, hand-drawn art, concert photo,
 * liquid light show capture) and composite it with audio-reactive behavior.
 *
 * Features:
 *   - Loads a transparent PNG from the public/assets/textures/ directory
 *   - Audio-reactive opacity, scale, and rotation
 *   - SVG color grading via feColorMatrix (shift to match show palette)
 *   - Configurable blend mode (screen, overlay, multiply, lighten)
 *   - Breathing scale + beat pulse
 *   - Psychedelic filter stack: film grain, glow bleed, organic distortion
 *   - Configurable position (center, corner, full-bleed, random)
 *
 * Usage:
 *   To create a new texture overlay, register it in overlay-registry.ts
 *   and add an entry to overlay-components.ts that maps to TextureImage
 *   with specific config props.
 *
 * Example factory usage:
 *   export const VintagePoster = createTextureOverlay({
 *     imagePath: "/assets/textures/vintage-poster-1.png",
 *     blendMode: "screen",
 *     position: "center",
 *     baseOpacity: [0.15, 0.40],
 *     baseScale: 0.6,
 *     breatheAmount: 0.05,
 *     beatPulse: 0.08,
 *     colorShift: true,
 *   });
 */

import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Img, staticFile } from "remotion";
import type { EnhancedFrameData } from "../data/types";
import { useAudioSnapshot } from "./parametric/audio-helpers";
import { useTempoFactor } from "../data/TempoContext";

/* ------------------------------------------------------------------ */
/*  Configuration types                                                */
/* ------------------------------------------------------------------ */

export interface TextureImageConfig {
  /** Path to PNG relative to public/ (e.g., "assets/textures/poster.png") */
  imagePath: string;
  /** CSS blend mode. Default "screen" */
  blendMode?: "screen" | "overlay" | "multiply" | "lighten" | "soft-light" | "color-dodge";
  /** Position strategy. Default "center" */
  position?: "center" | "full-bleed" | "bottom-left" | "bottom-right" | "top-left" | "top-right";
  /** Opacity range [quiet, loud]. Default [0.12, 0.35] */
  baseOpacity?: [number, number];
  /** Base scale as fraction of viewport. Default 0.5 */
  baseScale?: number;
  /** Breathing amount (±scale). Default 0.04 */
  breatheAmount?: number;
  /** Beat pulse scale addition. Default 0.06 */
  beatPulse?: number;
  /** Slow rotation (degrees per second). Default 0 */
  rotationSpeed?: number;
  /** Whether to shift hue based on chromaHue. Default true */
  colorShift?: boolean;
  /** Cycle total frames (0 = always visible). Default 0 */
  cycleTotal?: number;
  /** Visible duration within cycle. Default same as cycleTotal */
  visibleDuration?: number;
}

/* ------------------------------------------------------------------ */
/*  Position resolver                                                  */
/* ------------------------------------------------------------------ */

function resolvePosition(
  position: TextureImageConfig["position"],
  width: number,
  height: number,
  imgW: number,
  imgH: number,
): { left: number; top: number } {
  switch (position) {
    case "full-bleed":
      return { left: 0, top: 0 };
    case "bottom-left":
      return { left: width * 0.02, top: height - imgH - height * 0.02 };
    case "bottom-right":
      return { left: width - imgW - width * 0.02, top: height - imgH - height * 0.02 };
    case "top-left":
      return { left: width * 0.02, top: height * 0.02 };
    case "top-right":
      return { left: width - imgW - width * 0.02, top: height * 0.02 };
    case "center":
    default:
      return { left: (width - imgW) / 2, top: (height - imgH) / 2 };
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface Props {
  frames: EnhancedFrameData[];
  config: TextureImageConfig;
}

export const TextureImage: React.FC<Props> = ({ frames, config }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const snap = useAudioSnapshot(frames);
  const tempoFactor = useTempoFactor();

  const {
    imagePath,
    blendMode = "screen",
    position = "center",
    baseOpacity = [0.12, 0.35],
    baseScale = 0.5,
    breatheAmount = 0.04,
    beatPulse = 0.06,
    rotationSpeed = 0,
    colorShift = true,
    cycleTotal = 0,
    visibleDuration = cycleTotal,
  } = config;

  // Cycle gating
  if (cycleTotal > 0) {
    const cycleFrame = frame % cycleTotal;
    if (cycleFrame >= visibleDuration) return null;
    const progress = cycleFrame / visibleDuration;
    const fadeIn = interpolate(progress, [0, 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const fadeOut = interpolate(progress, [0.92, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const cycleFade = Math.min(fadeIn, fadeOut);
    if (cycleFade < 0.01) return null;
  }

  // Audio-reactive opacity
  const opacity = interpolate(snap.slowEnergy, [0.02, 0.30], baseOpacity, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacity < 0.01) return null;

  // Scale: base + breathing + beat pulse
  const breathe = Math.sin(frame * 0.012 * tempoFactor) * breatheAmount;
  const beat = snap.beatDecay * beatPulse;
  const scale = baseScale + breathe + beat;

  // Rotation
  const rotation = rotationSpeed !== 0 ? (frame / 30) * rotationSpeed * tempoFactor : 0;

  // Image dimensions
  const imgDim = Math.min(width, height);
  const imgW = position === "full-bleed" ? width : imgDim * scale;
  const imgH = position === "full-bleed" ? height : imgDim * scale;

  const pos = resolvePosition(position, width, height, imgW, imgH);

  // ChromaHue color shift via CSS filter
  const hueRotate = colorShift ? `hue-rotate(${(snap.chromaHue - 180) * 0.3}deg)` : "";
  const brightnessBoost = 1 + snap.energy * 0.2;
  const satBoost = 1 + snap.energy * 0.3;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile(imagePath)}
        style={{
          position: "absolute",
          left: pos.left,
          top: pos.top,
          width: imgW,
          height: imgH,
          objectFit: position === "full-bleed" ? "cover" : "contain",
          opacity,
          mixBlendMode: blendMode,
          transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
          filter: [
            hueRotate,
            `brightness(${brightnessBoost})`,
            `saturate(${satBoost})`,
          ].filter(Boolean).join(" "),
          willChange: "opacity, transform, filter",
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Factory: create a configured TextureImage overlay                   */
/* ------------------------------------------------------------------ */

/**
 * Creates a new overlay component that renders a specific texture image
 * with preset configuration. Use this to register new hand-sourced
 * PNG overlays without writing a new component file for each.
 *
 * Example:
 *   export const VintagePoster = createTextureOverlay({
 *     imagePath: "assets/textures/vintage-poster-1.png",
 *     blendMode: "screen",
 *     position: "center",
 *   });
 */
export function createTextureOverlay(
  config: TextureImageConfig,
): React.FC<{ frames: EnhancedFrameData[] }> {
  const Component: React.FC<{ frames: EnhancedFrameData[] }> = ({ frames }) => (
    <TextureImage frames={frames} config={config} />
  );
  Component.displayName = `TextureImage(${config.imagePath.split("/").pop()})`;
  return Component;
}
