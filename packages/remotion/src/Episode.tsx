import React from 'react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { ColdOpen } from './compositions/ColdOpen';
import { ColdOpenV2 } from './compositions/ColdOpenV2';
import { BrandIntro } from './compositions/BrandIntro';
import { NarrationSegment } from './compositions/NarrationSegment';
import { ConcertSegment } from './compositions/ConcertSegment';
import { ContextSegment } from './compositions/ContextSegment';
import { EndScreen } from './compositions/EndScreen';
import { ChapterCard } from './compositions/ChapterCard';

interface TextLine {
  text: string;
  displayDuration: number;
  style: 'fact' | 'quote' | 'analysis' | 'transition';
}

export type SegmentProps =
  | { type: 'cold_open'; durationInFrames: number; audioSrc: string; startFrom: number; image: string }
  | { type: 'cold_open_v2'; durationInFrames: number; audioSrc: string; startFrom: number; media: string; hookText?: string }
  | { type: 'brand_intro'; durationInFrames: number }
  | {
      type: 'narration';
      durationInFrames: number;
      audioSrc: string;
      images: string[];
      mood: string;
      colorPalette: string[];
      concertBedSrc?: string;
      concertBedStartFrom?: number;
    }
  | {
      type: 'concert_audio';
      durationInFrames: number;
      songName: string;
      audioSrc: string;
      startFrom: number;
      images: string[];
      mood: string;
      colorPalette: string[];
      energyData?: number[];
    }
  | {
      type: 'context_text';
      durationInFrames: number;
      textLines: TextLine[];
      images: string[];
      mood: string;
      colorPalette: string[];
      ambientAudioSrc?: string;
      ambientStartFrom?: number;
    }
  | {
      type: 'end_screen';
      durationInFrames: number;
      nextEpisodeTitle?: string;
      nextEpisodeDate?: string;
      channelName?: string;
    }
  | {
      type: 'chapter_card';
      durationInFrames: number;
      title: string;
      subtitle?: string;
      colorAccent?: string;
    };

export interface EpisodeProps {
  episodeId: string;
  episodeTitle: string;
  segments: SegmentProps[];
  totalDurationInFrames: number;
}

const CROSSFADE_FRAMES = 15;

export const Episode: React.FC<Record<string, unknown>> = (rawProps) => {
  const { segments } = rawProps as unknown as EpisodeProps;

  return (
    <div style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <TransitionSeries>
        {segments.map((seg, i) => {
          const content = (() => {
            switch (seg.type) {
              case 'cold_open':
                return <ColdOpen audioSrc={seg.audioSrc} startFrom={seg.startFrom} image={seg.image} />;
              case 'cold_open_v2':
                return <ColdOpenV2 audioSrc={seg.audioSrc} startFrom={seg.startFrom} media={seg.media} hookText={seg.hookText} />;
              case 'brand_intro':
                return <BrandIntro />;
              case 'narration':
                return (
                  <NarrationSegment
                    audioSrc={seg.audioSrc}
                    images={seg.images}
                    mood={seg.mood}
                    colorPalette={seg.colorPalette}
                    concertBedSrc={seg.concertBedSrc}
                    concertBedStartFrom={seg.concertBedStartFrom}
                  />
                );
              case 'concert_audio':
                return (
                  <ConcertSegment
                    songName={seg.songName}
                    audioSrc={seg.audioSrc}
                    startFrom={seg.startFrom}
                    images={seg.images}
                    mood={seg.mood}
                    colorPalette={seg.colorPalette}
                    energyData={seg.energyData}
                  />
                );
              case 'context_text':
                return (
                  <ContextSegment
                    textLines={seg.textLines}
                    images={seg.images}
                    mood={seg.mood}
                    colorPalette={seg.colorPalette}
                    ambientAudioSrc={seg.ambientAudioSrc}
                    ambientStartFrom={seg.ambientStartFrom}
                  />
                );
              case 'end_screen':
                return (
                  <EndScreen
                    nextEpisodeTitle={seg.nextEpisodeTitle}
                    nextEpisodeDate={seg.nextEpisodeDate}
                    channelName={seg.channelName}
                  />
                );
              case 'chapter_card':
                return (
                  <ChapterCard
                    title={seg.title}
                    subtitle={seg.subtitle}
                    colorAccent={seg.colorAccent}
                  />
                );
              default:
                return null;
            }
          })();

          return (
            <React.Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={seg.durationInFrames}>
                {content}
              </TransitionSeries.Sequence>
              {i < segments.length - 1 && (
                <TransitionSeries.Transition
                  presentation={fade()}
                  timing={linearTiming({ durationInFrames: CROSSFADE_FRAMES })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </div>
  );
};
