/**
 * SceneCrossfade -- within-song transition between shader scenes.
 *
 * Supports 5 styles:
 *   - flash (default): white blast -> blackout -> eruption (30 frames)
 *   - dissolve: simple opacity crossfade over full duration
 *   - morph: both scenes visible at 50% for middle third, smooth in/out
 *   - void: fade to black then fade in (no white flash)
 *   - distortion: horizontal scanline displacement during transition
 */

import React from "react";
import { interpolate, Easing, useCurrentFrame } from "remotion";
import type { SceneTransitionStyle } from "../utils/transition-selector";

interface Props {
  /** Progress through the crossfade: 0 = fully outgoing, 1 = fully incoming */
  progress: number;
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
  /** Frame index of the beat to flash on (beat-synced transition) */
  flashFrame?: number;
  /** Transition style (default: "flash") */
  style?: SceneTransitionStyle;
}

export const SceneCrossfade: React.FC<Props> = ({ progress, outgoing, incoming, flashFrame, style = "dissolve" }) => {
  const frame = useCurrentFrame();

  // Beat flash (additional, on top of transition flash)
  let beatFlash = 0;
  if (flashFrame !== undefined) {
    const framesSinceFlash = frame - flashFrame;
    if (framesSinceFlash >= 0 && framesSinceFlash < 3) {
      beatFlash = 0.8 * Math.exp(-framesSinceFlash * 1.5);
    }
  }

  // --- Dissolve/Morph style ---
  // Clean switch at 65% progress — outgoing stays longer, no opacity dip, no flash.
  if (style === "dissolve" || style === "morph") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          {progress < 0.65 ? outgoing : incoming}
        </div>
      </div>
    );
  }

  // --- Void style ---
  if (style === "void") {
    const blackOpacity = interpolate(progress, [0.3, 0.5, 0.7], [0, 0.9, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          {progress < 0.5 ? outgoing : incoming}
        </div>
        {blackOpacity > 0.01 && (
          <div style={{ position: "absolute", inset: 0, backgroundColor: "#000", opacity: blackOpacity, pointerEvents: "none" }} />
        )}
      </div>
    );
  }

  // --- Distortion style ---
  if (style === "distortion") {
    const displacementIntensity = interpolate(progress, [0, 0.5, 1], [0, 1, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    const displacement = Math.sin(frame * 0.3) * displacementIntensity * 20;
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div style={{
            position: "absolute", inset: 0,
            transform: displacementIntensity > 0.05 ? `translateX(${displacement.toFixed(1)}px)` : undefined,
          }}>
          {progress < 0.5 ? outgoing : incoming}
        </div>
      </div>
    );
  }

  // --- Flash style (default) ---
  // 30-frame transition broken into 3 phases:
  // Flash (0-0.067): white blast, screen blend, rapid decay
  // Blackout (0.067-0.333): near-black overlay
  // Eruption (0.333-1.0): incoming scene smoothstep in, darkness fades
  const flashIntensity = interpolate(progress, [0, 0.033, 0.067], [0, 0.8, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const blackoutOpacity = interpolate(progress, [0.033, 0.067, 0.333, 1.0], [0, 0.8, 0.56, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  const outOpacity = interpolate(progress, [0, 0.067], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  const inOpacity = interpolate(progress, [0.333, 1.0], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const totalFlash = Math.min(1, flashIntensity + beatFlash);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", inset: 0 }}>
        {progress < 0.333 ? outgoing : incoming}
      </div>
      {blackoutOpacity > 0.01 && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#000", opacity: blackoutOpacity, pointerEvents: "none" }} />
      )}
      {totalFlash > 0.01 && (
        <div style={{ position: "absolute", inset: 0, backgroundColor: "#fff", opacity: totalFlash, mixBlendMode: "screen", pointerEvents: "none" }} />
      )}
    </div>
  );
};
