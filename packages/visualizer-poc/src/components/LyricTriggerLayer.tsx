/**
 * LyricTriggerLayer — renders curated visuals (images/videos) timed to
 * specific lyric phrases. Sits at Layer 0.8 (above SceneVideoLayer).
 *
 * When a trigger fires (phrase is sung), the corresponding visual fades in
 * with a dark backdrop, holds for the configured duration, then fades out.
 * During the trigger window, SceneVideoLayer yields via suppressedRanges.
 *
 * Videos: frozen first frame during fade-in → full playback once visible →
 * smooth fade-out. This ensures all 15 seconds of motion video are used
 * without clipping the start during the opacity ramp.
 */

import React, { useMemo } from "react";
import {
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
} from "remotion";
import type { LyricTriggerWindow } from "../data/lyric-trigger-resolver";

const FADE_IN_FRAMES = 150; // 5-second fade in (slow cinematic reveal)
const FADE_OUT_FRAMES = 120; // 4-second fade out
const VIDEO_DURATION_FRAMES = 450; // 15-second video playback (full motion)
const VIDEO_TAIL_FADE = 120; // 4-second tail fade before video end

/** Double-smoothstep for extra-soft transitions */
function softFade(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  const s = t * t * (3 - 2 * t);
  return s * s * (3 - 2 * s);
}

// ─── Image display with Ken Burns ───

const TriggerImage: React.FC<{
  src: string;
  frame: number;
  windowStart: number;
  windowEnd: number;
}> = ({ src, frame, windowStart, windowEnd }) => {
  const progress = Math.max(
    0,
    Math.min(1, (frame - windowStart) / Math.max(1, windowEnd - windowStart)),
  );
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

// ─── Component ───

interface Props {
  windows: LyricTriggerWindow[];
}

export const LyricTriggerLayer: React.FC<Props> = ({ windows }) => {
  const frame = useCurrentFrame();

  // Find the active trigger window (including fade lead/tail)
  const active = useMemo(() => {
    return windows.find(
      (w) =>
        frame >= w.frameStart - FADE_IN_FRAMES &&
        frame < w.frameEnd + FADE_OUT_FRAMES,
    );
  }, [windows, frame]);

  if (!active) return null;

  // Double-smoothstep fade envelope — very gentle in/out
  const fadeIn = softFade(
    active.frameStart - FADE_IN_FRAMES,
    active.frameStart,
    frame,
  );
  const fadeOut =
    1 - softFade(active.frameEnd, active.frameEnd + FADE_OUT_FRAMES, frame);
  const envelope = Math.min(fadeIn, fadeOut);

  if (envelope < 0.01) return null;

  // Backdrop darkens slightly ahead of the media for a cinematic "lights down" feel
  const backdropEnvelope = softFade(
    active.frameStart - FADE_IN_FRAMES,
    active.frameStart - Math.floor(FADE_IN_FRAMES * 0.3),
    frame,
  ) * (1 - softFade(active.frameEnd + Math.floor(FADE_OUT_FRAMES * 0.3), active.frameEnd + FADE_OUT_FRAMES, frame));
  const backdropOpacity = backdropEnvelope * 0.40;

  const isImage = active.mediaType === "image";
  const mediaOpacity = envelope * active.opacity;

  const filterStr = isImage
    ? "blur(1px) saturate(0.9)"
    : "blur(0.5px) saturate(0.95)";

  // ─── Video: frozen reveal → full playback → smooth exit ───
  if (!isImage) {
    // Phase 1 (fade-in): frozen first frame, opacity ramps up
    // Phase 2 (play): video plays from frame 0 once fully visible
    // Phase 3 (tail fade): smooth exit before video ends
    const playStartFrame = active.frameStart - 60; // start motion 2s before full opacity
    const videoEndFrame = playStartFrame + VIDEO_DURATION_FRAMES;
    const isPlayPhase = frame >= playStartFrame;

    // Don't render past the video's natural end + fade out
    if (frame >= videoEndFrame + FADE_OUT_FRAMES) return null;

    // Tail fade: smoothly exit before video ends
    const tailFade =
      1 -
      softFade(
        videoEndFrame - VIDEO_TAIL_FADE,
        videoEndFrame,
        frame,
      );
    const effectiveOpacity = mediaOpacity * Math.min(1, tailFade);

    const videoSrc = staticFile(active.visual);
    const videoStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
      objectFit: "cover",
    };

    return (
      <>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#000",
            opacity: backdropOpacity,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: effectiveOpacity,
            overflow: "hidden",
            pointerEvents: "none",
            filter: filterStr,
          }}
        >
          {isPlayPhase ? (
            // Full playback — video starts from its beginning at playStartFrame
            <Sequence
              from={playStartFrame}
              durationInFrames={VIDEO_DURATION_FRAMES}
              layout="none"
            >
              <OffthreadVideo src={videoSrc} muted style={videoStyle} />
            </Sequence>
          ) : (
            // Frozen first frame during fade-in (preserves full 15s of motion for later)
            <Sequence
              from={active.frameStart - FADE_IN_FRAMES}
              durationInFrames={FADE_IN_FRAMES}
              layout="none"
            >
              <Freeze frame={0}>
                <OffthreadVideo src={videoSrc} muted style={videoStyle} />
              </Freeze>
            </Sequence>
          )}
        </div>
      </>
    );
  }

  // ─── Image: Ken Burns ───
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#000",
          opacity: backdropOpacity,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: mediaOpacity,
          overflow: "hidden",
          pointerEvents: "none",
          filter: filterStr,
        }}
      >
        <TriggerImage
          src={active.visual}
          frame={frame}
          windowStart={active.frameStart}
          windowEnd={active.frameEnd}
        />
      </div>
    </>
  );
};
