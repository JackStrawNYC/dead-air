/**
 * SceneCrossfade — flash→blackout→eruption transition between scenes.
 * 30-frame (1s) dramatic transition: white blast, near-blackout, eruption.
 * Replaces the old gentle 90-frame crossfade with an event-like transition.
 */

import React from "react";
import { interpolate, Easing, useCurrentFrame } from "remotion";

interface Props {
  /** Progress through the crossfade: 0 = fully outgoing, 1 = fully incoming */
  progress: number;
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
  /** Frame index of the beat to flash on (beat-synced transition) */
  flashFrame?: number;
}

export const SceneCrossfade: React.FC<Props> = ({ progress, outgoing, incoming, flashFrame }) => {
  const frame = useCurrentFrame();

  // 30-frame transition broken into 3 phases:
  // Flash (0-2/30 = 0-0.067): white blast, screen blend, rapid decay
  // Blackout (2-10/30 = 0.067-0.333): near-black overlay
  // Eruption (10-30/30 = 0.333-1.0): incoming scene smoothstep in, darkness fades

  // Flash phase: white blast at transition start
  const flashIntensity = interpolate(progress, [0, 0.033, 0.067], [0, 0.8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Blackout phase: near-black overlay during transition
  const blackoutOpacity = interpolate(progress, [0.033, 0.067, 0.333, 1.0], [0, 0.8, 0.56, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  // Outgoing scene: hard cut after flash
  const outOpacity = interpolate(progress, [0, 0.067], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Incoming scene: eruption from blackout
  const inOpacity = interpolate(progress, [0.333, 1.0], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Beat flash (additional, on top of transition flash)
  let beatFlash = 0;
  if (flashFrame !== undefined) {
    const framesSinceFlash = frame - flashFrame;
    if (framesSinceFlash >= 0 && framesSinceFlash < 3) {
      beatFlash = 0.8 * Math.exp(-framesSinceFlash * 1.5);
    }
  }

  const totalFlash = Math.min(1, flashIntensity + beatFlash);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Outgoing scene */}
      {outOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: outOpacity,
          }}
        >
          {outgoing}
        </div>
      )}
      {/* Incoming scene */}
      {inOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: inOpacity,
          }}
        >
          {incoming}
        </div>
      )}
      {/* Blackout overlay */}
      {blackoutOpacity > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#000",
            opacity: blackoutOpacity,
            pointerEvents: "none",
          }}
        />
      )}
      {/* Flash overlay (screen blend) */}
      {totalFlash > 0.01 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#fff",
            opacity: totalFlash,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
