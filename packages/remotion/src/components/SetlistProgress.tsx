import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from '../styles/themes';

export interface SongPosition {
  name: string;
  startFrame: number;
  endFrame: number;
}

interface SetlistProgressProps {
  /** Song positions in absolute composition frames */
  songs: SongPosition[];
  /** Total episode duration in frames */
  totalDurationInFrames: number;
  colorAccent?: string;
}

/**
 * Minimal setlist progress indicator — thin line at the bottom of frame
 * (inside letterbox area) with dots for each song.
 *
 * - Thin horizontal track showing episode progress
 * - Dots for each concert segment, glow on active
 * - Current position indicator
 * - Fades in/out to avoid cluttering opening/closing
 */
export const SetlistProgress: React.FC<SetlistProgressProps> = ({
  songs,
  totalDurationInFrames,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();

  if (songs.length === 0) return null;

  // Only show during concert portions (fade in after first song starts, fade before end)
  const firstSongStart = songs[0].startFrame;
  const lastSongEnd = songs[songs.length - 1].endFrame;

  const opacity = interpolate(
    frame,
    [firstSongStart - 30, firstSongStart, lastSongEnd, lastSongEnd + 30],
    [0, 0.6, 0.6, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  if (opacity < 0.01) return null;

  // Current position as fraction of total duration
  const progressFraction = frame / totalDurationInFrames;

  // Determine which song is currently active
  const activeSongIndex = songs.findIndex(
    (s) => frame >= s.startFrame && frame <= s.endFrame,
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '10%',
        right: '10%',
        height: 20,
        opacity,
        zIndex: 998,
        display: 'flex',
        alignItems: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* Track line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderRadius: 1,
        }}
      />
      {/* Progress fill */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          width: `${progressFraction * 100}%`,
          height: 1,
          backgroundColor: `rgba(255,255,255,0.3)`,
          borderRadius: 1,
        }}
      />
      {/* Song dots */}
      {songs.map((song, i) => {
        const dotPosition = ((song.startFrame + song.endFrame) / 2) / totalDurationInFrames;
        const isActive = i === activeSongIndex;
        const isPast = frame > song.endFrame;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${dotPosition * 100}%`,
              transform: 'translateX(-50%)',
              width: isActive ? 6 : 4,
              height: isActive ? 6 : 4,
              borderRadius: '50%',
              backgroundColor: isActive ? colorAccent : isPast ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)',
              boxShadow: isActive ? `0 0 8px ${colorAccent}` : 'none',
              transition: 'all 0.1s',
            }}
          />
        );
      })}
      {/* Current position indicator */}
      <div
        style={{
          position: 'absolute',
          left: `${progressFraction * 100}%`,
          transform: 'translate(-50%, -50%)',
          top: '50%',
          width: 2,
          height: 8,
          backgroundColor: 'rgba(255,255,255,0.5)',
          borderRadius: 1,
        }}
      />
    </div>
  );
};
