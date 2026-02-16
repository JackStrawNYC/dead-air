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
  segments: [
    { type: 'brand_intro', durationInFrames: 150 },
    { type: 'chapter_card', durationInFrames: 60, title: 'SET I', subtitle: 'Barton Hall — May 8, 1977' },
    {
      type: 'context_text',
      durationInFrames: 180,
      textLines: [
        { text: 'On the evening of May 8th, 1977, the Grateful Dead took the stage at Barton Hall.', displayDuration: 3, style: 'fact' as const },
        { text: '"It was one of those nights where everything just clicked."', displayDuration: 3, style: 'quote' as const },
      ],
      images: [],
      mood: 'warm',
      colorPalette: ['#d4a853', '#c47a3a'],
    },
    { type: 'chapter_card', durationInFrames: 60, title: 'SET II', subtitle: 'The Magic Begins' },
    {
      type: 'end_screen',
      durationInFrames: 300,
      nextEpisodeTitle: 'Europe \'72',
      nextEpisodeDate: 'Next Week',
      channelName: 'DEAD AIR',
    },
  ],
  // 5 segments, 4 crossfades at 15 frames each: 750 - 60 = 690
  totalDurationInFrames: 690,
} satisfies EpisodeProps;

const defaultShortsProps: Record<string, unknown> = {
  audioSrc: '',
  startFrom: 0,
  images: [],
  hookText: 'DEAD AIR',
  songName: 'Preview Mode',
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
