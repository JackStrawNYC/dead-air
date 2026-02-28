/**
 * SceneVideoLayer — atmospheric AI-generated videos that blend into the
 * shader like projected light. Sits at Layer 0.7.
 *
 * Blending strategy:
 *   - `mix-blend-mode: lighten` — natural compositing, no blown highlights
 *   - 0.5px blur softens HD footage into the organic shader texture
 *   - 5-second smoothstep fades (glacial, like the shader breathing)
 *   - Max ~70% opacity — primary visual during quiet, recedes at peaks
 *   - Palette hue-rotate matches the rest of the visual field
 *   - Inverse energy: quieter = MORE visible, louder = shader dominates
 *
 * Videos are muted — concert audio is the soundtrack.
 */

import React, { useMemo } from "react";
import { OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import type { SceneVideo, SectionBoundary, EnhancedFrameData } from "../data/types";
import { seeded } from "../utils/seededRandom";
import { energyToFactor, computeSmoothedEnergy } from "../utils/energy";
import { detectTexture } from "../utils/climax-state";
import { computeAudioSnapshot } from "../utils/audio-reactive";

const VIDEO_DISPLAY_FRAMES = 600; // 20 seconds at 30fps
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

    // Score each section — low energy scores highest, mid gets video too
    const scored = sections.map((section, idx) => {
      let score = 0;
      if (section.energy === "low") score += 3;
      else if (section.energy === "mid") score += 2;
      else score += 1; // high sections can get video too (lower priority)

      const sectionLen = section.frameEnd - section.frameStart;
      score += Math.min(2, sectionLen / 3000);

      // Post-climax comedown: high→low transition bonus
      if (idx > 0 && sections[idx - 1].energy === "high" && section.energy === "low") {
        score += 3;
      }

      // Texture-aware bonus: ambient/sparse sections get video priority
      if (frames.length > 0) {
        const midFrame = Math.min(
          Math.floor((section.frameStart + section.frameEnd) / 2),
          frames.length - 1,
        );
        const midSnapshot = computeAudioSnapshot(frames, midFrame);
        const midEnergy = computeSmoothedEnergy(frames, midFrame);
        const texture = detectTexture(midSnapshot, midEnergy);
        if (texture === "ambient") score += 4;
        else if (texture === "sparse") score += 3;
      }

      // Penalize last section (fade-out)
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

  // Inverse energy: videos FILL the quiet, RECEDE at peaks
  const frameIdx = Math.min(Math.max(0, frame), frames.length - 1);
  const energy = frames[frameIdx]?.rms ?? 0.1;
  const energyBoost = 1.0 - energyToFactor(energy, 0.05, 0.30) * 0.65;

  const opacity = fadeEnvelope * energyBoost * 0.70; // 70% quiet, ~25% peaks

  // Negative startFrom offsets the video so it plays from frame 0
  // starting at the composition frame when the window begins.
  // Without this, the composition frame (e.g. 5000) would seek past
  // the end of a 15-second video, showing only the last frame as static.
  const windowStart = activeWindow.frameStart - FADE_FRAMES;
  const startFrom = -windowStart;

  // Build filter: light blur to soften + palette hue rotation to match visual field
  const filters: string[] = ["blur(0.5px)"];
  if (hueRotation !== 0) {
    filters.push(`hue-rotate(${hueRotation.toFixed(1)}deg)`);
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        mixBlendMode: "lighten",
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
