import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export type GradePreset = 'fincher' | 'documentary' | 'cold' | 'warm' | 'corporate' | 'nineties_news' | 'courtroom' | 'none';

interface CinematicGradeProps {
  preset?: GradePreset;
  intensity?: number;
  /** If set, blend from previous preset over this many frames at scene start */
  blendFromPreset?: GradePreset;
  blendFrames?: number;
  children: React.ReactNode;
}

const PRESETS: Record<GradePreset, { filter: string; teal: string; warm: string; vignette: boolean }> = {
  fincher: {
    filter: 'brightness(0.92) contrast(1.15) saturate(0.7)',
    teal: 'rgba(20,60,70,0.12)',
    warm: 'rgba(200,160,80,0.06)',
    vignette: true,
  },
  documentary: {
    filter: 'brightness(0.95) contrast(1.1) saturate(0.8)',
    teal: 'rgba(20,50,60,0.08)',
    warm: 'rgba(180,150,80,0.04)',
    vignette: true,
  },
  cold: {
    filter: 'brightness(0.9) contrast(1.12) saturate(0.6)',
    teal: 'rgba(15,50,80,0.15)',
    warm: 'rgba(0,0,0,0)',
    vignette: true,
  },
  warm: {
    filter: 'brightness(0.94) contrast(1.1) saturate(0.85)',
    teal: 'rgba(0,0,0,0)',
    warm: 'rgba(220,170,60,0.08)',
    vignette: true,
  },
  corporate: {
    filter: 'brightness(1.02) contrast(1.05) saturate(0.5)',
    teal: 'rgba(40,60,100,0.08)',
    warm: 'rgba(200,210,230,0.06)',
    vignette: false,
  },
  nineties_news: {
    filter: 'brightness(1.05) contrast(1.2) saturate(1.15)',
    teal: 'rgba(0,0,0,0)',
    warm: 'rgba(200,140,40,0.1)',
    vignette: true,
  },
  courtroom: {
    filter: 'brightness(0.88) contrast(1.0) saturate(0.45)',
    teal: 'rgba(30,35,40,0.1)',
    warm: 'rgba(0,0,0,0)',
    vignette: true,
  },
  none: {
    filter: 'none',
    teal: 'rgba(0,0,0,0)',
    warm: 'rgba(0,0,0,0)',
    vignette: false,
  },
};

const OVERLAY_STYLE: React.CSSProperties = {
  pointerEvents: 'none',
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

/** Mood → CinematicGrade preset mapping for concert-doc */
export const MOOD_GRADE_PRESET: Record<string, GradePreset> = {
  warm: 'warm',
  earthy: 'warm',
  cosmic: 'documentary',
  psychedelic: 'documentary',
  electric: 'nineties_news',
  dark: 'cold',
};

export const CinematicGrade: React.FC<CinematicGradeProps> = ({
  preset = 'documentary',
  intensity = 1,
  blendFromPreset,
  blendFrames = 75,
  children,
}) => {
  const frame = useCurrentFrame();
  const p = PRESETS[preset];
  if (preset === 'none' || intensity === 0) {
    return <>{children}</>;
  }

  // Act-grade blend: smoothly transition from previous act's grade
  const isBlending = blendFromPreset && blendFromPreset !== preset && blendFromPreset !== 'none';
  let blendT = 1;
  if (isBlending) {
    const rawT = interpolate(frame, [0, blendFrames], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    blendT = rawT * rawT * (3 - 2 * rawT);
  }

  const prevP = isBlending ? PRESETS[blendFromPreset!] : p;
  const prevOpacity = isBlending ? (1 - blendT) * intensity : 0;
  const currOpacity = isBlending ? blendT * intensity : intensity;

  return (
    <AbsoluteFill style={{ filter: intensity === 1 ? p.filter : undefined }}>
      {children}
      {/* Previous grade fading out */}
      {isBlending && prevOpacity > 0.01 && (
        <>
          <div style={{ ...OVERLAY_STYLE, backgroundColor: prevP.teal, mixBlendMode: 'multiply', opacity: prevOpacity }} />
          <div style={{ ...OVERLAY_STYLE, backgroundColor: prevP.warm, mixBlendMode: 'screen', opacity: prevOpacity }} />
        </>
      )}
      {/* Current grade fading in */}
      <div
        style={{
          ...OVERLAY_STYLE,
          backgroundColor: p.teal,
          mixBlendMode: 'multiply',
          opacity: currOpacity,
        }}
      />
      <div
        style={{
          ...OVERLAY_STYLE,
          backgroundColor: p.warm,
          mixBlendMode: 'screen',
          opacity: currOpacity,
        }}
      />
      {/* Cinematic vignette */}
      {p.vignette && (
        <div
          style={{
            ...OVERLAY_STYLE,
            background:
              'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%)',
            opacity: intensity,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
