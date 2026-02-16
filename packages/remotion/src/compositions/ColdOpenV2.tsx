import React from 'react';
import { Audio, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/themes';
import { AnimatedTitle } from '../components/AnimatedTitle';
import { FilmGrain } from '../components/FilmGrain';

interface ColdOpenV2Props {
  audioSrc: string;
  startFrom: number;
  media: string;
  hookText?: string;
}

function isVideo(path: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(path);
}

export const ColdOpenV2: React.FC<ColdOpenV2Props> = ({
  audioSrc,
  startFrom,
  media,
  hookText,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const contentEnd = durationInFrames - 30;
  const contentOpacity = interpolate(frame, [contentEnd, contentEnd + 5], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const scale = interpolate(frame, [0, contentEnd], [1.02, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
          {isVideo(media) ? (
            <OffthreadVideo
              src={staticFile(media)}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${scale})`,
                opacity: contentOpacity,
              }}
              muted
            />
          ) : (
            <Img
              src={staticFile(media)}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${scale})`,
                opacity: contentOpacity,
              }}
            />
          )}
          <Audio src={staticFile(audioSrc)} startFrom={startFrom} volume={volume} />
          {hookText && (
            <div
              style={{
                position: 'absolute',
                bottom: 120,
                left: 80,
                right: 80,
              }}
            >
              <AnimatedTitle
                text={hookText}
                variant="scale_in"
                fontSize={72}
                color={COLORS.text}
              />
            </div>
          )}
          <FilmGrain intensity={0.15} />
        </>
      )}
    </div>
  );
};
