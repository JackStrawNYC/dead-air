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

  // Let TransitionSeries handle visual blending — keep content visible through full duration
  const scale = interpolate(frame, [0, durationInFrames], [1.02, 1.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Sustain audio through full duration — TransitionSeries crossfade handles the blend
  const volume = interpolate(
    frame,
    [0, 5, durationInFrames - 5, durationInFrames],
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
      {isVideo(media) ? (
        <OffthreadVideo
          src={staticFile(media)}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale})`,
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
    </div>
  );
};
