import React from 'react';
import { Audio, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';

interface ColdOpenProps {
  audioSrc: string;
  startFrom: number; // frames offset into concert audio
  image: string;
}

export const ColdOpen: React.FC<ColdOpenProps> = ({ audioSrc, startFrom, image }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // 3 seconds of intense audio/image, then hard cut to black
  const contentEnd = durationInFrames - 15; // last 0.5s is black

  const contentOpacity = frame < contentEnd ? 1 : 0;

  // Subtle zoom during the cold open
  const scale = interpolate(frame, [0, contentEnd], [1.02, 1.1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Audio: slam in, cut out
  const volume = interpolate(
    frame,
    [0, 5, contentEnd - 5, contentEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: COLORS.bg,
        overflow: 'hidden',
      }}
    >
      {contentOpacity > 0 && (
        <>
          <Img
            src={staticFile(image)}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale})`,
              opacity: contentOpacity,
            }}
          />
          <Audio src={staticFile(audioSrc)} startFrom={startFrom} volume={volume} />
        </>
      )}
    </div>
  );
};
