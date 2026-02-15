import React from 'react';
import { Composition } from 'remotion';
import { Episode } from './Episode.js';
import type { EpisodeProps } from './Episode.js';
import { FPS, WIDTH, HEIGHT } from './styles/themes.js';

const DEFAULT_DURATION = 300; // 10s fallback for Studio preview

const defaultProps: Record<string, unknown> = {
  episodeId: 'preview',
  episodeTitle: 'Preview',
  segments: [{ type: 'brand_intro', durationInFrames: 150 }],
  totalDurationInFrames: 150,
} satisfies EpisodeProps;

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
    </>
  );
};
