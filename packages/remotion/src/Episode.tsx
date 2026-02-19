import React from 'react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { ColdOpen } from './compositions/ColdOpen';
import { ColdOpenV2 } from './compositions/ColdOpenV2';
import { BrandIntro } from './compositions/BrandIntro';
import { NarrationSegment } from './compositions/NarrationSegment';
import { ConcertSegment } from './compositions/ConcertSegment';
import { ContextSegment } from './compositions/ContextSegment';
import { EndScreen } from './compositions/EndScreen';
import { ChapterCard } from './compositions/ChapterCard';
import { CinematicLetterbox } from './components/CinematicLetterbox';
import { FilmLook } from './components/FilmLook';
import { LightLeak } from './components/LightLeak';
import { VinylNoise } from './components/VinylNoise';
import { SetlistProgress, SongPosition } from './components/SetlistProgress';
import { SegmentErrorBoundary } from './components/SegmentErrorBoundary';
import { AmbientBed } from './components/AmbientBed';
import { TensionDrone } from './components/TensionDrone';
import { whipPan } from './transitions/whip-pan';
import { lightLeakTransition } from './transitions/light-leak-transition';
import { iris } from './transitions/iris';
import { zoomBlur } from './transitions/zoom-blur';
import { flashCut } from './transitions/flash-cut';
import { dipToBlack } from './transitions/dip-to-black';
import { filmBurn } from './transitions/film-burn';
import { diagonalWipe } from './transitions/diagonal-wipe';

interface TextLine {
  text: string;
  displayDuration: number;
  style: 'fact' | 'quote' | 'analysis' | 'transition' | 'listenFor' | 'fanQuote';
}

interface SongDNAData {
  timesPlayed: number;
  firstPlayed: string;
  lastPlayed: string;
  rank?: string;
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
      textLines?: TextLine[];
      songDNA?: SongDNAData;
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
  /** Optional ambient bed audio source for composition-level ambient layer */
  ambientBedSrc?: string;
  /** Optional tension drone audio source */
  tensionDroneSrc?: string;
}

const CROSSFADE_FRAMES = 30;

/**
 * Concert-doc enriched transition selection.
 * Mood-aware replacement for the basic pickTransition().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enrichTransition(prevType: string, nextType: string, prevMood?: string, nextMood?: string): any {
  // Chapter cards: iris reveal (cinematic)
  if (nextType === 'chapter_card') return iris();

  // Cold opens: slide in
  if (nextType === 'cold_open' || nextType === 'cold_open_v2') {
    return slide({ direction: 'from-left' });
  }

  // Concert-to-concert (same set): whip pan for energy
  if (prevType === 'concert_audio' && nextType === 'concert_audio') {
    return whipPan();
  }

  // Concert → narration: light leak (nostalgic shift)
  if (prevType === 'concert_audio' && nextType === 'narration') {
    return lightLeakTransition();
  }

  // Narration → concert: zoom blur (energy return)
  if (prevType === 'narration' && nextType === 'concert_audio') {
    return zoomBlur();
  }

  // Mood-based transitions
  const mood = nextMood ?? prevMood;
  if (mood) {
    if (mood === 'warm' || mood === 'earthy') return filmBurn();
    if (mood === 'electric' || mood === 'psychedelic') return flashCut();
    if (mood === 'cosmic') return iris();
    if (mood === 'dark') return dipToBlack();
  }

  // Context segments: diagonal wipe for editorial variety
  if (nextType === 'context_text') return diagonalWipe();

  // End screen: dip to black
  if (nextType === 'end_screen') return dipToBlack();

  // Default: crossfade
  return fade();
}

/**
 * Compute absolute frame positions for each concert segment (for setlist progress).
 */
function buildSongPositions(segments: SegmentProps[], crossfadeFrames: number): SongPosition[] {
  const songs: SongPosition[] = [];
  let cursor = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === 'concert_audio') {
      songs.push({
        name: seg.songName,
        startFrame: cursor,
        endFrame: cursor + seg.durationInFrames,
      });
    }
    cursor += seg.durationInFrames;
    if (i < segments.length - 1) {
      cursor -= crossfadeFrames;
    }
  }
  return songs;
}

/**
 * Compute narration timings from segments for composition-level audio ducking.
 */
function buildNarrationTimings(segments: SegmentProps[], crossfadeFrames: number): Array<{ startFrame: number; endFrame: number }> {
  const timings: Array<{ startFrame: number; endFrame: number }> = [];
  let cursor = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === 'narration') {
      timings.push({
        startFrame: cursor,
        endFrame: cursor + seg.durationInFrames,
      });
    }
    cursor += seg.durationInFrames;
    if (i < segments.length - 1) {
      cursor -= crossfadeFrames;
    }
  }
  return timings;
}

/** Get a human-readable segment name for error boundary display */
function getSegmentName(seg: SegmentProps, index: number): string {
  switch (seg.type) {
    case 'concert_audio': return `Concert: ${seg.songName}`;
    case 'narration': return `Narration #${index}`;
    case 'context_text': return `Context #${index}`;
    case 'chapter_card': return `Chapter: ${seg.title}`;
    case 'cold_open':
    case 'cold_open_v2': return 'Cold Open';
    case 'brand_intro': return 'Brand Intro';
    case 'end_screen': return 'End Screen';
    default: return `Segment #${index}`;
  }
}

export const Episode: React.FC<Record<string, unknown>> = (rawProps) => {
  const { segments, totalDurationInFrames, ambientBedSrc, tensionDroneSrc } = rawProps as unknown as EpisodeProps;
  const songPositions = buildSongPositions(segments, CROSSFADE_FRAMES);
  const narrationTimings = buildNarrationTimings(segments, CROSSFADE_FRAMES);

  return (
    <div style={{ flex: 1, backgroundColor: '#0a0a0a', position: 'relative' }}>
      <TransitionSeries>
        {segments.map((seg, i) => {
          const prevType = i > 0 ? segments[i - 1].type : '';
          const prevMood = i > 0 && 'mood' in segments[i - 1] ? (segments[i - 1] as { mood?: string }).mood : undefined;
          const nextMood = 'mood' in seg ? (seg as { mood?: string }).mood : undefined;

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
                    segmentIndex={i}
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
                    textLines={seg.textLines}
                    songDNA={seg.songDNA}
                    segmentIndex={i}
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
                    segmentIndex={i}
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
                <SegmentErrorBoundary segmentName={getSegmentName(seg, i)}>
                  {content}
                </SegmentErrorBoundary>
              </TransitionSeries.Sequence>
              {i < segments.length - 1 && (
                <TransitionSeries.Transition
                  presentation={enrichTransition(
                    seg.type,
                    segments[i + 1].type,
                    prevMood,
                    'mood' in segments[i + 1] ? (segments[i + 1] as { mood?: string }).mood : undefined,
                  )}
                  timing={linearTiming({ durationInFrames: CROSSFADE_FRAMES })}
                />
              )}
            </React.Fragment>
          );
        })}
      </TransitionSeries>
      {/* Composition-level ambient audio */}
      {ambientBedSrc && (
        <AmbientBed
          src={ambientBedSrc}
          narrationTimings={narrationTimings}
        />
      )}
      {tensionDroneSrc && (
        <TensionDrone
          src={tensionDroneSrc}
          narrationTimings={narrationTimings}
        />
      )}
      <LightLeak />
      <FilmLook />
      <VinylNoise />
      {songPositions.length > 0 && (
        <SetlistProgress
          songs={songPositions}
          totalDurationInFrames={totalDurationInFrames}
        />
      )}
      <CinematicLetterbox />
    </div>
  );
};
