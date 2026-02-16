import React from 'react';
import { Composition } from 'remotion';
import { Episode } from './Episode';
import type { EpisodeProps } from './Episode';
import { ShortsComposition } from './compositions/ShortsComposition';
import { FPS, WIDTH, HEIGHT } from './styles/themes';

const DEFAULT_DURATION = 300; // 10s fallback for Studio preview

const defaultProps: Record<string, unknown> = {
  episodeId: 'preview',
  episodeTitle: 'Preview',
  segments: [{ type: 'brand_intro', durationInFrames: 150 }],
  totalDurationInFrames: 150,
} satisfies EpisodeProps;

const defaultShortsProps: Record<string, unknown> = {
  audioSrc: '',
  startFrom: 0,
  images: [],
  hookText: 'Preview Short',
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Episode"
        component={Episode}
        durationInFrames={DEFAULT_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => ({
          durationInFrames:
            (props as unknown as EpisodeProps).totalDurationInFrames || DEFAULT_DURATION,
        })}
      />
      <Composition
        id="Shorts"
        component={ShortsComposition as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={DEFAULT_DURATION}
        fps={FPS}
        width={1080}
        height={1920}
        defaultProps={defaultShortsProps}
        calculateMetadata={({ props }) => ({
          durationInFrames:
            (props as Record<string, unknown>).durationInFrames as number || DEFAULT_DURATION,
        })}
      />
    </>
  );
};
