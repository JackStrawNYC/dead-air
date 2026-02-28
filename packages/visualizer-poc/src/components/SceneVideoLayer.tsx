/**
 * SceneVideoLayer — atmospheric videos and images that blend into the
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
 * Supports both legacy SceneVideo[] and new ResolvedMedia[] from the
 * media resolver. Priority scheduling assigns song-specific assets to
 * the best-scoring sections, general assets fill the rest.
 *
 * Videos are muted — concert audio is the soundtrack.
 */

import React, { useMemo } from "react";
import { Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate } from "remotion";
import type { SceneVideo, SectionBoundary, EnhancedFrameData } from "../data/types";
import type { ResolvedMedia } from "../data/media-resolver";
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

// ─── Unified media item for scheduling ───

interface MediaItem {
  src: string;
  mediaType: "image" | "video";
  priority: number; // 0 = song video, 1 = song image, 2 = general video, 3 = general image
}

interface MediaWindow {
  frameStart: number;
  frameEnd: number;
  media: MediaItem;
}

// ─── Ken Burns image display ───

const ImageMediaDisplay: React.FC<{
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

interface SceneVideoLayerProps {
  /** Legacy prop: explicit scene videos from setlist.json */
  videos?: SceneVideo[];
  /** New: auto-resolved prioritized media from catalog */
  media?: ResolvedMedia[];
  sections: SectionBoundary[];
  frames: EnhancedFrameData[];
  trackId: string;
  showSeed?: number;
  /** Palette hue rotation in degrees (matches overlay layer) */
  hueRotation?: number;
}

// ─── Section scoring (shared logic) ───

function scoreSections(
  sections: SectionBoundary[],
  frames: EnhancedFrameData[],
): { section: SectionBoundary; idx: number; score: number }[] {
  return sections.map((section, idx) => {
    let score = 0;
    if (section.energy === "low") score += 3;
    else if (section.energy === "mid") score += 2;
    else score += 1;

    const sectionLen = section.frameEnd - section.frameStart;
    score += Math.min(2, sectionLen / 3000);

    // Post-climax comedown bonus
    if (idx > 0 && sections[idx - 1].energy === "high" && section.energy === "low") {
      score += 3;
    }

    // Texture-aware bonus
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

    // Too short for a full window
    if (sectionLen < VIDEO_DISPLAY_FRAMES + FADE_FRAMES * 2) score -= 2;

    return { section, idx, score };
  });
}

function placeMediaInSection(
  section: SectionBoundary,
  media: MediaItem,
): MediaWindow {
  const sectionLen = section.frameEnd - section.frameStart;
  const displayLen = Math.min(VIDEO_DISPLAY_FRAMES, sectionLen - FADE_FRAMES);
  const center = section.frameStart + Math.floor(sectionLen / 2);
  const frameStart = Math.max(section.frameStart, center - Math.floor(displayLen / 2));
  const frameEnd = frameStart + displayLen;
  return { frameStart, frameEnd, media };
}

// ─── Component ───

export const SceneVideoLayer: React.FC<SceneVideoLayerProps> = ({
  videos,
  media,
  sections,
  frames,
  trackId,
  showSeed,
  hueRotation = 0,
}) => {
  const frame = useCurrentFrame();

  const windows = useMemo(() => {
    if (sections.length === 0) return [];

    // Normalize into unified MediaItem list
    let items: MediaItem[];

    if (media && media.length > 0) {
      // New path: auto-resolved media with priority scheduling
      items = media.map((m) => ({
        src: m.src,
        mediaType: m.mediaType,
        priority: m.priority,
      }));
    } else if (videos && videos.length > 0) {
      // Legacy path: all treated as priority 0 videos
      items = videos.map((v) => ({
        src: v.src,
        mediaType: "video" as const,
        priority: 0,
      }));
    } else {
      return [];
    }

    // Score sections by suitability for media display
    const scored = scoreSections(sections, frames);
    scored.sort((a, b) => b.score - a.score);

    const totalFrames = sections[sections.length - 1].frameEnd;
    const maxSlots = Math.max(1, Math.floor(totalFrames / 600));

    // Split media into song-specific (priority 0-1) and general (priority 2-3)
    const songSpecific = items.filter((m) => m.priority <= 1);
    const general = items.filter((m) => m.priority >= 2);

    // Shuffle general pool with seeded PRNG (song-specific keep natural order)
    const rng = seeded(hashString(trackId) + (showSeed ?? 0) + 9973);
    const shuffledGeneral = [...general];
    for (let i = shuffledGeneral.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledGeneral[i], shuffledGeneral[j]] = [shuffledGeneral[j], shuffledGeneral[i]];
    }

    // Assign: best sections → song-specific first, then general
    const orderedMedia = [...songSpecific, ...shuffledGeneral];
    const slotCount = Math.min(orderedMedia.length, maxSlots, scored.length);

    const selectedSections = scored
      .slice(0, slotCount)
      .filter((s) => s.score > 0)
      .sort((a, b) => a.idx - b.idx);

    // Re-sort by score for assignment (best section → best media)
    const byScoredOrder = [...selectedSections].sort((a, b) => b.score - a.score);

    const result: MediaWindow[] = [];
    for (let i = 0; i < byScoredOrder.length && i < orderedMedia.length; i++) {
      result.push(placeMediaInSection(byScoredOrder[i].section, orderedMedia[i]));
    }

    // Sort windows chronologically for rendering
    result.sort((a, b) => a.frameStart - b.frameStart);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps — frames is stable (analysis JSON ref)
  }, [videos, media, sections, trackId, showSeed]);

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

  // Inverse energy: media FILLS the quiet, RECEDES at peaks
  const frameIdx = Math.min(Math.max(0, frame), frames.length - 1);
  const energy = frames[frameIdx]?.rms ?? 0.1;
  const energyBoost = 1.0 - energyToFactor(energy, 0.05, 0.30) * 0.65;

  const opacity = fadeEnvelope * energyBoost * 0.70; // 70% quiet, ~25% peaks

  // Build filter: light blur to soften + palette hue rotation to match visual field
  const filters: string[] = ["blur(0.5px)"];
  if (hueRotation !== 0) {
    filters.push(`hue-rotate(${hueRotation.toFixed(1)}deg)`);
  }

  // Window start including fade-in lead time
  const windowStart = activeWindow.frameStart - FADE_FRAMES;
  // Total display duration (fade-in + display + fade-out)
  const windowDuration = (activeWindow.frameEnd + FADE_FRAMES) - windowStart;

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
      {activeWindow.media.mediaType === "video" ? (
        <Sequence from={windowStart} durationInFrames={windowDuration} layout="none">
          <OffthreadVideo
            src={staticFile(activeWindow.media.src)}
            muted
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </Sequence>
      ) : (
        <ImageMediaDisplay
          src={activeWindow.media.src}
          frame={frame}
          windowStart={activeWindow.frameStart}
          windowEnd={activeWindow.frameEnd}
        />
      )}
    </div>
  );
};
