/**
 * OverlayAndEffectsLayer — SongArtLayer + DynamicOverlayStack + IT flash + dead air shimmer.
 *
 * Extracted from SongVisualizer.tsx render tree (pure extraction, no logic changes).
 */

import React from "react";
import { staticFile } from "remotion";
import { SilentErrorBoundary } from "../SilentErrorBoundary";
import { SongArtLayer } from "./SongArtLayer";
import { DynamicOverlayStack } from "./DynamicOverlayStack";
import type { EnhancedFrameData, ColorPalette } from "../../data/types";
import type { AudioSnapshot } from "../../utils/audio-reactive";
import type { OverlayComponentEntry } from "../../data/overlay-components";

export interface OverlayAndEffectsLayerProps {
  // SongArtLayer
  effectiveSongArt?: string;
  artSuppressionFactor: number;
  hueRotation: number;
  audioSnapshot: AudioSnapshot;
  climaxIntensity: number;
  focusArtOpacity: number;
  segueIn?: boolean;
  artBlendMode?: string;
  introFactor: number;
  deadAirFactor: number;
  frame: number;
  // DynamicOverlayStack
  activeEntries: [string, OverlayComponentEntry][];
  opacityMap: Record<string, number> | null;
  mediaSuppression: number;
  tempo: number;
  palette?: ColorPalette;
  frames: EnhancedFrameData[];
  energyLevel: "quiet" | "mid" | "peak";
  // IT overlay dimming + flash
  itOverlayOverride: number;
  itFlashIntensity: number;
  itFlashHue: number;
  // Dead air shimmer
  effectivePalette?: ColorPalette;
}

export const OverlayAndEffectsLayer: React.FC<OverlayAndEffectsLayerProps> = ({
  effectiveSongArt,
  artSuppressionFactor,
  hueRotation,
  audioSnapshot,
  climaxIntensity,
  focusArtOpacity,
  segueIn,
  artBlendMode,
  introFactor,
  deadAirFactor,
  frame,
  activeEntries,
  opacityMap,
  mediaSuppression,
  tempo,
  palette,
  frames: f,
  energyLevel,
  itOverlayOverride,
  itFlashIntensity,
  itFlashHue,
  effectivePalette,
}) => (
  <>
    {/* Song art: SongArtLayer handles its own fade-in/out + dead-air reappearance internally.
        Keep it always mounted (when art exists) to avoid WebGL context crashes from unmount. */}
    {effectiveSongArt && (
      <SilentErrorBoundary name="SongArt" resetKey={frame}>
        <SongArtLayer src={staticFile(effectiveSongArt)} suppressionFactor={artSuppressionFactor} hueRotation={hueRotation} energy={audioSnapshot.energy} climaxIntensity={climaxIntensity} focusOpacity={focusArtOpacity} segueIn={segueIn} artBlendMode={artBlendMode} introFactor={Math.min(1, introFactor * 1.5)} deadAirFactor={deadAirFactor} />
      </SilentErrorBoundary>
    )}

    <DynamicOverlayStack
      activeEntries={activeEntries}
      opacityMap={opacityMap}
      mediaSuppression={mediaSuppression}
      hueRotation={hueRotation}
      tempo={tempo}
      palette={palette}
      frames={f}
      focusSuppression={1}
      energyLevel={energyLevel}
      itOverlayOverride={itOverlayOverride}
      counterpointOverlayInversion={0}
      climaxDesaturation={0}
      deadAirFactor={deadAirFactor}
    />

    {/* AI image overlay REMOVED — makes viewers think "AI slop" and adds visual noise.
        Dead identity comes from song card (intro/bookend) and the shader itself. */}

    {/* IT flash — chromatic burst on coherence break (suppressed during intro).
        CHILL CALIBRATION: capped at 0.3 max opacity (was 1.0) and threshold raised
        to 0.15 (was 0.01) so only the strongest coherence-break events fire it.
        Strict requirement: flash never strobes consecutively, must be rare. */}
    {introFactor > 0.5 && itFlashIntensity > 0.15 && (
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: itFlashHue > 0
            ? `hsla(${itFlashHue}, 60%, 85%, ${Math.min(0.3, itFlashIntensity * 0.4)})`
            : `rgba(255, 255, 255, ${Math.min(0.3, itFlashIntensity * 0.4)})`,
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      />
    )}

    {/* IT strobe — DISABLED in chill mode. Was beat-synced pulse during deep
        coherence lock; even at soft-light blend it causes "what just flashed?"
        reactions during 3-hour viewing. Replaced by the gentler beat pulse in
        postprocess.glsl.ts which is already capped at 2.5%. */}
    {/* Strobe block disabled — see chill calibration */}

    {/* Dead air ambient shimmer — audio-reactive glow when music ends */}
    {deadAirFactor > 0.01 && (() => {
      const deadRms = audioSnapshot.energy;
      const deadOnset = audioSnapshot.onsetEnvelope;
      const deadBass = audioSnapshot.bass;

      // Crowd roar → brighter shimmer
      const shimmerAlpha = (0.10 + deadRms * 0.25) * deadAirFactor;
      // Applause onset → warm color flash
      const warmShift = deadOnset > 0.3 ? deadOnset * 40 : 0;
      // Palette-tinted dead air: use song's primary hue for continuity
      const palHue = effectivePalette?.primary ?? 30;
      const palAngle = (palHue / 360) * Math.PI * 2;
      // Warm amber/orange base — crowd energy warmth
      const baseR = Math.round(180 + 50 * Math.cos(palAngle));
      const baseG = Math.round(110 + 40 * Math.cos(palAngle - 2.1));
      const baseB = Math.round(60 + 30 * Math.sin(palAngle));
      const r = Math.min(255, baseR + Math.round(warmShift * 2.0));
      const g = Math.min(255, baseG + Math.round(warmShift * 0.8));
      const b = Math.max(40, baseB - Math.round(warmShift * 1.0));
      // Bass content → wider glow
      const spread = 55 + deadBass * 25;
      // Time-based drift (keep organic feel)
      const cx = 50 + Math.sin(frame * 0.007) * (10 + deadRms * 8);
      const cy = 50 + Math.cos(frame * 0.005) * (8 + deadBass * 5);

      return (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse at ${cx}% ${cy}%, rgba(${r}, ${g}, ${b}, ${shimmerAlpha.toFixed(3)}), transparent ${spread.toFixed(0)}%)`,
          mixBlendMode: "screen",
          opacity: 0.6 + 0.4 * Math.sin(frame * 0.02) + deadRms * 0.35,
        }} />
      );
    })()}
  </>
);
