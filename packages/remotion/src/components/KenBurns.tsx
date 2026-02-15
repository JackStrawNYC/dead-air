import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion';

interface KenBurnsProps {
  images: string[];
  durationInFrames: number;
}

export const KenBurns: React.FC<KenBurnsProps> = ({ images, durationInFrames }) => {
  const frame = useCurrentFrame();

  if (images.length === 0) return null;

  const framesPerImage = Math.ceil(durationInFrames / images.length);
  const crossfade = 15;

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
          [
            segStart - crossfade,
            segStart,
            segEnd - crossfade,
            segEnd,
          ],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        // Ken Burns: slow zoom from 1.0 to 1.08, slight pan
        const progress = Math.max(0, Math.min(1, localFrame / framesPerImage));
        const scale = 1 + progress * 0.08;
        const panX = (i % 2 === 0 ? -1 : 1) * progress * 2; // alternate pan direction
        const panY = progress * 1;

        return (
          <Img
            key={i}
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
        );
      })}
    </div>
  );
};
