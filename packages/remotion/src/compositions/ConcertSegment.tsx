import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { TextOverlay } from '../components/TextOverlay';
import { CinematicLowerThird } from '../components/CinematicLowerThird';
import { Branding } from '../components/Branding';
import { WaveformBar } from '../components/WaveformBar';
import { FilmGrain } from '../components/FilmGrain';
import { DynamicGrade, GradeMood } from '../components/DynamicGrade';
import { CinematicGrade, MOOD_GRADE_PRESET } from '../components/CinematicGrade';
import { ArchivalTexture } from '../components/ArchivalTexture';
import { BreathingOverlay } from '../components/BreathingOverlay';
import { CrowdAmbience } from '../components/CrowdAmbience';
import { StageLighting } from '../components/StageLighting';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';
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
import { FPS, getMoodAccent, MOOD_PALETTES } from '../styles/themes';

interface TextLineProps {
  text: string;
  displayDuration: number; // seconds
  style: 'fact' | 'quote' | 'analysis' | 'transition';
}

interface ConcertSegmentProps {
  songName: string;
  audioSrc: string;
  startFrom: number;
  images: string[];
  mood: string;
  colorPalette: string[];
  energyData?: number[];
  textLines?: TextLineProps[];
  visualIntensity?: number;
  /** Segment index for deterministic camera assignment */
  segmentIndex?: number;
  /** Concert foley SFX source (guarded: only renders if provided) */
  foleySrc?: string;
  /** Foley volume (default: 0.10) */
  foleyVolume?: number;
  /** Foley delay in frames (default: 5) */
  foleyDelay?: number;
}

const FADE_FRAMES = 15;

export const ConcertSegment: React.FC<ConcertSegmentProps> = ({
  songName,
  audioSrc,
  startFrom,
  images,
  mood,
  colorPalette,
  energyData,
  textLines,
  segmentIndex = 0,
  foleySrc,
  foleyVolume = 0.10,
  foleyDelay = 5,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = colorPalette?.[0] ?? getMoodAccent(mood);
  const moodPalette = (MOOD_PALETTES as Record<string, { primary: string; secondary: string; glow: string }>)[mood];
  const secondaryColor = moodPalette?.secondary;

  const volume = smoothstepVolume(frame, durationInFrames, 5, FADE_FRAMES);

  // Energy
  let currentEnergy: number | undefined;
  if (energyData && energyData.length > 0) {
    const raw = sampleEnergy(energyData, frame, durationInFrames);
    const { min, range } = normalizeEnergy(energyData);
    currentEnergy = (raw - min) / range;
  }

  // Mood-based camera assignment
  const cameraPreset = assignCameraPreset(mood, segmentIndex);
  const speedMultiplier = getCameraSpeed(mood);

  // Text layout
  let textEntries: Array<TextLineProps & { startFrame: number; durationInFrames: number }> = [];
  if (textLines && textLines.length > 0) {
    let cursor = Math.round(FPS * 3);
    textEntries = textLines.map((line) => {
      const dur = Math.round(line.displayDuration * FPS);
      const entry = { ...line, startFrame: cursor, durationInFrames: dur };
      cursor += dur;
      return entry;
    });
  }

  const gradeStart = MOOD_TO_GRADE_START[mood] ?? 'neutral';
  const gradeEnd = MOOD_TO_GRADE_END[mood] ?? 'neutral';
  const gradePreset = MOOD_GRADE_PRESET[mood] ?? 'documentary';

  // Foley volume with delay and fade
  const foleyVol = foleySrc
    ? smoothstepVolume(Math.max(0, frame - foleyDelay), durationInFrames - foleyDelay, 10, 20, foleyVolume)
    : 0;

  return (
    <CinematicGrade preset={gradePreset}>
      <DynamicGrade startMood={gradeStart} endMood={gradeEnd}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <KenBurns
            images={images}
            durationInFrames={durationInFrames}
            energyData={energyData}
            cameraPreset={cameraPreset}
            speedMultiplier={speedMultiplier}
          />
          <Audio src={staticFile(audioSrc)} startFrom={startFrom} volume={volume} />
          {foleySrc && foleyVol > 0 && (
            <Audio src={staticFile(foleySrc)} volume={foleyVol} />
          )}
          {textEntries.length > 0 && (
            <>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(to top, rgba(10,10,10,0.7) 0%, rgba(10,10,10,0.15) 40%, transparent 100%)',
                }}
              />
              {textEntries.map((entry, i) => (
                <TextOverlay
                  key={i}
                  text={entry.text}
                  style={entry.style}
                  startFrame={entry.startFrame}
                  durationInFrames={entry.durationInFrames}
                  colorAccent={accent}
                />
              ))}
            </>
          )}
          <CinematicLowerThird
            title={songName}
            subtitle="Now Playing"
            colorAccent={accent}
            currentEnergy={currentEnergy}
          />
          {energyData && energyData.length > 0 && (
            <WaveformBar
              energyData={energyData}
              colorAccent={accent}
              secondaryColor={secondaryColor}
            />
          )}
          <StageLighting mood={mood} currentEnergy={currentEnergy} />
          <CrowdAmbience />
          <Branding />
          <ArchivalTexture era="early_modern" intensity={0.3} />
          <FilmGrain intensity={0.12} />
          <BreathingOverlay breathingFrames={45} />
        </div>
      </DynamicGrade>
    </CinematicGrade>
  );
};
