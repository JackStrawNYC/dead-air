import React from 'react';
import { Audio, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { KenBurns } from '../components/KenBurns';
import { TextOverlay } from '../components/TextOverlay';
import { CinematicLowerThird } from '../components/CinematicLowerThird';
import { Branding } from '../components/Branding';
import { WaveformBar } from '../components/WaveformBar';
import { FilmGrain } from '../components/FilmGrain';
import { DynamicGrade, GradeMood } from '../components/DynamicGrade';
import { CinematicGrade } from '../components/CinematicGrade';
import { ArchivalTexture } from '../components/ArchivalTexture';
import { BreathingOverlay } from '../components/BreathingOverlay';
import { CrowdAmbience } from '../components/CrowdAmbience';
import { StageLighting } from '../components/StageLighting';
import { sampleEnergy, normalizeEnergy } from '../utils/energy';
import { PsychedelicLoop, PsychedelicVariant } from '../components/PsychedelicLoop';
import { SongDNA } from '../components/SongDNA';
import { ListenFor } from '../components/ListenFor';
import { FanQuote } from '../components/FanQuote';
import { EnergyPreview } from '../components/EnergyPreview';
import { smoothstepVolume } from '../utils/audio';
import { assignCameraPreset, getCameraSpeed } from '../utils/cameraAssignment';
import { BeatKick } from '../components/BeatKick';
import { ChromaticAberration } from '../components/ChromaticAberration';
import { OnsetFlash } from '../components/OnsetFlash';
import { ParticleBurst } from '../components/ParticleBurst';
import { FilmStockGrade, MOOD_FILM_STOCK } from '../components/FilmStockGrade';
import { Halation } from '../components/Halation';
import { FilmGateWeaveWrapper } from '../components/FilmGateWeave';

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
import { FPS, getMoodAccent, MOOD_PALETTES } from '../styles/themes';

// Mood → archival texture era: psychedelic gets heavy grain, high-energy gets clean
const MOOD_TO_ERA: Record<string, 'colonial' | 'victorian' | 'early_modern' | 'modern'> = {
  psychedelic: 'colonial',   // heavy grain — trippy analog feel
  cosmic: 'victorian',       // amber tint, film scratches
  dark: 'victorian',         // moody, aged look
  warm: 'early_modern',      // classic film grain
  earthy: 'early_modern',    // natural warmth
  electric: 'modern',        // lighter grain, cleaner energy
};

interface TextLineProps {
  text: string;
  displayDuration: number; // seconds
  style: 'fact' | 'quote' | 'analysis' | 'transition' | 'listenFor' | 'fanQuote';
}

interface SongDNAData {
  timesPlayed: number;
  firstPlayed: string;
  lastPlayed: string;
  rank?: string;
}

interface ConcertSegmentProps {
  songName: string;
  audioSrc: string;
  startFrom: number;
  images: string[];
  mood: string;
  colorPalette: string[];
  energyData?: number[];
  /** Onset timings in frames (from librosa onset_detect) */
  onsetFrames?: number[];
  /** Spectral centroid data for frequency-aware visuals */
  spectralCentroid?: number[];
  textLines?: TextLineProps[];
  songDNA?: SongDNAData;
  visualIntensity?: number;
  /** Segment index for deterministic camera assignment */
  segmentIndex?: number;
  /** Concert foley SFX source (guarded: only renders if provided) */
  foleySrc?: string;
  /** Foley volume (default: 0.10) */
  foleyVolume?: number;
  /** Foley delay in frames (default: 5) */
  foleyDelay?: number;
  /** Whether crowd ambience audio file exists (default true) */
  hasCrowdAmbience?: boolean;
}

const FADE_IN_FRAMES = 15;  // Quick but not instant — J-cut style
const FADE_OUT_FRAMES = 60; // 2s tail for natural concert feel

export const ConcertSegment: React.FC<ConcertSegmentProps> = ({
  songName,
  audioSrc,
  startFrom,
  images,
  mood,
  colorPalette,
  energyData,
  onsetFrames,
  spectralCentroid,
  textLines,
  songDNA,
  segmentIndex = 0,
  foleySrc,
  foleyVolume = 0.10,
  foleyDelay = 5,
  hasCrowdAmbience = true,
}) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const accent = colorPalette?.[0] ?? getMoodAccent(mood);
  const moodPalette = (MOOD_PALETTES as Record<string, { primary: string; secondary: string; glow: string }>)[mood];
  const secondaryColor = moodPalette?.secondary;

  const volume = smoothstepVolume(frame, durationInFrames, FADE_IN_FRAMES, FADE_OUT_FRAMES);

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

  // Text layout — dense overlays with breathing gaps
  const GAP_FRAMES = Math.round(FPS * 1.5); // 1.5s between overlays
  let textEntries: Array<TextLineProps & { startFrame: number; durationInFrames: number }> = [];
  if (textLines && textLines.length > 0) {
    let cursor = Math.round(FPS * 2); // start at 2s instead of 3s
    textEntries = textLines.map((line) => {
      const dur = Math.round(line.displayDuration * FPS);
      const entry = { ...line, startFrame: cursor, durationInFrames: dur };
      cursor += dur + GAP_FRAMES;
      return entry;
    });

    // Overflow compression: if text extends past segment, recompute with tighter gaps
    const lastEntry = textEntries[textEntries.length - 1];
    if (lastEntry && lastEntry.startFrame + lastEntry.durationInFrames > durationInFrames) {
      const totalTextFrames = textEntries.reduce((sum, e) => sum + e.durationInFrames, 0);
      const availableFrames = durationInFrames - Math.round(FPS * 2);
      const totalGapFrames = Math.max(0, availableFrames - totalTextFrames);
      const gapPerEntry = textLines.length > 1 ? Math.floor(totalGapFrames / (textLines.length - 1)) : 0;

      cursor = Math.round(FPS * 2);
      textEntries = textLines.map((line, idx) => {
        const dur = Math.round(line.displayDuration * FPS);
        const entry = { ...line, startFrame: cursor, durationInFrames: dur };
        cursor += dur + (idx < textLines.length - 1 ? gapPerEntry : 0);
        return entry;
      });
    }
  }

  const gradeStart = MOOD_TO_GRADE_START[mood] ?? 'neutral';
  const gradeEnd = MOOD_TO_GRADE_END[mood] ?? 'neutral';
  const filmStock = MOOD_FILM_STOCK[mood] ?? 'teal_orange';

  // Foley volume with delay and fade
  const foleyVol = foleySrc
    ? smoothstepVolume(Math.max(0, frame - foleyDelay), durationInFrames - foleyDelay, 10, 20, foleyVolume)
    : 0;

  return (
    <FilmStockGrade stock={filmStock} intensity={0.85}>
      <DynamicGrade startMood={gradeStart} endMood={gradeEnd}>
        <FilmGateWeaveWrapper format="35mm" intensity={0.3}>
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <PsychedelicLoop
            variant={MOOD_TO_PSYCHEDELIC[mood] ?? 'liquid'}
            colorPalette={colorPalette}
            durationInFrames={durationInFrames}
            speed={currentEnergy !== undefined
              ? 0.5 + currentEnergy * 1.3  // calm=0.5, mid=1.15, peak=1.8
              : 1
            }
          />
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
              {textEntries.map((entry, i) => {
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
                  // Parse reviewer from text format: "quote text" — reviewer
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
            </>
          )}
          {songDNA && (
            <SongDNA
              songName={songName}
              timesPlayed={songDNA.timesPlayed}
              firstPlayed={songDNA.firstPlayed}
              lastPlayed={songDNA.lastPlayed}
              rank={songDNA.rank}
              colorAccent={accent}
            />
          )}
          {energyData && energyData.length > 0 && (
            <EnergyPreview
              energyData={energyData}
              colorAccent={accent}
              secondaryColor={secondaryColor}
            />
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
              spectralCentroid={spectralCentroid}
            />
          )}
          <StageLighting mood={mood} currentEnergy={currentEnergy} />
          {/* Energy-reactive FX layers */}
          {energyData && energyData.length > 0 && (
            <>
              <BeatKick
                energyData={energyData}
                durationInFrames={durationInFrames}
                accentColor={accent}
              />
              <ChromaticAberration
                energyData={energyData}
              />
              <ParticleBurst
                energyData={energyData}
                colorPalette={colorPalette}
              />
            </>
          )}
          {onsetFrames && onsetFrames.length > 0 && (
            <OnsetFlash
              onsetFrames={onsetFrames}
              accentColor={accent}
            />
          )}
          <CrowdAmbience enabled={hasCrowdAmbience} />
          <Branding />
          <ArchivalTexture era={MOOD_TO_ERA[mood] ?? 'early_modern'} intensity={0.3} />
          <FilmGrain intensity={0.12} />
          <Halation intensity={0.06} currentEnergy={currentEnergy} />
          <BreathingOverlay breathingFrames={45} />
        </div>
        </FilmGateWeaveWrapper>
      </DynamicGrade>
    </FilmStockGrade>
  );
};
