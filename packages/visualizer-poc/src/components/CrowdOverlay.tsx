/**
 * CrowdOverlay — visual treatments for crowd energy moments.
 *
 * 4 event types with distinct visual treatments using SVG radialGradients:
 *   applause:  warm SVG radial glow from bottom-center, palette-derived colors
 *   roar:      shockwave ring + particle-scatter (many small circles)
 *   holy_shit: 2-frame flash + particle burst + warm afterglow
 *   singalong: warm amber rising glow with screen blend
 *
 * Energy-responsive: dark silhouettes at low energy, warm glow at high.
 * mixBlendMode: "screen" for atmospheric light bleed on all layers.
 */

import React from "react";
import { useCurrentFrame, interpolate, Easing } from "remotion";
import type { CrowdMoment } from "../data/crowd-detector";
import { useSongPalette } from "../data/SongPaletteContext";

const FADE_FRAMES = 30;
const MAX_OPACITY = 0.35;

/** Deterministic pseudo-random from integer seed (0-1). */
function hashSeed(s: number): number {
  let x = Math.sin(s * 9301 + 49297) * 49271;
  x = x - Math.floor(x);
  return x;
}

/** HSL to CSS rgb string for SVG stop-color (SVG doesn't support hsl in stop-color everywhere). */
function hslToRgb(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return lN - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `rgb(${Math.round(f(0) * 255)},${Math.round(f(8) * 255)},${Math.round(f(4) * 255)})`;
}

/** Generate particle positions for scatter effects. Deterministic from frameStart seed. */
function scatterParticles(
  count: number,
  seed: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
): Array<{ x: number; y: number; r: number; delay: number }> {
  const particles: Array<{ x: number; y: number; r: number; delay: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = hashSeed(seed + i * 7) * Math.PI * 2;
    const dist = hashSeed(seed + i * 13 + 100) * 0.85 + 0.15;
    particles.push({
      x: cx + Math.cos(angle) * radiusX * dist,
      y: cy + Math.sin(angle) * radiusY * dist,
      r: 2 + hashSeed(seed + i * 19 + 200) * 6,
      delay: hashSeed(seed + i * 23 + 300) * 0.4,
    });
  }
  return particles;
}

interface Props {
  moments: CrowdMoment[];
}

export const CrowdOverlay: React.FC<Props> = ({ moments }) => {
  const frame = useCurrentFrame();
  const palette = useSongPalette();

  const layers: React.ReactNode[] = [];

  for (const m of moments) {
    if (frame < m.frameStart - FADE_FRAMES || frame >= m.frameEnd + FADE_FRAMES) continue;

    const fadeIn = interpolate(
      frame,
      [m.frameStart - FADE_FRAMES, m.frameStart],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const fadeOut = interpolate(
      frame,
      [m.frameEnd, m.frameEnd + FADE_FRAMES],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
    );
    const momentOpacity = Math.min(fadeIn, fadeOut);
    if (momentOpacity < 0.01) continue;

    const hue = palette?.primary ?? 30;
    const sat = (palette?.saturation ?? 1) * 100;
    const intensity = Math.min(1, m.avgIntensity * 2);

    // Energy-responsive glow: low energy = dark/dim, high energy = warm/bright
    const glowLightness = interpolate(intensity, [0, 1], [15, 60], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const glowSaturation = interpolate(intensity, [0, 1], [30, Math.min(sat, 90)], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    switch (m.type) {
      case "applause": {
        // SVG radial glow from bottom-center with palette-derived colors
        const opacity = momentOpacity * MAX_OPACITY * intensity;
        const gradId = `applause-grad-${m.frameStart}`;
        const coreColor = hslToRgb(hue, glowSaturation, glowLightness);
        const midColor = hslToRgb((hue + 15) % 360, glowSaturation * 0.8, glowLightness * 0.7);

        layers.push(
          <svg
            key={`applause-${m.frameStart}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              mixBlendMode: "screen",
            }}
            viewBox="0 0 1920 1080"
            preserveAspectRatio="none"
          >
            <defs>
              <radialGradient
                id={gradId}
                cx="50%"
                cy="100%"
                rx="60%"
                ry="50%"
                fx="50%"
                fy="95%"
              >
                <stop offset="0%" stopColor={coreColor} stopOpacity={opacity} />
                <stop offset="40%" stopColor={midColor} stopOpacity={opacity * 0.6} />
                <stop offset="70%" stopColor={midColor} stopOpacity={opacity * 0.15} />
                <stop offset="100%" stopColor="black" stopOpacity={0} />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="1920" height="1080" fill={`url(#${gradId})`} />
          </svg>,
        );
        break;
      }

      case "roar": {
        // Shockwave ring + particle scatter (many small circles)
        const eventProgress = interpolate(
          frame,
          [m.frameStart, m.frameStart + 15],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const ringRadius = interpolate(eventProgress, [0, 1], [700, 300], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const ringOpacity = momentOpacity * 0.5 * intensity * (1 - eventProgress * 0.5);
        const gradId = `roar-grad-${m.frameStart}`;
        const ringColor = hslToRgb(hue, glowSaturation, glowLightness);

        // Particle scatter: 20-40 small circles exploding outward
        const particleCount = Math.round(20 + intensity * 20);
        const particles = scatterParticles(
          particleCount,
          m.frameStart,
          960, 540,
          800, 500,
        );

        layers.push(
          <svg
            key={`roar-${m.frameStart}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              mixBlendMode: "screen",
            }}
            viewBox="0 0 1920 1080"
            preserveAspectRatio="none"
          >
            <defs>
              <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
                <stop offset="50%" stopColor="black" stopOpacity={0} />
                <stop offset="70%" stopColor={ringColor} stopOpacity={ringOpacity} />
                <stop offset="85%" stopColor={ringColor} stopOpacity={ringOpacity * 0.3} />
                <stop offset="100%" stopColor="black" stopOpacity={0} />
              </radialGradient>
            </defs>
            <ellipse
              cx="960"
              cy="540"
              rx={ringRadius}
              ry={ringRadius * 0.65}
              fill={`url(#${gradId})`}
            />
            {particles.map((p, i) => {
              const pProgress = Math.max(0, eventProgress - p.delay);
              const pOpacity = ringOpacity * interpolate(
                pProgress,
                [0, 0.3, 1],
                [0, 1, 0.2],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );
              const scatter = 1 + pProgress * 0.5;
              const px = 960 + (p.x - 960) * scatter;
              const py = 540 + (p.y - 540) * scatter;
              return (
                <circle
                  key={i}
                  cx={px}
                  cy={py}
                  r={p.r * (0.5 + intensity * 0.5)}
                  fill={ringColor}
                  opacity={pOpacity}
                />
              );
            })}
          </svg>,
        );
        break;
      }

      case "holy_shit": {
        // White flash (2 frames) + particle burst + warm afterglow
        const flashProgress = frame - m.peakFrame;
        let flashOpacity = 0;
        if (flashProgress === 0) flashOpacity = 0.3;
        else if (flashProgress === 1) flashOpacity = 0.15;

        if (flashOpacity > 0) {
          // Particle burst on flash frames: 30-50 bright circles
          const burstCount = Math.round(30 + intensity * 20);
          const burstParticles = scatterParticles(
            burstCount,
            m.frameStart + 7777,
            960, 540,
            900, 540,
          );

          layers.push(
            <svg
              key={`holyshit-flash-${m.frameStart}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
              viewBox="0 0 1920 1080"
              preserveAspectRatio="none"
            >
              <rect
                x="0"
                y="0"
                width="1920"
                height="1080"
                fill="white"
                opacity={flashOpacity}
              />
              {burstParticles.map((p, i) => {
                const burstPhase = flashProgress === 0 ? 1 : 0.5;
                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={p.r * burstPhase * (0.6 + intensity * 0.4)}
                    fill="white"
                    opacity={flashOpacity * 0.7}
                  />
                );
              })}
            </svg>,
          );
        }

        // Warm glow aftermath with SVG radialGradient
        const afterGlow = interpolate(
          frame,
          [m.peakFrame + 2, m.frameEnd],
          [0.4, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
        );
        if (afterGlow > 0.01) {
          const glowGradId = `holyshit-glow-grad-${m.frameStart}`;
          const afterHue = (hue + 30) % 360;
          const coreColor = hslToRgb(afterHue, 90, glowLightness);
          const edgeColor = hslToRgb(afterHue, 70, glowLightness * 0.5);

          layers.push(
            <svg
              key={`holyshit-glow-${m.frameStart}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
              viewBox="0 0 1920 1080"
              preserveAspectRatio="none"
            >
              <defs>
                <radialGradient id={glowGradId} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={coreColor} stopOpacity={afterGlow * intensity} />
                  <stop offset="50%" stopColor={edgeColor} stopOpacity={afterGlow * intensity * 0.4} />
                  <stop offset="80%" stopColor="black" stopOpacity={0} />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width="1920" height="1080" fill={`url(#${glowGradId})`} />
            </svg>,
          );
        }
        break;
      }

      case "singalong": {
        // Warm amber rising glow with SVG gradient and screen blend
        const warmHue = 35; // amber
        const opacity = momentOpacity * 0.25 * intensity;
        const glowHeight = 30 + momentOpacity * 20; // 30-50% from bottom
        const gradId = `singalong-grad-${m.frameStart}`;
        const warmColor = hslToRgb(warmHue, 75, glowLightness);
        const midWarmColor = hslToRgb(warmHue, 60, glowLightness * 0.7);
        // glowHeight is 30-50 (percent), map to SVG y1/y2 coordinates
        const glowTop = 1080 * (1 - (glowHeight + 20) / 100);
        const glowMid = 1080 * (1 - glowHeight / 100);

        layers.push(
          <svg
            key={`singalong-${m.frameStart}`}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              mixBlendMode: "screen",
            }}
            viewBox="0 0 1920 1080"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={warmColor} stopOpacity={opacity} />
                <stop offset={`${glowHeight}%`} stopColor={midWarmColor} stopOpacity={opacity * 0.3} />
                <stop offset={`${glowHeight + 20}%`} stopColor="black" stopOpacity={0} />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="1920" height="1080" fill={`url(#${gradId})`} />
          </svg>,
        );
        break;
      }
    }
  }

  if (layers.length === 0) return null;

  return <>{layers}</>;
};
