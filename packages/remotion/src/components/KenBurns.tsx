import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

interface KenBurnsProps {
  images: string[];
  durationInFrames: number;
  energyData?: number[];
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
  // Smooth over 3 samples to avoid jitter
  const lo = Math.max(0, idx - 1);
  const hi = Math.min(energyData.length - 1, idx + 1);
  return (energyData[lo] + energyData[idx] + energyData[hi]) / 3;
}

export const KenBurns: React.FC<KenBurnsProps> = ({ images, durationInFrames, energyData }) => {
  const frame = useCurrentFrame();

  if (images.length === 0) return null;

  const framesPerImage = Math.ceil(durationInFrames / images.length);
  const crossfade = 15;

  // Precompute energy normalization range if we have data
  let energyMin = 0;
  let energyMax = 1;
  if (energyData && energyData.length > 0) {
    energyMin = Math.min(...energyData);
    energyMax = Math.max(...energyData);
  }
  const energyRange = energyMax - energyMin || 1;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
      {images.map((img, i) => {
        const segStart = i * framesPerImage;
        const segEnd = segStart + framesPerImage;
        const localFrame = frame - segStart;

        // Skip images that are not visible
        if (frame < segStart - crossfade || frame > segEnd + crossfade) return null;

        // Opacity: fade in at start, fade out at end
        const opacity = interpolate(
          frame,
          [segStart - crossfade, segStart, segEnd - crossfade, segEnd],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        const progress = Math.max(0, Math.min(1, localFrame / framesPerImage));

        // Energy-reactive parameters
        let zoomSpeed = 0.08; // default
        let panMultiplier = 1;
        let warmth = 0; // 0 = neutral, 1 = full warm tint

        if (energyData && energyData.length > 0) {
          const rawEnergy = sampleEnergy(energyData, frame, durationInFrames);
          const normalizedEnergy = (rawEnergy - energyMin) / energyRange; // 0-1

          // Zoom: 0.02x during quiet → 0.12x during peaks
          zoomSpeed = 0.02 + normalizedEnergy * 0.10;
          // Pan: 0.5x during quiet → 2x during peaks
          panMultiplier = 0.5 + normalizedEnergy * 1.5;
          // Warmth: cool during quiet, warm amber during peaks
          warmth = normalizedEnergy;
        }

        const scale = 1 + progress * zoomSpeed;
        const panX = (i % 2 === 0 ? -1 : 1) * progress * 2 * panMultiplier;
        const panY = progress * 1 * panMultiplier;

        // Color temperature overlay
        const warmthOpacity = warmth * 0.15; // subtle

        return (
          <React.Fragment key={i}>
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
