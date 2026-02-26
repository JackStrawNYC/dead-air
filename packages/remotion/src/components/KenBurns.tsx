import React from 'react';
import { Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { sampleEnergy } from '../utils/energy';
import type { CameraPreset } from '../utils/cameraAssignment';

export type { CameraPreset };

interface KenBurnsProps {
  images: string[];
  durationInFrames: number;
  energyData?: number[];
  cameraPreset?: CameraPreset;
  /** Camera movement speed multiplier (default 1.0). <1 = slower, >1 = faster */
  speedMultiplier?: number;
}

const MAX_SECONDS_PER_IMAGE = 5;
const FPS = 30;
const MAX_FRAMES_PER_IMAGE = MAX_SECONDS_PER_IMAGE * FPS; // 240
const CROSSFADE_FRAMES = 20; // ~0.67s crossfade overlap

// Base zoom range (no energy data)
const BASE_ZOOM_MIN = 1.0;
const BASE_ZOOM_MAX = 1.15;

// Energy-reactive zoom range
const ENERGY_ZOOM_QUIET = 0.04;
const ENERGY_ZOOM_PEAK = 0.18;

function seededRandom(slot: number): number {
  const x = Math.sin(slot * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function panDirection(slot: number): { panXDir: number; panYDir: number } {
  const angle = seededRandom(slot) * Math.PI * 2;
  return {
    panXDir: Math.cos(angle),
    panYDir: Math.sin(angle),
  };
}

function isProcedural(path: string): boolean {
  return path === '__procedural__';
}

function isVideo(path: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(path);
}

function buildSlotSchedule(
  imageCount: number,
  durationInFrames: number,
): { slotCount: number; framesPerSlot: number } {
  const minSlots = Math.ceil(durationInFrames / MAX_FRAMES_PER_IMAGE);
  const slotCount = Math.max(minSlots, imageCount);
  const framesPerSlot = Math.ceil(durationInFrames / slotCount);
  return { slotCount, framesPerSlot };
}

/** Smoothstep ease for cinematic camera movement */
function easeProgress(t: number): number {
  return t * t * (3 - 2 * t);
}

// Simple presets: linear drift + scale
type SimplePresetParams = { endScale: number; driftX: number; driftY: number };
const SIMPLE_PRESETS: Partial<Record<CameraPreset, SimplePresetParams>> = {
  push_in:     { endScale: 1.12, driftX: 0,   driftY: 0 },
  pull_out:    { endScale: 0.92, driftX: 0,   driftY: 0 },
  drift_left:  { endScale: 1.04, driftX: -10, driftY: 0 },
  drift_right: { endScale: 1.04, driftX: 10,  driftY: 0 },
  tilt_up:     { endScale: 1.04, driftX: 0,   driftY: -7 },
  tilt_down:   { endScale: 1.04, driftX: 0,   driftY: 7 },
};

// Advanced presets use custom motion functions
const ADVANCED_PRESETS = new Set<CameraPreset>([
  'arc_left', 'arc_right', 'breathing', 'handheld', 'handheld_subtle',
  'dolly_left', 'dolly_right', 'crane_up', 'crane_down',
]);

function computeAdvancedMotion(
  preset: CameraPreset,
  frame: number,
  effectiveDur: number,
  normalizedEnergy: number,
): { scale: number; panX: number; panY: number } {
  const rawProgress = interpolate(frame, [0, effectiveDur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const progress = easeProgress(rawProgress);

  switch (preset) {
    case 'breathing': {
      const amplitude = 0.01 + normalizedEnergy * 0.01;
      const breathScale = 1.0 + Math.sin((frame * 2 * Math.PI) / (4 * FPS)) * amplitude;
      return { scale: breathScale, panX: 0, panY: 0 };
    }

    case 'handheld': {
      const intensity = 1 + normalizedEnergy * 0.5;
      const jitterX = Math.sin(frame * 0.13) * 3 * intensity;
      const jitterY = Math.cos(frame * 0.31) * 2 * intensity;
      return { scale: 1.03, panX: jitterX / 100, panY: jitterY / 100 };
    }

    case 'handheld_subtle': {
      const jx = Math.sin(frame * 0.13) * 0.8 + Math.sin(frame * 0.31) * 0.4
        + Math.sin(frame * 0.53 + 1.2) * 0.25 + Math.sin(frame * 0.79 + 0.7) * 0.15;
      const jy = Math.cos(frame * 0.17) * 0.6 + Math.cos(frame * 0.29) * 0.3
        + Math.cos(frame * 0.61 + 0.5) * 0.2 + Math.cos(frame * 0.89 + 1.1) * 0.1;
      return { scale: 1.02, panX: jx / 100, panY: jy / 100 };
    }

    case 'arc_left': {
      const scale = interpolate(progress, [0, 1], [1.0, 1.06]);
      const x = Math.cos(progress * Math.PI * 0.5) * -12;
      const y = Math.sin(progress * Math.PI) * -4;
      return { scale, panX: x / 100, panY: y / 100 };
    }

    case 'arc_right': {
      const scale = interpolate(progress, [0, 1], [1.0, 1.06]);
      const x = Math.cos(progress * Math.PI * 0.5) * 12;
      const y = Math.sin(progress * Math.PI) * -4;
      return { scale, panX: x / 100, panY: y / 100 };
    }

    case 'dolly_left': {
      const scale = interpolate(progress, [0, 1], [1.0, 1.08]);
      const x = interpolate(progress, [0, 1], [0, -14]);
      return { scale, panX: x / 100, panY: 0 };
    }

    case 'dolly_right': {
      const scale = interpolate(progress, [0, 1], [1.0, 1.08]);
      const x = interpolate(progress, [0, 1], [0, 14]);
      return { scale, panX: x / 100, panY: 0 };
    }

    case 'crane_up': {
      const scale = interpolate(progress, [0, 1], [1.06, 1.0]);
      const y = interpolate(progress, [0, 1], [10, -5]);
      return { scale, panX: 0, panY: y / 100 };
    }

    case 'crane_down': {
      const scale = interpolate(progress, [0, 1], [1.0, 1.06]);
      const y = interpolate(progress, [0, 1], [-5, 10]);
      return { scale, panX: 0, panY: y / 100 };
    }

    default:
      return { scale: 1, panX: 0, panY: 0 };
  }
}

/**
 * Compute camera transform based on preset.
 */
function computePresetTransform(
  preset: CameraPreset,
  progress: number,
  frame: number,
  slot: number,
  normalizedEnergy: number,
  effectiveDur: number,
): { scale: number; panX: number; panY: number } {
  // Advanced presets
  if (ADVANCED_PRESETS.has(preset)) {
    return computeAdvancedMotion(preset, frame, effectiveDur, normalizedEnergy);
  }

  // Simple presets
  const simple = SIMPLE_PRESETS[preset];
  if (simple) {
    const p = easeProgress(progress);
    return {
      scale: interpolate(p, [0, 1], [1.0, simple.endScale]),
      panX: interpolate(p, [0, 1], [0, simple.driftX]) / 100,
      panY: interpolate(p, [0, 1], [0, simple.driftY]) / 100,
    };
  }

  // push_in / pull_out (legacy with energy modulation)
  switch (preset) {
    case 'push_in': {
      const pushSpeed = 0.08 + normalizedEnergy * 0.08;
      return { scale: 1.0 + progress * pushSpeed, panX: 0, panY: 0 };
    }
    case 'pull_out': {
      const pullSpeed = 0.09 + normalizedEnergy * 0.08;
      return { scale: 1.15 - progress * pullSpeed, panX: 0, panY: 0 };
    }
    default: {
      // random
      const { panXDir, panYDir } = panDirection(slot);
      const zoomAmount = BASE_ZOOM_MAX - BASE_ZOOM_MIN;
      const panSpeed = 1.5;
      return {
        scale: 1.0 + progress * zoomAmount,
        panX: panXDir * progress * panSpeed,
        panY: panYDir * progress * panSpeed * 0.6,
      };
    }
  }
}

export const KenBurns: React.FC<KenBurnsProps> = ({
  images,
  durationInFrames,
  energyData,
  cameraPreset = 'random',
  speedMultiplier = 1.0,
}) => {
  const frame = useCurrentFrame();

  if (images.length === 0) return null;

  const { slotCount, framesPerSlot } = buildSlotSchedule(images.length, durationInFrames);

  // Precompute energy normalization range
  let energyMin = 0;
  let energyMax = 1;
  if (energyData && energyData.length > 0) {
    energyMin = Math.min(...energyData);
    energyMax = Math.max(...energyData);
  }
  const energyRange = energyMax - energyMin || 1;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
      {Array.from({ length: slotCount }, (_, slot) => {
        const imgIndex = slot % images.length;
        const img = images[imgIndex];

        const slotStart = slot * framesPerSlot;
        const slotEnd = Math.min(slotStart + framesPerSlot, durationInFrames);
        const localFrame = frame - slotStart;

        if (frame < slotStart - CROSSFADE_FRAMES || frame > slotEnd + CROSSFADE_FRAMES) return null;

        const fadeInStart = slot === 0 ? 0 : slotStart - CROSSFADE_FRAMES;
        const fadeInEnd = slot === 0 ? 1 : slotStart;
        const fadeOutStart = slot === slotCount - 1 ? durationInFrames - 1 : slotEnd - CROSSFADE_FRAMES;
        const fadeOutEnd = slot === slotCount - 1 ? durationInFrames : slotEnd;

        const opacity = interpolate(
          frame,
          [fadeInStart, Math.max(fadeInEnd, fadeInStart + 1), Math.max(fadeOutStart, fadeInEnd + 1), Math.max(fadeOutEnd, fadeOutStart + 1)],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        const slotDuration = slotEnd - slotStart;
        const progress = Math.max(0, Math.min(1, localFrame / slotDuration));

        let scale: number;
        let panX: number;
        let panY: number;
        let warmth = 0;
        let normalizedEnergy = 0;

        if (energyData && energyData.length > 0) {
          const rawEnergy = sampleEnergy(energyData, frame, durationInFrames);
          normalizedEnergy = (rawEnergy - energyMin) / energyRange;
          warmth = normalizedEnergy;
        }

        // Apply speed multiplier: faster moods use shorter effective duration
        const effectiveDur = Math.max(1, Math.round(slotDuration / speedMultiplier));

        if (cameraPreset !== 'random' || !energyData || energyData.length === 0) {
          const t = computePresetTransform(cameraPreset, progress, localFrame, slot, normalizedEnergy, effectiveDur);
          scale = t.scale;
          panX = t.panX;
          panY = t.panY;

          if (energyData && energyData.length > 0 && cameraPreset === 'random') {
            const zoomAmount = ENERGY_ZOOM_QUIET + normalizedEnergy * (ENERGY_ZOOM_PEAK - ENERGY_ZOOM_QUIET);
            const panSpd = 1.0 + normalizedEnergy * 2.0;
            const { panXDir, panYDir } = panDirection(slot);
            scale = 1.0 + progress * zoomAmount;
            panX = panXDir * progress * panSpd;
            panY = panYDir * progress * panSpd * 0.6;
          }
        } else {
          const zoomAmount = ENERGY_ZOOM_QUIET + normalizedEnergy * (ENERGY_ZOOM_PEAK - ENERGY_ZOOM_QUIET);
          const panSpd = 1.0 + normalizedEnergy * 2.0;
          const { panXDir, panYDir } = panDirection(slot);
          scale = 1.0 + progress * zoomAmount;
          panX = panXDir * progress * panSpd;
          panY = panYDir * progress * panSpd * 0.6;
        }

        // Energy bloom at peaks
        if (normalizedEnergy > 0.85) {
          scale *= 1.0 + (normalizedEnergy - 0.85) * 0.02;
        }

        const warmthOpacity = warmth * 0.25;

        const mediaStyle: React.CSSProperties = {
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity,
          transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
          willChange: 'transform, opacity',
        };

        return (
          <React.Fragment key={slot}>
            {isProcedural(img) ? (
              <div style={{ ...mediaStyle, opacity: 0 }} />
            ) : isVideo(img) ? (
              <OffthreadVideo
                src={staticFile(img)}
                style={mediaStyle}
                muted
              />
            ) : (
              <Img
                src={staticFile(img)}
                style={mediaStyle}
                delayRenderTimeoutInMilliseconds={120_000}
              />
            )}
            {warmthOpacity > 0.01 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: `rgba(212, 168, 83, ${warmthOpacity * opacity})`,
                  pointerEvents: 'none',
                }}
              />
            )}
            {normalizedEnergy > 0.85 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `radial-gradient(circle at center, rgba(212, 168, 83, ${normalizedEnergy * 0.12 * opacity}) 0%, transparent 70%)`,
                  mixBlendMode: 'screen',
                  pointerEvents: 'none',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
