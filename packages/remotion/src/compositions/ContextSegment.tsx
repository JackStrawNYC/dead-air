import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { TextOverlay } from '../components/TextOverlay';
import { Branding } from '../components/Branding';
import { FilmGrain } from '../components/FilmGrain';
import { DynamicGrade, GradeMood } from '../components/DynamicGrade';
import { CinematicGrade, MOOD_GRADE_PRESET } from '../components/CinematicGrade';
import { ArchivalTexture } from '../components/ArchivalTexture';
import { BreathingOverlay } from '../components/BreathingOverlay';
import { FPS, getMoodAccent } from '../styles/themes';
import { PsychedelicLoop, PsychedelicVariant } from '../components/PsychedelicLoop';
import { ListenFor } from '../components/ListenFor';
import { FanQuote } from '../components/FanQuote';
import { smoothstepVolume } from '../utils/audio';
import { assignCameraPreset, getCameraSpeed } from '../utils/cameraAssignment';

const MOOD_TO_PSYCHEDELIC: Record<string, PsychedelicVariant> = {
  psychedelic: 'fractal',
  cosmic: 'aurora',
  warm: 'liquid',
  earthy: 'liquid',
  electric: 'liquid',
  dark: 'liquid',
};

const MOOD_TO_GRADE_START: Record<string, GradeMood> = {
  warm: 'warm', earthy: 'warm', psychedelic: 'warm',
  cosmic: 'neutral', electric: 'neutral', dark: 'neutral',
};
const MOOD_TO_GRADE_END: Record<string, GradeMood> = {
  warm: 'warm', earthy: 'warm',
  cosmic: 'cold', electric: 'cold', psychedelic: 'cold', dark: 'cold',
};

const MOOD_TO_ERA: Record<string, 'colonial' | 'victorian' | 'early_modern' | 'modern'> = {
  psychedelic: 'colonial',
  cosmic: 'victorian',
  dark: 'victorian',
  warm: 'early_modern',
  earthy: 'early_modern',
  electric: 'modern',
};

interface TextLineProps {
  text: string;
  displayDuration: number;
  style: 'fact' | 'quote' | 'analysis' | 'transition' | 'listenFor' | 'fanQuote';
}

interface ContextSegmentProps {
  textLines: TextLineProps[];
  images: string[];
  mood: string;
  colorPalette: string[];
  ambientAudioSrc?: string;
  ambientStartFrom?: number;
  /** Segment index for deterministic camera assignment */
  segmentIndex?: number;
}

const FADE_FRAMES = 45;
const AMBIENT_VOLUME = 0.10;  // Reduced from 0.28 — was ~5x louder than AmbientBed (0.06)

export const ContextSegment: React.FC<ContextSegmentProps> = ({
  textLines,
  images,
  mood,
  colorPalette,
  ambientAudioSrc,
  ambientStartFrom,
  segmentIndex = 0,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = colorPalette?.[0] ?? getMoodAccent(mood);

  const ambientVolume = ambientAudioSrc
    ? smoothstepVolume(frame, durationInFrames, FADE_FRAMES, FADE_FRAMES, AMBIENT_VOLUME)
    : 0;

  // Sequential text layout with breathing gaps
  const CTX_GAP_FRAMES = Math.round(FPS * 0.5); // 0.5s between context lines
  let cursor = Math.round(FPS * 0.5); // start at 0.5s
  const entries = textLines.map((line, idx) => {
    const dur = Math.round(line.displayDuration * FPS);
    const entry = { ...line, startFrame: cursor, durationInFrames: dur };
    cursor += dur + (idx < textLines.length - 1 ? CTX_GAP_FRAMES : 0);
    return entry;
  });

  const gradeStart = MOOD_TO_GRADE_START[mood] ?? 'neutral';
  const gradeEnd = MOOD_TO_GRADE_END[mood] ?? 'neutral';
  const gradePreset = MOOD_GRADE_PRESET[mood] ?? 'documentary';

  // Mood-based camera
  const cameraPreset = assignCameraPreset(mood, segmentIndex);
  const speedMultiplier = getCameraSpeed(mood);

  return (
    <CinematicGrade preset={gradePreset}>
      <DynamicGrade startMood={gradeStart} endMood={gradeEnd}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <PsychedelicLoop
            variant={MOOD_TO_PSYCHEDELIC[mood] ?? 'liquid'}
            colorPalette={colorPalette}
            durationInFrames={durationInFrames}
          />
          <KenBurns
            images={images}
            durationInFrames={durationInFrames}
            cameraPreset={cameraPreset}
            speedMultiplier={speedMultiplier}
          />
          {/* Dim overlay for text readability */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.2) 50%, transparent 100%)',
            }}
          />
          {entries.map((entry, i) => {
            if (entry.style === 'listenFor') {
              return (
                <ListenFor
                  key={i}
                  text={entry.text}
                  startFrame={entry.startFrame}
                  durationInFrames={entry.durationInFrames}
                  colorAccent={accent}
                />
              );
            }
            if (entry.style === 'fanQuote') {
              const dashMatch = entry.text.match(/^(.+?)\s*[—–-]\s*(.+)$/);
              const quoteText = dashMatch ? dashMatch[1].replace(/^[""]|[""]$/g, '') : entry.text;
              const reviewer = dashMatch ? dashMatch[2].replace(/,\s*archive\.org$/i, '') : 'anonymous';
              return (
                <FanQuote
                  key={i}
                  text={quoteText}
                  reviewer={reviewer}
                  startFrame={entry.startFrame}
                  durationInFrames={entry.durationInFrames}
                  colorAccent={accent}
                />
              );
            }
            return (
              <TextOverlay
                key={i}
                text={entry.text}
                style={entry.style as 'fact' | 'quote' | 'analysis' | 'transition'}
                startFrame={entry.startFrame}
                durationInFrames={entry.durationInFrames}
                colorAccent={accent}
              />
            );
          })}
          {ambientAudioSrc && (
            <Audio
              src={staticFile(ambientAudioSrc)}
              startFrom={ambientStartFrom ?? 0}
              volume={ambientVolume}
            />
          )}
          <Branding />
          <ArchivalTexture era={MOOD_TO_ERA[mood] ?? 'early_modern'} intensity={0.4} />
          <FilmGrain intensity={0.10} />
          <BreathingOverlay breathingFrames={45} />
        </div>
      </DynamicGrade>
    </CinematicGrade>
  );
};
