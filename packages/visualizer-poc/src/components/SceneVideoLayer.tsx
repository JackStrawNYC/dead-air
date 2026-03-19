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
import { hashString } from "../utils/hash";
import { smoothstep } from "../utils/math";
import { findMusicEnd } from "../utils/music-end";

const VIDEO_DISPLAY_FRAMES = 600; // 20 seconds at 30fps
const FADE_FRAMES = 150;          // 5-second smoothstep fade in/out
const CURATED_FADE_FRAMES = 90;   // 3-second fade for curated media
const VIDEO_CROSSFADE = 90;       // 3-second crossfade between still and video
const VIDEO_DURATION_FRAMES = 450; // 15 seconds — generated video length

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
  /** Current climax phase for phase-aware opacity control */
  climaxPhase?: string;
  /** Whether band is in coherence "locked in" state — suppresses videos */
  isLocked?: boolean;
  /** Beat snap value for beat-synced video cuts and opacity flashes (0-1) */
  beatSnap?: number;
  /** Current section type for context-aware blend modes */
  sectionType?: string;
}

// ─── Context-Adaptive Opacity (pure function) ───

/**
 * Compute video opacity based on context — replaces simple inverse-energy.
 * @param energy Current energy level (0-1)
 * @param isCurated Whether this is song-specific curated media
 * @param sectionType Current section type label
 * @param climaxPhase Current climax phase string
 * @param beatSnap Current beat snap value (0-1)
 */
export function computeVideoOpacity(
  energy: number,
  isCurated: boolean,
  sectionType?: string,
  climaxPhase?: string,
  beatSnap?: number,
): number {
  const snap = beatSnap ?? 0;

  // Climax + curated: video as star of the show
  if (isCurated && (climaxPhase === "climax" || climaxPhase === "sustain")) {
    return 0.80;
  }

  // Peak + curated: rhythmic beat flash visibility
  if (isCurated && energy > 0.30) {
    const beatFlash = snap > 0.3 ? 0.60 * snap : 0;
    return Math.max(0.15, beatFlash);
  }

  // Peak + general: stay hidden (preserve shader prominence)
  if (!isCurated && energy > 0.30) {
    return 0.03;
  }

  // Build sections: video intensifies WITH energy
  if (sectionType === "build" || climaxPhase === "build") {
    return 0.40 + energy * 0.50;
  }

  // Quiet (energy < 0.08): video prominent
  if (energy < 0.08) {
    return 0.70;
  }

  // Mid energy default: gentle mid-range presence
  return 0.50 - energy * 0.30;
}

// ─── Context-Aware Blend Modes (pure function) ───

export type VideoBlendMode = "screen" | "multiply" | "overlay" | "color-burn";

/**
 * Select CSS blend mode based on context.
 * @param isImage Whether media is an image (always screen for Ken Burns)
 * @param energy Current energy level (0-1)
 * @param sectionType Current section type label
 * @param climaxPhase Current climax phase string
 */
export function selectVideoBlendMode(
  isImage: boolean,
  energy: number,
  sectionType?: string,
  climaxPhase?: string,
): VideoBlendMode {
  // Images always use screen (preserve Ken Burns warmth)
  if (isImage) return "screen";

  // Climax: saturated psychedelic intensity
  if (climaxPhase === "climax" || climaxPhase === "sustain") {
    return "color-burn";
  }

  // Dark verse moments: film-negative effect
  if ((sectionType === "verse" || sectionType === "intro") && energy < 0.15) {
    return "multiply";
  }

  // Punchy high energy (non-climax): contrast punch
  if (energy > 0.25) {
    return "overlay";
  }

  // Atmospheric/quiet: warm additive
  return "screen";
}

// ─── Video-First Moment Detection ───

/**
 * Detect if current moment should be a "video IS the visual" moment.
 * True when curated video exists AND climax phase active.
 */
export function isVideoFirstMoment(
  isCurated: boolean,
  energy: number,
  climaxPhase?: string,
): boolean {
  if (!isCurated) return false;
  if (energy < 0.3) return false;
  return climaxPhase === "climax" || climaxPhase === "sustain";
}

// ─── Beat-Synced Cut Interval ───

/**
 * Compute beat-synced cut interval in frames.
 * Only active when energy > 0.20 AND enough clips available.
 */
export function computeBeatCutInterval(energy: number): number {
  if (energy <= 0.20) return Infinity;
  // 150 frames (5s) at quiet → 30 frames (1s) at peak
  return Math.round(150 - energy * 120);
}

// ─── Section scoring (shared logic) ───

function scoreSections(
  sections: SectionBoundary[],
  frames: EnhancedFrameData[],
  forCurated: boolean = false,
): { section: SectionBoundary; idx: number; score: number }[] {
  const totalFrames = sections[sections.length - 1]?.frameEnd ?? 0;
  const musicEnd = findMusicEnd(frames, totalFrames);

  return sections.map((section, idx) => {
    let score = 0;
    if (forCurated) {
      // Curated media prefers high-energy sections (dramatic visibility)
      if (section.energy === "high") score += 4;
      else if (section.energy === "mid") score += 3;
      else score += 2;
    } else {
      // General media prefers quiet sections (unchanged behavior)
      if (section.energy === "low") score += 3;
      else if (section.energy === "mid") score += 2;
      else score += 1;
    }

    const sectionLen = section.frameEnd - section.frameStart;
    score += Math.min(2, sectionLen / 3000);

    // Post-climax comedown bonus (release sections = visual reward)
    if (idx > 0 && sections[idx - 1].energy === "high" && section.energy === "low") {
      score += 5; // boosted: release sections are prime video moments
    }

    // Build phase bonus: videos during build add anticipation
    if (idx > 0 && sections[idx - 1].energy === "low" && section.energy === "mid") {
      score += 2;
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

      // Onset density: sections with low onset density (ambient, sustained) get bonus
      const sampleCount = Math.min(30, section.frameEnd - section.frameStart);
      let onsetSum = 0;
      for (let fi = 0; fi < sampleCount; fi++) {
        const sampleIdx = Math.min(section.frameStart + Math.floor(fi * (section.frameEnd - section.frameStart) / sampleCount), frames.length - 1);
        onsetSum += frames[sampleIdx].onset;
      }
      const avgOnset = sampleCount > 0 ? onsetSum / sampleCount : 0;
      if (avgOnset < 0.15) score += 2; // low onset density = good for video
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

const MIN_WINDOW_GAP = 450; // 15 seconds minimum between media windows

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

  // Score sections: curated media prefers high-energy, general prefers quiet
  const hasCurated = items.some((m) => m.priority <= 1);
  const scored = scoreSections(sections, frames, false);
  const scoredForCurated = hasCurated ? scoreSections(sections, frames, true) : scored;
  scored.sort((a, b) => b.score - a.score);
  scoredForCurated.sort((a, b) => b.score - a.score);

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
  climaxPhase,
  isLocked,
  beatSnap,
  sectionType,
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

  // During coherence lock: suppress videos entirely (the band is the show)
  if (isLocked) return null;

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
    filters.push(isImage ? "blur(5px)" : "blur(2px)");
    // Energy-reactive saturation: quiet=0.6, loud=0.9 (prevents washed-out videos)
    const satFactor = 0.6 + energyToFactor(energy, 0.05, 0.30) * 0.3;
    filters.push(`saturate(${satFactor.toFixed(2)})`);
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

  // General (priority 2-3): context-adaptive blending
  const contextOpacity = computeVideoOpacity(energy, false, sectionType, climaxPhase, beatSnap);
  const opacity = fadeEnvelope * contextOpacity;

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

  // Context-aware blend mode
  const blendMode = selectVideoBlendMode(isImage, energy, sectionType, climaxPhase);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity,
        mixBlendMode: blendMode,
        overflow: "hidden",
        pointerEvents: "none",
        filter: filterStr,
      }}
    >
      {generalContent}
    </div>
  );
};
