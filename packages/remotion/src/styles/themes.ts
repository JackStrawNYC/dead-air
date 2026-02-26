import { CINEMA_FONTS } from './fonts';

/** @deprecated Use CINEMA_FONTS instead for production-grade typography */
export const FONTS = {
  heading: CINEMA_FONTS.display,
  body: CINEMA_FONTS.sans,
  mono: CINEMA_FONTS.mono,
} as const;

export { CINEMA_FONTS };

export const COLORS = {
  bg: '#0a0a0a',
  text: '#f5f0e8',
  textMuted: '#a09888',
  accent: '#d4a853',
  accentDim: '#8b7234',
  overlay: 'rgba(10, 10, 10, 0.75)',
  overlayLight: 'rgba(10, 10, 10, 0.45)',
} as const;

export type Mood = 'warm' | 'cosmic' | 'electric' | 'dark' | 'earthy' | 'psychedelic';

export const MOOD_PALETTES: Record<Mood, { primary: string; secondary: string; glow: string }> = {
  warm: { primary: '#d4a853', secondary: '#c47a3a', glow: 'rgba(212, 168, 83, 0.3)' },
  cosmic: { primary: '#7b68ee', secondary: '#4a3aad', glow: 'rgba(123, 104, 238, 0.3)' },
  electric: { primary: '#00d4ff', secondary: '#0088aa', glow: 'rgba(0, 212, 255, 0.3)' },
  dark: { primary: '#8b0000', secondary: '#4a0000', glow: 'rgba(139, 0, 0, 0.3)' },
  earthy: { primary: '#8b7355', secondary: '#6b5335', glow: 'rgba(139, 115, 85, 0.3)' },
  psychedelic: { primary: '#ff6ec7', secondary: '#9b59b6', glow: 'rgba(255, 110, 199, 0.3)' },
};

export function getMoodAccent(mood: string): string {
  return (MOOD_PALETTES as Record<string, { primary: string }>)[mood]?.primary ?? COLORS.accent;
}

export const EASE = {
  smooth: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  out: [0, 0, 0.2, 1] as [number, number, number, number],
  in: [0.4, 0, 1, 1] as [number, number, number, number],
};

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
