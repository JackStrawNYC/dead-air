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
import { smoothstepVolume } from '../utils/audio';
import { assignCameraPreset, getCameraSpeed } from '../utils/cameraAssignment';

const MOOD_TO_GRADE_START: Record<string, GradeMood> = {
  warm: 'warm', earthy: 'warm', psychedelic: 'warm',
  cosmic: 'neutral', electric: 'neutral', dark: 'neutral',
};
const MOOD_TO_GRADE_END: Record<string, GradeMood> = {
  warm: 'warm', earthy: 'warm',
  cosmic: 'cold', electric: 'cold', psychedelic: 'cold', dark: 'cold',
};

interface TextLineProps {
  text: string;
  displayDuration: number;
  style: 'fact' | 'quote' | 'analysis' | 'transition';
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

const FADE_FRAMES = 15;
const AMBIENT_VOLUME = 0.18;

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

  // Sequential text layout
  let cursor = 0;
  const entries = textLines.map((line) => {
    const dur = Math.round(line.displayDuration * FPS);
    const entry = { ...line, startFrame: cursor, durationInFrames: dur };
    cursor += dur;
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
          {entries.map((entry, i) => (
            <TextOverlay
              key={i}
              text={entry.text}
              style={entry.style}
              startFrame={entry.startFrame}
              durationInFrames={entry.durationInFrames}
              colorAccent={accent}
            />
          ))}
          {ambientAudioSrc && (
            <Audio
              src={staticFile(ambientAudioSrc)}
              startFrom={ambientStartFrom ?? 0}
              volume={ambientVolume}
            />
          )}
          <Branding />
          <ArchivalTexture era="early_modern" intensity={0.4} />
          <FilmGrain intensity={0.10} />
          <BreathingOverlay breathingFrames={45} />
        </div>
      </DynamicGrade>
    </CinematicGrade>
  );
};
