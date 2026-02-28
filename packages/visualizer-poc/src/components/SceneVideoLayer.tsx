/**
 * SceneVideoLayer — atmospheric AI-generated videos that blend into the
 * shader like projected light. Sits at Layer 0.7.
 *
 * Blending strategy:
 *   - `mix-blend-mode: screen` — additive blending, dark pixels vanish
 *   - 2px blur softens HD footage into the organic shader texture
 *   - 5-second smoothstep fades (glacial, like the shader breathing)
 *   - Max ~35% opacity — tints the background, never dominates
 *   - Palette hue-rotate matches the rest of the visual field
 *   - Energy dimming: quieter = more visible, louder = shader dominates
 *
 * Videos are muted — concert audio is the soundtrack.
 */

import React, { useMemo } from "react";
import { OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import type { SceneVideo, SectionBoundary, EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";

const VIDEO_DISPLAY_FRAMES = 300; // 10 seconds at 30fps
const FADE_FRAMES = 150;          // 5-second smoothstep fade in/out

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface VideoWindow {
  frameStart: number;
  frameEnd: number;
  video: SceneVideo;
}

interface SceneVideoLayerProps {
  videos: SceneVideo[];
  sections: SectionBoundary[];
  frames: EnhancedFrameData[];
  trackId: string;
  showSeed?: number;
  /** Palette hue rotation in degrees (matches overlay layer) */
  hueRotation?: number;
}

export const SceneVideoLayer: React.FC<SceneVideoLayerProps> = ({
  videos,
  sections,
  frames,
  trackId,
  showSeed,
  hueRotation = 0,
}) => {
  const frame = useCurrentFrame();

  const windows = useMemo(() => {
    if (videos.length === 0 || sections.length === 0) return [];

    const rng = seeded(hashString(trackId) + (showSeed ?? 0) + 9973);

    // Score each section — low energy scores higher
    const scored = sections.map((section, idx) => {
      let score = 0;
      if (section.energy === "low") score += 3;
      else if (section.energy === "mid") score += 1;

      const sectionLen = section.frameEnd - section.frameStart;
      score += Math.min(2, sectionLen / 3000);

      // High→low transitions get a bonus
      if (idx > 0 && sections[idx - 1].energy === "high" && section.energy === "low") {
        score += 2;
      }

      // Penalize first section (title card overlap) and last (fade-out)
      if (idx === 0) score -= 3;
      if (idx === sections.length - 1) score -= 1;

      // Sections too short for a full video window get penalized
      if (sectionLen < VIDEO_DISPLAY_FRAMES + FADE_FRAMES * 2) score -= 2;

      return { section, idx, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const totalFrames = sections[sections.length - 1].frameEnd;
    const maxSlots = Math.max(1, Math.floor(totalFrames / 600));
    const slotCount = Math.min(videos.length, maxSlots, scored.length);

    const selectedSections = scored
      .slice(0, slotCount)
      .filter((s) => s.score > 0)
      .sort((a, b) => a.idx - b.idx);

    // Shuffle videos via Fisher-Yates with seeded PRNG
    const shuffledVideos = [...videos];
    for (let i = shuffledVideos.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledVideos[i], shuffledVideos[j]] = [shuffledVideos[j], shuffledVideos[i]];
    }

    const result: VideoWindow[] = [];
    for (let i = 0; i < selectedSections.length; i++) {
      const { section } = selectedSections[i];
      const video = shuffledVideos[i % shuffledVideos.length];
      const sectionLen = section.frameEnd - section.frameStart;

      const displayLen = Math.min(VIDEO_DISPLAY_FRAMES, sectionLen - FADE_FRAMES);
      const center = section.frameStart + Math.floor(sectionLen / 2);
      const frameStart = Math.max(section.frameStart, center - Math.floor(displayLen / 2));
      const frameEnd = frameStart + displayLen;

      result.push({ frameStart, frameEnd, video });
    }

    return result;
  }, [videos, sections, trackId, showSeed]);

  // Find the active window for the current frame
  const activeWindow = windows.find(
    (w) => frame >= w.frameStart - FADE_FRAMES && frame < w.frameEnd + FADE_FRAMES,
  );

  if (!activeWindow) return null;

  // 5-second smoothstep fade in/out
  const fadeIn = smoothstep(
    activeWindow.frameStart - FADE_FRAMES,
    activeWindow.frameStart,
    frame,
  );
  const fadeOut = 1 - smoothstep(
    activeWindow.frameEnd,
    activeWindow.frameEnd + FADE_FRAMES,
    frame,
  );
  const fadeEnvelope = Math.min(fadeIn, fadeOut);

  // Energy dimming: quieter = more visible
  const frameIdx = Math.min(Math.max(0, frame), frames.length - 1);
  const energy = frames[frameIdx]?.rms ?? 0.1;
  const energyDim = 1 - energy * 0.7;

  const opacity = fadeEnvelope * energyDim * 0.35; // Max ~35% — tint, don't dominate

  // Negative startFrom offsets the video so it plays from frame 0
  // starting at the composition frame when the window begins.
  // Without this, the composition frame (e.g. 5000) would seek past
  // the end of a 15-second video, showing only the last frame as static.
  const windowStart = activeWindow.frameStart - FADE_FRAMES;
  const startFrom = -windowStart;

  // Build filter: blur to soften + palette hue rotation to match visual field
  const filters: string[] = ["blur(2px)"];
  if (hueRotation !== 0) {
    filters.push(`hue-rotate(${hueRotation.toFixed(1)}deg)`);
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        mixBlendMode: "screen",
        overflow: "hidden",
        pointerEvents: "none",
        filter: filters.join(" "),
      }}
    >
      <OffthreadVideo
        src={staticFile(activeWindow.video.src)}
        muted
        startFrom={startFrom}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    </div>
  );
};
