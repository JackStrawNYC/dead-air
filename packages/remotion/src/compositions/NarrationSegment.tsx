import React from 'react';
import { Audio, spring, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { Branding } from '../components/Branding';
import { FilmGrain } from '../components/FilmGrain';
import { DynamicGrade, GradeMood } from '../components/DynamicGrade';
import { CinematicGrade, MOOD_GRADE_PRESET } from '../components/CinematicGrade';
import { ArchivalTexture } from '../components/ArchivalTexture';
import { BreathingOverlay } from '../components/BreathingOverlay';
import { COLORS, FONTS, getMoodAccent } from '../styles/themes';
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

interface NarrationSegmentProps {
  audioSrc: string;
  images: string[];
  mood: string;
  colorPalette: string[];
  concertBedSrc?: string;
  concertBedStartFrom?: number;
  /** Segment index for deterministic camera assignment */
  segmentIndex?: number;
}

const FADE_FRAMES = 15;

export const NarrationSegment: React.FC<NarrationSegmentProps> = ({
  audioSrc,
  images,
  mood,
  concertBedSrc,
  concertBedStartFrom,
  segmentIndex = 0,
}) => {
  const { durationInFrames, fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = getMoodAccent(mood);

  // Narration: J-cut fast attack
  const volume = smoothstepVolume(frame, durationInFrames, 3, FADE_FRAMES);

  // Concert bed: smoothstep ducking (asymmetric)
  const bedVolume = (() => {
    if (!concertBedSrc) return 0;
    const FULL = 0.12;
    const DUCKED = 0.04;
    // Duck down over 24 frames at start, recover over 30 at end
    const duckDown = interpolate(frame, [0, 24], [FULL, DUCKED], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const duckUp = interpolate(frame, [durationInFrames - 30, durationInFrames], [DUCKED, FULL], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    // Composition fade
    const compFade = smoothstepVolume(frame, durationInFrames, FADE_FRAMES, FADE_FRAMES);
    // During the body, stay ducked
    const bodyVolume = frame < 24 ? duckDown : frame > durationInFrames - 30 ? duckUp : DUCKED;
    return bodyVolume * compFade;
  })();

  // Narration indicator
  const indicatorSlide = spring({
    frame,
    fps,
    config: { damping: 18, mass: 0.6, stiffness: 100 },
  });
  const indicatorX = (1 - indicatorSlide) * -40;
  const indicatorOpacity = smoothstepVolume(frame, durationInFrames, 15, 20);
  const pulseOpacity = 0.4 + Math.sin(frame * 0.15) * 0.3;

  const gradeStart = MOOD_TO_GRADE_START[mood] ?? 'neutral';
  const gradeEnd = MOOD_TO_GRADE_END[mood] ?? 'neutral';
  const gradePreset = MOOD_GRADE_PRESET[mood] ?? 'documentary';

  // Mood-based camera
  const cameraPreset = assignCameraPreset(mood, segmentIndex);
  const speedMultiplier = getCameraSpeed(mood);

  return (
    <CinematicGrade preset={gradePreset}>
      <DynamicGrade startMood={gradeStart} endMood={gradeEnd} intensity={0.5}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <KenBurns
            images={images}
            durationInFrames={durationInFrames}
            cameraPreset={cameraPreset}
            speedMultiplier={speedMultiplier}
          />
          <Audio src={staticFile(audioSrc)} volume={volume} />
          {concertBedSrc && (
            <Audio
              src={staticFile(concertBedSrc)}
              startFrom={concertBedStartFrom ?? 0}
              volume={bedVolume}
            />
          )}
          {/* Narration indicator */}
          <div
            style={{
              position: 'absolute',
              bottom: 40,
              left: 40,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              opacity: indicatorOpacity,
              transform: `translateX(${indicatorX}px)`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: accent,
                opacity: pulseOpacity,
              }}
            />
            <span
              style={{
                fontFamily: FONTS.body,
                fontSize: 14,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 3,
                color: COLORS.textMuted,
                opacity: 0.5,
              }}
            >
              NARRATION
            </span>
          </div>
          <Branding />
          <ArchivalTexture era="early_modern" intensity={0.3} />
          <FilmGrain intensity={0.10} />
          <BreathingOverlay breathingFrames={60} />
        </div>
      </DynamicGrade>
    </CinematicGrade>
  );
};
