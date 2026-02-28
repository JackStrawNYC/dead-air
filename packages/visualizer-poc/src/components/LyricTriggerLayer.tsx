/**
 * LyricTriggerLayer — lyric-triggered visual crossfades at Layer 0.8.
 *
 * Sits between SceneVideoLayer (0.7) and the dynamic overlay stack (1-10).
 * Crossfades curated visuals at the exact moment a key lyric is sung,
 * with a pre-roll anticipation build so the visual is already on screen
 * when the lyric hits.
 *
 * Transition types:
 *   - crossfade: smoothstep fade in over pre-roll, smoothstep out after hold
 *   - hard_cut: instant snap at lyric moment / hold end
 *   - dip_to_black: fade to black over first half of pre-roll, then appear
 *   - dissolve: wider smoothstep (extended range)
 *
 * Energy modulation (less aggressive than SceneVideoLayer):
 *   - Quiet: ~85% opacity (triggers should dominate during their moment)
 *   - Peaks: ~50% (still visible, not crushed like scene videos)
 */

import React from "react";
import {
  useCurrentFrame,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  interpolate,
} from "remotion";
import type { ResolvedTriggerWindow, TransitionType } from "../data/lyric-trigger-resolver";
import type { EnhancedFrameData } from "../data/types";
import { energyToFactor } from "../utils/energy";

// ─── Smoothstep ───

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─── Fade envelope by transition type ───

function computeFadeIn(
  frame: number,
  window: ResolvedTriggerWindow,
): number {
  const { fadeInStart, fullStart, transitionIn } = window;

  switch (transitionIn) {
    case "hard_cut":
      return frame >= fullStart ? 1 : 0;

    case "dip_to_black":
      // Dark gap in first half of pre-roll, then appear in second half
      if (frame < fadeInStart) return 0;
      const midpoint = fadeInStart + (fullStart - fadeInStart) * 0.5;
      if (frame < midpoint) return 0;
      return smoothstep(midpoint, fullStart, frame);

    case "dissolve":
      // Wider smoothstep — starts earlier, extends ±30 frames
      return smoothstep(fadeInStart - 30, fullStart + 30, frame);

    case "crossfade":
    default:
      return smoothstep(fadeInStart, fullStart, frame);
  }
}

function computeFadeOut(
  frame: number,
  window: ResolvedTriggerWindow,
): number {
  const { fadeOutStart, fadeOutEnd, transitionOut } = window;

  switch (transitionOut) {
    case "hard_cut":
      return frame < fadeOutStart ? 1 : 0;

    case "dip_to_black":
      return 1 - smoothstep(fadeOutStart, fadeOutEnd, frame);

    case "dissolve":
      return 1 - smoothstep(fadeOutStart - 30, fadeOutEnd + 30, frame);

    case "crossfade":
    default:
      return 1 - smoothstep(fadeOutStart, fadeOutEnd, frame);
  }
}

// ─── Ken Burns for images ───

const TriggerImage: React.FC<{
  src: string;
  frame: number;
  windowStart: number;
  windowEnd: number;
}> = ({ src, frame, windowStart, windowEnd }) => {
  const windowLen = windowEnd - windowStart;
  const progress = Math.max(0, Math.min(1, (frame - windowStart) / Math.max(1, windowLen)));

  // Ken Burns: scale 1.0 → 1.06 + drift -8px
  const scale = 1.0 + progress * 0.06;
  const translateX = -progress * 8;

  return (
    <Img
      src={staticFile(src)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${scale}) translateX(${translateX}px)`,
        willChange: "transform",
      }}
    />
  );
};

// ─── Props ───

interface LyricTriggerLayerProps {
  windows: ResolvedTriggerWindow[];
  frames: EnhancedFrameData[];
}

// ─── Component ───

export const LyricTriggerLayer: React.FC<LyricTriggerLayerProps> = ({
  windows,
  frames,
}) => {
  const frame = useCurrentFrame();

  // Find active window for current frame
  const activeWindow = windows.find(
    (w) => frame >= w.fadeInStart && frame < w.fadeOutEnd,
  );

  if (!activeWindow) return null;

  // Compute fade envelope
  const fadeIn = computeFadeIn(frame, activeWindow);
  const fadeOut = computeFadeOut(frame, activeWindow);
  const fadeEnvelope = Math.min(fadeIn, fadeOut);

  if (fadeEnvelope <= 0) return null;

  // Energy modulation (less aggressive than SceneVideoLayer)
  // Triggers should dominate during their moment
  const frameIdx = Math.min(Math.max(0, frame), frames.length - 1);
  const energy = frames[frameIdx]?.rms ?? 0.1;
  const energyBoost = 1.0 - energyToFactor(energy, 0.08, 0.35) * 0.35;

  const opacity = fadeEnvelope * energyBoost * activeWindow.opacity;

  // Window timing for Sequence
  const windowStart = activeWindow.fadeInStart;
  const windowDuration = activeWindow.fadeOutEnd - activeWindow.fadeInStart;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        mixBlendMode: activeWindow.blendMode as React.CSSProperties["mixBlendMode"],
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {activeWindow.mediaType === "video" ? (
        <Sequence from={windowStart} durationInFrames={windowDuration} layout="none">
          <OffthreadVideo
            src={staticFile(activeWindow.visual)}
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </Sequence>
      ) : (
        <TriggerImage
          src={activeWindow.visual}
          frame={frame}
          windowStart={activeWindow.fadeInStart}
          windowEnd={activeWindow.fadeOutEnd}
        />
      )}
    </div>
  );
};
