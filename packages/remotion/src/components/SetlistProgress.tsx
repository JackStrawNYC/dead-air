import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles/themes';

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
 * Setlist progress indicator — thin line at the bottom of frame
 * with dots for each song and an active song label.
 *
 * - Thin horizontal track showing episode progress
 * - Dots for each concert segment, glow on active
 * - Active song name label with animated reveal
 * - Current position indicator
 * - Fades in/out to avoid cluttering opening/closing
 */
export const SetlistProgress: React.FC<SetlistProgressProps> = ({
  songs,
  totalDurationInFrames,
  colorAccent = COLORS.accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (songs.length === 0) return null;

  // Only show during concert portions
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
        height: 40,
        opacity,
        zIndex: 998,
        display: 'flex',
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {/* Track line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
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
          bottom: 0,
          width: `${progressFraction * 100}%`,
          height: 1,
          backgroundColor: 'rgba(255,255,255,0.3)',
          borderRadius: 1,
        }}
      />
      {/* Song dots + labels */}
      {songs.map((song, i) => {
        const dotPosition = ((song.startFrame + song.endFrame) / 2) / totalDurationInFrames;
        const isActive = i === activeSongIndex;
        const isPast = frame > song.endFrame;

        // Animated label for active song
        const labelProgress = isActive
          ? spring({
              frame: Math.max(0, frame - song.startFrame),
              fps,
              config: { damping: 18, mass: 0.6, stiffness: 100 },
            })
          : 0;

        // Fade out label near end of song
        const labelFadeOut = isActive
          ? interpolate(frame, [song.endFrame - 30, song.endFrame], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 0;

        const labelOpacity = labelProgress * labelFadeOut;

        // Truncate long song names
        const displayName = song.name.length > 22 ? song.name.slice(0, 20) + '...' : song.name;

        return (
          <React.Fragment key={i}>
            {/* Dot */}
            <div
              style={{
                position: 'absolute',
                left: `${dotPosition * 100}%`,
                bottom: -1,
                transform: 'translateX(-50%)',
                width: isActive ? 6 : 4,
                height: isActive ? 6 : 4,
                borderRadius: '50%',
                backgroundColor: isActive ? colorAccent : isPast ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)',
                boxShadow: isActive ? `0 0 8px ${colorAccent}` : 'none',
              }}
            />
            {/* Active song label */}
            {labelOpacity > 0.01 && (
              <div
                style={{
                  position: 'absolute',
                  left: `${dotPosition * 100}%`,
                  bottom: 12,
                  transform: `translateX(-50%) translateY(${(1 - labelProgress) * 6}px)`,
                  opacity: labelOpacity,
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  fontWeight: 500,
                  color: colorAccent,
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 6px rgba(0,0,0,0.8)',
                  letterSpacing: 0.5,
                }}
              >
                {displayName}
              </div>
            )}
          </React.Fragment>
        );
      })}
      {/* Current position indicator */}
      <div
        style={{
          position: 'absolute',
          left: `${progressFraction * 100}%`,
          bottom: -3,
          transform: 'translateX(-50%)',
          width: 2,
          height: 8,
          backgroundColor: 'rgba(255,255,255,0.5)',
          borderRadius: 1,
        }}
      />
    </div>
  );
};
