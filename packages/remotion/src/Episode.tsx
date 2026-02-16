import React from 'react';
import { Sequence } from 'remotion';
import { ColdOpen } from './compositions/ColdOpen';
import { BrandIntro } from './compositions/BrandIntro';
import { NarrationSegment } from './compositions/NarrationSegment';
import { ConcertSegment } from './compositions/ConcertSegment';
import { ContextSegment } from './compositions/ContextSegment';

interface TextLine {
  text: string;
  displayDuration: number;
  style: 'fact' | 'quote' | 'analysis' | 'transition';
}

export type SegmentProps =
  | { type: 'cold_open'; durationInFrames: number; audioSrc: string; startFrom: number; image: string }
  | { type: 'brand_intro'; durationInFrames: number }
  | {
      type: 'narration';
      durationInFrames: number;
      audioSrc: string;
      images: string[];
      mood: string;
      colorPalette: string[];
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
    };

export interface EpisodeProps {
  episodeId: string;
  episodeTitle: string;
  segments: SegmentProps[];
  totalDurationInFrames: number;
}

export const Episode: React.FC<Record<string, unknown>> = (rawProps) => {
  const { segments } = rawProps as unknown as EpisodeProps;
  let cursor = 0;

  return (
    <div style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      {segments.map((seg, i) => {
        const from = cursor;
        cursor += seg.durationInFrames;

        return (
          <Sequence key={i} from={from} durationInFrames={seg.durationInFrames}>
            {seg.type === 'cold_open' && (
              <ColdOpen audioSrc={seg.audioSrc} startFrom={seg.startFrom} image={seg.image} />
            )}
            {seg.type === 'brand_intro' && <BrandIntro />}
            {seg.type === 'narration' && (
              <NarrationSegment
                audioSrc={seg.audioSrc}
                images={seg.images}
                mood={seg.mood}
                colorPalette={seg.colorPalette}
              />
            )}
            {seg.type === 'concert_audio' && (
              <ConcertSegment
                songName={seg.songName}
                audioSrc={seg.audioSrc}
                startFrom={seg.startFrom}
                images={seg.images}
                mood={seg.mood}
                colorPalette={seg.colorPalette}
                energyData={seg.energyData}
              />
            )}
            {seg.type === 'context_text' && (
              <ContextSegment
                textLines={seg.textLines}
                images={seg.images}
                mood={seg.mood}
                colorPalette={seg.colorPalette}
                ambientAudioSrc={seg.ambientAudioSrc}
                ambientStartFrom={seg.ambientStartFrom}
              />
            )}
          </Sequence>
        );
      })}
    </div>
  );
};
