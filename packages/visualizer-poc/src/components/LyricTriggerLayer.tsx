/**
 * LyricTriggerLayer — renders curated visuals (images/videos) timed to
 * specific lyric phrases. Sits at Layer 0.8 (above SceneVideoLayer).
 *
 * When a trigger fires (phrase is sung), the corresponding visual fades in
 * with a dark backdrop, holds for the configured duration, then fades out.
 * During the trigger window, SceneVideoLayer yields via suppressedRanges.
 *
 * Videos use the freeze-play pattern: enter frozen, start playback once
 * ~15% visible, fade out before the video's natural end.
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

const FADE_FRAMES = 90; // 3-second fade in/out
const VIDEO_DURATION_FRAMES = 450; // 15-second max video playback
const VIDEO_TAIL_FADE = 90; // 3-second tail fade before video end
const PLAY_THRESHOLD = 0.15; // start playback at 15% opacity

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
        frame >= w.frameStart - FADE_FRAMES &&
        frame < w.frameEnd + FADE_FRAMES,
    );
  }, [windows, frame]);

  if (!active) return null;

  // Smoothstep fade envelope
  const fadeIn = smoothstep(
    active.frameStart - FADE_FRAMES,
    active.frameStart,
    frame,
  );
  const fadeOut =
    1 - smoothstep(active.frameEnd, active.frameEnd + FADE_FRAMES, frame);
  const envelope = Math.min(fadeIn, fadeOut);

  if (envelope < 0.01) return null;

  const backdropOpacity = envelope * 0.45;
  const isImage = active.mediaType === "image";
  const mediaOpacity = envelope * active.opacity;

  const filterStr = isImage
    ? "blur(1px) saturate(0.9)"
    : "blur(0.5px) saturate(0.9)";

  // ─── Video: freeze-play pattern ───
  if (!isImage) {
    const playStartFrame =
      active.frameStart - Math.floor(FADE_FRAMES * (1 - PLAY_THRESHOLD));
    const isFrozen = frame < playStartFrame;
    const videoEndFrame = playStartFrame + VIDEO_DURATION_FRAMES;

    // Don't render past the video's natural end
    if (frame >= videoEndFrame) return null;

    // Tail fade: smoothly exit before last frame
    const tailFade =
      1 -
      smoothstep(
        videoEndFrame - VIDEO_TAIL_FADE,
        videoEndFrame,
        frame,
      );
    const effectiveOpacity = mediaOpacity * Math.min(1, tailFade);

    const seqFrom = playStartFrame;
    const seqDuration = videoEndFrame - seqFrom;

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
          {isFrozen ? (
            <Sequence
              from={seqFrom}
              durationInFrames={seqDuration}
              layout="none"
            >
              <Freeze frame={0}>
                <OffthreadVideo
                  src={staticFile(active.visual)}
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </Freeze>
            </Sequence>
          ) : (
            <Sequence
              from={seqFrom}
              durationInFrames={seqDuration}
              layout="none"
            >
              <OffthreadVideo
                src={staticFile(active.visual)}
                muted
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
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
