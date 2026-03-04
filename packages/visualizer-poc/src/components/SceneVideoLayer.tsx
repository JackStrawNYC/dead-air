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
import { Freeze, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, interpolate } from "remotion";
import type { SceneVideo, SectionBoundary, EnhancedFrameData } from "../data/types";
import type { ResolvedMedia } from "../data/media-resolver";
import { seeded } from "../utils/seededRandom";
import { energyToFactor, computeSmoothedEnergy } from "../utils/energy";
import { detectTexture } from "../utils/climax-state";
import { computeAudioSnapshot } from "../utils/audio-reactive";

const VIDEO_DISPLAY_FRAMES = 600; // 20 seconds at 30fps
const FADE_FRAMES = 150;          // 5-second smoothstep fade in/out
const CURATED_FADE_FRAMES = 90;   // 3-second fade for curated media
const VIDEO_CROSSFADE = 90;       // 3-second crossfade between still and video
const VIDEO_DURATION_FRAMES = 450; // 15 seconds — generated video length

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
  energyTag?: "low" | "mid" | "high";
  durationFrames?: number; // video length in frames (default VIDEO_DURATION_FRAMES)
}

export interface MediaWindow {
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
  /** Frame ranges where a lyric trigger is active — SceneVideoLayer yields during these */
  suppressedRanges?: Array<{ start: number; end: number }>;
}

// ─── Section scoring (shared logic) ───

/**
 * Detect where the music actually ends.
 * Uses 3-second smoothed RMS to find the last window with real musical energy.
 * If there's a significant gap (>10s) between that and the track end,
 * everything after it is post-music dead air (applause/tuning/noodling).
 */
function findMusicEnd(frames: EnhancedFrameData[], totalFrames: number): number {
  if (frames.length === 0) return totalFrames;

  const MUSIC_THRESHOLD = 0.10; // Smoothed RMS above this = actual music
  const SMOOTH_WINDOW = 90;     // 3 seconds at 30fps
  const MIN_TAIL_GAP = 300;     // 10 seconds to confirm song is over

  const scanEnd = Math.min(frames.length - 1, totalFrames);

  // Find the last 3-second window with meaningful musical energy
  let lastMusicalFrame = 0;
  for (let f = scanEnd; f >= SMOOTH_WINDOW; f -= 30) {
    // Average RMS over a 3-second window centered on f
    let sum = 0;
    const windowStart = Math.max(0, f - SMOOTH_WINDOW / 2);
    const windowEnd = Math.min(scanEnd, f + SMOOTH_WINDOW / 2);
    const count = windowEnd - windowStart + 1;
    for (let w = windowStart; w <= windowEnd; w++) {
      sum += frames[w]?.rms ?? 0;
    }
    if (sum / count >= MUSIC_THRESHOLD) {
      lastMusicalFrame = f;
      break;
    }
  }

  const tailGap = totalFrames - lastMusicalFrame;
  if (tailGap >= MIN_TAIL_GAP) {
    return lastMusicalFrame;
  }

  return totalFrames;
}

function scoreSections(
  sections: SectionBoundary[],
  frames: EnhancedFrameData[],
): { section: SectionBoundary; idx: number; score: number }[] {
  const totalFrames = sections[sections.length - 1]?.frameEnd ?? 0;
  const musicEnd = findMusicEnd(frames, totalFrames);

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

    // Exclude sections in post-music dead air (applause/tuning after song ends).
    // Check both section start AND center — a section that starts before musicEnd
    // but whose center is past it would place the video during dead air.
    const sectionCenter = section.frameStart + Math.floor(sectionLen / 2);
    if (musicEnd < totalFrames && (section.frameStart >= musicEnd || sectionCenter >= musicEnd)) {
      return { section, idx, score: -Infinity };
    }

    // Too short for a full window
    if (sectionLen < VIDEO_DISPLAY_FRAMES + FADE_FRAMES * 2) score -= 2;

    // Protect song art intro — no videos in the first 15 seconds
    if (section.frameStart < 450) score -= 10;

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

// ─── Exported window computation (for media suppression in SongVisualizer) ───

const MIN_WINDOW_GAP = 600; // 20 seconds minimum between media windows

export function computeMediaWindows(
  videos: SceneVideo[] | undefined,
  media: ResolvedMedia[] | undefined,
  sections: SectionBoundary[],
  frames: EnhancedFrameData[],
  trackId: string,
  showSeed?: number,
): MediaWindow[] {
  if (sections.length === 0) return [];

  // Normalize into unified MediaItem list
  let items: MediaItem[];

  if (media && media.length > 0) {
    items = media.map((m) => ({
      src: m.src,
      mediaType: m.mediaType,
      priority: m.priority,
      energyTag: m.energyTag,
      durationFrames: m.durationFrames,
    }));
  } else if (videos && videos.length > 0) {
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
  // Scale max windows by song duration:
  //   8+ min → 4 windows (Morning Dew, Drums/Space, Estimated Prophet)
  //   4-8 min → 3 windows (most mid-length songs)
  //   < 4 min → 2 windows (Mama Tried, Lazy Lightnin')
  const durationSec = totalFrames / 30;
  const maxSlots =
    durationSec >= 480 ? 8 :
    durationSec >= 240 ? 6 :
    4;

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

  // Energy-matched assignment: when media has energy tags, prefer matching
  // the section's energy level (low video → low section, high → high).
  let result: MediaWindow[] = [];
  const usedMedia = new Set<number>();
  const usedSections = new Set<number>();

  // First pass: match energy-tagged media to same-energy sections
  for (let si = 0; si < byScoredOrder.length; si++) {
    const section = byScoredOrder[si];
    for (let mi = 0; mi < orderedMedia.length; mi++) {
      if (usedMedia.has(mi) || usedSections.has(si)) continue;
      const m = orderedMedia[mi];
      if (m.energyTag && m.energyTag === section.section.energy) {
        result.push(placeMediaInSection(section.section, m));
        usedMedia.add(mi);
        usedSections.add(si);
        break;
      }
    }
  }

  // Second pass: fill remaining slots with unmatched media (priority order)
  for (let si = 0; si < byScoredOrder.length; si++) {
    if (usedSections.has(si)) continue;
    for (let mi = 0; mi < orderedMedia.length; mi++) {
      if (usedMedia.has(mi)) continue;
      result.push(placeMediaInSection(byScoredOrder[si].section, orderedMedia[mi]));
      usedMedia.add(mi);
      usedSections.add(si);
      break;
    }
  }

  // Sort windows chronologically
  result.sort((a, b) => a.frameStart - b.frameStart);

  // Enforce minimum gap between windows — when too close, keep the
  // higher-priority media (lower priority number = more important).
  // Song-specific videos (p0) should never be dropped for general filler (p2-3).
  if (result.length >= 2) {
    const filtered: MediaWindow[] = [result[0]];
    for (let i = 1; i < result.length; i++) {
      const prev = filtered[filtered.length - 1];
      const gap = result[i].frameStart - prev.frameEnd;
      if (gap >= MIN_WINDOW_GAP) {
        filtered.push(result[i]);
      } else {
        // Too close — keep the one with better (lower) priority
        if (result[i].media.priority < prev.media.priority) {
          filtered[filtered.length - 1] = result[i];
        }
        // else: keep prev (it has equal or better priority)
      }
    }
    result = filtered;
  }

  return result;
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
  suppressedRanges,
}) => {
  const frame = useCurrentFrame();

  const windows = useMemo(
    () => computeMediaWindows(videos, media, sections, frames, trackId, showSeed),
    // eslint-disable-next-line react-hooks/exhaustive-deps — frames is stable (analysis JSON ref)
    [videos, media, sections, trackId, showSeed],
  );

  // Find the active window for the current frame (use longest fade for detection)
  const maxFade = Math.max(FADE_FRAMES, CURATED_FADE_FRAMES);
  const activeWindow = windows.find(
    (w) => frame >= w.frameStart - maxFade && frame < w.frameEnd + maxFade,
  );

  if (!activeWindow) return null;

  // Yield to LyricTriggerLayer when a curated visual is active
  if (suppressedRanges?.some((r) => frame >= r.start && frame < r.end)) {
    return null;
  }

  // Curated gets a glacial 9-second fade; general keeps 5-second
  const isCuratedPriority = activeWindow.media.priority <= 1;
  const fadeDur = isCuratedPriority ? CURATED_FADE_FRAMES : FADE_FRAMES;

  const fadeIn = smoothstep(
    activeWindow.frameStart - fadeDur,
    activeWindow.frameStart,
    frame,
  );
  const fadeOut = 1 - smoothstep(
    activeWindow.frameEnd,
    activeWindow.frameEnd + fadeDur,
    frame,
  );
  const fadeEnvelope = Math.min(fadeIn, fadeOut);

  // Inverse energy: media FILLS the quiet, RECEDES at peaks
  const frameIdx = Math.min(Math.max(0, frame), frames.length - 1);
  const energy = frames[frameIdx]?.rms ?? 0.1;
  const energyBoost = 1.0 - energyToFactor(energy, 0.05, 0.30) * 0.65;

  const isImage = activeWindow.media.mediaType === "image";
  const isCurated = activeWindow.media.priority <= 1;

  // ─── Curated media gets a clean canvas ───
  // Dark backdrop fades in to suppress the shader/song art underneath,
  // then the media fades in on top. Result: the video/image is the star,
  // not fighting pulsing shader colors.

  const filters: string[] = [];
  if (isCurated) {
    filters.push(isImage ? "blur(1.5px)" : "blur(1px)");
    filters.push("saturate(0.85)");
  } else {
    filters.push(isImage ? "blur(5px)" : "blur(3px)");
    filters.push("saturate(0.5)");
  }
  if (hueRotation !== 0 && !isCurated) {
    filters.push(`hue-rotate(${hueRotation.toFixed(1)}deg)`);
  }
  const filterStr = filters.join(" ");

  // Window timing includes fade lead time
  const windowStart = activeWindow.frameStart - fadeDur;
  const windowDuration = (activeWindow.frameEnd + fadeDur) - windowStart;

  if (isCurated) {
    // Strong backdrop: suppress shader so video is the star
    const backdropOpacity = fadeEnvelope * 0.35;
    // Media: dominant — these are the visuals the user paid for
    const mediaOpacity = fadeEnvelope * (isImage ? 0.85 : 0.92);

    // ─── Video: freeze on first frame during fade-in, play once visible, fade out at tail ───
    // The video enters frozen (paused on frame 0) while fading in from 0% opacity.
    // Once barely visible (~15%), it starts playing. Before the video's duration ends,
    // we fade out so there's no frozen last-frame glitch.
    if (!isImage) {
      // How far into the fade-in are we? 0 = just started fading, 1 = fully faded in
      const fadeProgress = smoothstep(
        activeWindow.frameStart - fadeDur,
        activeWindow.frameStart,
        frame,
      );

      // Video starts playing once ~15% visible. Before that, freeze on frame 0.
      const PLAY_THRESHOLD = 0.15;
      const playStartFrame = activeWindow.frameStart - Math.floor(fadeDur * (1 - PLAY_THRESHOLD));
      const isFrozen = frame < playStartFrame;

      // Fade out before video duration ends (avoid last-frame freeze).
      // Use per-media duration if available (e.g. 300 for 10s Hailuo clips),
      // otherwise default VIDEO_DURATION_FRAMES (450 = 15s for Grok clips).
      const mediaDuration = activeWindow.media.durationFrames ?? VIDEO_DURATION_FRAMES;
      const videoEndFrame = playStartFrame + mediaDuration;
      const tailFadeOut = 1 - smoothstep(
        videoEndFrame - VIDEO_CROSSFADE,
        videoEndFrame,
        frame,
      );
      // Also apply the normal window fade-out
      const effectiveOpacity = mediaOpacity * Math.min(1, tailFadeOut);

      // Don't render past the video's natural end
      if (frame >= videoEndFrame) {
        return null;
      }

      // The Sequence starts at playStartFrame so the video timeline begins there.
      // During the frozen period (before playStartFrame), we wrap in <Freeze frame={0}>
      // to show the first frame without advancing.
      const seqFrom = playStartFrame;
      const seqDuration = videoEndFrame - seqFrom;

      return (
        <>
          {/* Dark backdrop */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#000",
              opacity: backdropOpacity,
              pointerEvents: "none",
            }}
          />
          {/* Video — frozen during fade-in, playing once visible */}
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
              // Show first frame as a still while fading in
              <Sequence from={seqFrom} durationInFrames={seqDuration} layout="none">
                <Freeze frame={0}>
                  <OffthreadVideo
                    src={staticFile(activeWindow.media.src)}
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
              // Playing — video timeline starts from frame 0 at playStartFrame
              <Sequence from={seqFrom} durationInFrames={seqDuration} layout="none">
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
            )}
          </div>
          {/* Light color wash — blends curated video into overall visual flow */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, hsla(${260 + hueRotation}, 60%, 40%, 0.12) 0%, hsla(${320 + hueRotation}, 50%, 35%, 0.08) 100%)`,
              mixBlendMode: "color",
              opacity: fadeEnvelope,
              pointerEvents: "none",
            }}
          />
        </>
      );
    }

    // ─── Image: standard display ───
    return (
      <>
        {/* Dark backdrop — suppresses shader/song art */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#000",
            opacity: backdropOpacity,
            pointerEvents: "none",
          }}
        />
        {/* Image on clean canvas */}
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
          <ImageMediaDisplay
            src={activeWindow.media.src}
            frame={frame}
            windowStart={activeWindow.frameStart}
            windowEnd={activeWindow.frameEnd}
          />
        </div>
        {/* Light color wash — blends curated image into overall visual flow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(135deg, hsla(${260 + hueRotation}, 60%, 40%, 0.12) 0%, hsla(${320 + hueRotation}, 50%, 35%, 0.08) 100%)`,
            mixBlendMode: "color",
            opacity: fadeEnvelope,
            pointerEvents: "none",
          }}
        />
      </>
    );
  }

  // General (priority 2-3): visible atmospheric layer, blended with shader
  const maxOpacity = isImage ? 0.45 : 0.55;
  const opacity = fadeEnvelope * energyBoost * maxOpacity;

  const generalContent = isImage ? (
    <ImageMediaDisplay
      src={activeWindow.media.src}
      frame={frame}
      windowStart={activeWindow.frameStart}
      windowEnd={activeWindow.frameEnd}
    />
  ) : (
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
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        mixBlendMode: "screen",
        overflow: "hidden",
        pointerEvents: "none",
        filter: filterStr,
      }}
    >
      {generalContent}
    </div>
  );
};
