import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

interface KenBurnsProps {
  images: string[];
  durationInFrames: number;
  energyData?: number[];
}

const MAX_SECONDS_PER_IMAGE = 8;
const FPS = 30;
const MAX_FRAMES_PER_IMAGE = MAX_SECONDS_PER_IMAGE * FPS; // 240
const CROSSFADE_FRAMES = 20; // ~0.67s crossfade overlap

// Base zoom range (no energy data)
const BASE_ZOOM_MIN = 1.0;
const BASE_ZOOM_MAX = 1.15;

// Energy-reactive zoom range
const ENERGY_ZOOM_QUIET = 0.04; // barely perceptible during quiet
const ENERGY_ZOOM_PEAK = 0.18; // dramatic during peaks

/**
 * Deterministic pseudo-random per image slot.
 * Returns value in [0, 1) based on slot index.
 */
function seededRandom(slot: number): number {
  const x = Math.sin(slot * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Generate a unique pan direction for each image slot.
 * Returns { panXDir, panYDir } each in [-1, 1].
 */
function panDirection(slot: number): { panXDir: number; panYDir: number } {
  const angle = seededRandom(slot) * Math.PI * 2;
  return {
    panXDir: Math.cos(angle),
    panYDir: Math.sin(angle),
  };
}

/**
 * Sample the energy array at a given frame position.
 * Energy data is sampled at ~10Hz (librosa hop=2205 at 22050Hz),
 * so we map frames (30fps) to energy indices.
 */
function sampleEnergy(energyData: number[], frame: number, durationInFrames: number): number {
  if (energyData.length === 0) return 0;
  const t = Math.max(0, Math.min(1, frame / durationInFrames));
  const idx = Math.min(Math.floor(t * energyData.length), energyData.length - 1);
  // Smooth over 5 samples to avoid jitter
  const lo = Math.max(0, idx - 2);
  const hi = Math.min(energyData.length - 1, idx + 2);
  let sum = 0;
  let count = 0;
  for (let i = lo; i <= hi; i++) {
    sum += energyData[i];
    count++;
  }
  return sum / count;
}

/**
 * Build the slot schedule: how many image slots, which image per slot.
 * If we have 3 images for a 75s segment, that's 25s/image which exceeds
 * MAX_SECONDS_PER_IMAGE (8s). So we create more slots and cycle images.
 */
function buildSlotSchedule(
  imageCount: number,
  durationInFrames: number,
): { slotCount: number; framesPerSlot: number } {
  // How many slots do we need to keep each slot under the max?
  const minSlots = Math.ceil(durationInFrames / MAX_FRAMES_PER_IMAGE);
  // At least as many slots as images
  const slotCount = Math.max(minSlots, imageCount);
  const framesPerSlot = Math.ceil(durationInFrames / slotCount);
  return { slotCount, framesPerSlot };
}

export const KenBurns: React.FC<KenBurnsProps> = ({ images, durationInFrames, energyData }) => {
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

        // Skip slots that are not visible (with crossfade margin)
        if (frame < slotStart - CROSSFADE_FRAMES || frame > slotEnd + CROSSFADE_FRAMES) return null;

        // Opacity: crossfade in at start, crossfade out at end
        // First slot starts fully visible; last slot stays until end
        // Ensure all input values are strictly monotonically increasing
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

        // Pan direction is unique per slot
        const { panXDir, panYDir } = panDirection(slot);

        // Energy-reactive parameters
        let zoomAmount: number;
        let panSpeed: number;
        let warmth = 0;

        if (energyData && energyData.length > 0) {
          const rawEnergy = sampleEnergy(energyData, frame, durationInFrames);
          const normalizedEnergy = (rawEnergy - energyMin) / energyRange;

          // Zoom: quiet → subtle, peak → dramatic
          zoomAmount = ENERGY_ZOOM_QUIET + normalizedEnergy * (ENERGY_ZOOM_PEAK - ENERGY_ZOOM_QUIET);
          // Pan speed: 1% quiet → 3% peak
          panSpeed = 1.0 + normalizedEnergy * 2.0;
          // Warmth overlay
          warmth = normalizedEnergy;
        } else {
          // No energy data: use the full base zoom range
          zoomAmount = BASE_ZOOM_MAX - BASE_ZOOM_MIN;
          panSpeed = 1.5;
        }

        const scale = 1.0 + progress * zoomAmount;
        const panX = panXDir * progress * panSpeed;
        const panY = panYDir * progress * panSpeed * 0.6; // less vertical movement

        // Color temperature overlay (warm amber at peaks)
        const warmthOpacity = warmth * 0.15;

        return (
          <React.Fragment key={slot}>
            <Img
              src={staticFile(img)}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity,
                transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
                willChange: 'transform, opacity',
              }}
            />
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
          </React.Fragment>
        );
      })}
    </div>
  );
};
