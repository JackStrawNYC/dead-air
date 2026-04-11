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

  // Beat flash (subtle glow, NOT a strobe). Original was 80% white over 2 frames
  // which violates photosensitive guidelines (>3Hz). Now 25% over 8 frames (267ms)
  // — perceptible as a warm pulse, not a seizure-inducing strobe.
  let beatFlash = 0;
  if (flashFrame !== undefined) {
    const framesSinceFlash = frame - flashFrame;
    if (framesSinceFlash >= 0 && framesSinceFlash < 8) {
      beatFlash = 0.25 * Math.exp(-framesSinceFlash * 0.5);
    }
  }

  // --- Dissolve style ---
  // True opacity crossfade: outgoing fades out while incoming fades in.
  // Both scenes render simultaneously during the blend for a smooth transition.
  if (style === "dissolve") {
    const outOpacityD = interpolate(progress, [0, 0.4, 0.8], [1, 0.9, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.ease),
    });
    const inOpacityD = interpolate(progress, [0.15, 0.6, 1.0], [0, 0.3, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.ease),
    });
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {outOpacityD > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: outOpacityD }}>
            {outgoing}
          </div>
        )}
        {inOpacityD > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: inOpacityD }}>
            {incoming}
          </div>
        )}
      </div>
    );
  }

  // --- Morph style ---
  // Extended crossfade with longer overlap: both scenes visible at ~50% for the
  // middle portion, creating an organic blend between visual worlds.
  if (style === "morph") {
    const outOpacityM = interpolate(progress, [0, 0.3, 0.7, 1.0], [1, 0.8, 0.3, 0], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    const inOpacityM = interpolate(progress, [0, 0.3, 0.7, 1.0], [0, 0.3, 0.8, 1], {
      extrapolateLeft: "clamp", extrapolateRight: "clamp",
    });
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {outOpacityM > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: outOpacityM }}>
            {outgoing}
          </div>
        )}
        {inOpacityM > 0.01 && (
          <div style={{ position: "absolute", inset: 0, opacity: inOpacityM }}>
            {incoming}
          </div>
        )}
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

  // --- Flash style ---
  // Softened for photosensitive safety. Original was 80% white over 2 frames
  // (violates ITC guidelines: >3Hz). Now 30% white over 6+ frames (~200ms),
  // a warm bloom rather than a strobe.
  const flashIntensity = interpolate(progress, [0, 0.067, 0.20], [0, 0.30, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  const blackoutOpacity = interpolate(progress, [0.067, 0.20, 0.40, 1.0], [0, 0.50, 0.35, 0], {
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
