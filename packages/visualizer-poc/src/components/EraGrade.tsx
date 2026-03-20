/**
 * EraGrade — per-era film stock emulation via CSS filters + overlays.
 *
 * Now powered by the film-stock system for authentic era-specific looks:
 *   primal (1965-67)      — Kodachrome 16mm: sepia warmth, crushed blacks, heavy grain
 *   classic (1968-79)     — Ektachrome E-6: vivid, green shadows, warm highlights
 *   brent_era (1980-86)   — Betacam SP: clean, slight pink, minimal grain
 *   hiatus (1975-76)      — 16mm Reversal: cool muted, blue push
 *   touch_of_grey (1987-90) — U-Matic/Betacam: punchy, saturated, neon-capable
 *   revival (1991-95)     — DV/Hi8: neutral, mild noise, taper aesthetic
 *
 * Applies 3 layers:
 *   1. CSS filter (brightness, contrast, sepia, saturation)
 *   2. Shadow tint overlay (multiply blend)
 *   3. Highlight tint overlay (screen blend)
 *   4. Mid-tone tint overlay (overlay blend)
 */

import React, { useMemo } from "react";
import { useShowContext } from "../data/ShowContext";
import { getFilmStock, type FilmStockProfile } from "../utils/film-stock";

interface Props {
  children: React.ReactNode;
}

export const EraGrade: React.FC<Props> = ({ children }) => {
  const ctx = useShowContext();

  const filmStock = useMemo((): FilmStockProfile | null => {
    if (!ctx?.era) return null;
    return getFilmStock(ctx.era);
  }, [ctx?.era]);

  if (!filmStock) {
    return <>{children}</>;
  }

  const hasFilter = filmStock.cssFilter.length > 0;
  const hasTint = filmStock.tintOpacity > 0;
  const hasShadow = filmStock.shadowTintOpacity > 0;
  const hasHighlight = filmStock.highlightTintOpacity > 0;
  const hasBlackLift = filmStock.blackPointLift > 0;

  // No visual effects at all — pass through
  if (!hasFilter && !hasTint && !hasShadow && !hasHighlight && !hasBlackLift) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        filter: hasFilter ? filmStock.cssFilter : undefined,
      }}
    >
      {children}

      {/* Shadow tint: affects dark areas via multiply blend */}
      {hasShadow && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, transparent 30%, ${filmStock.shadowTint} 100%)`,
            mixBlendMode: "multiply",
            pointerEvents: "none",
            opacity: filmStock.shadowTintOpacity,
          }}
        />
      )}

      {/* Highlight tint: affects bright areas via screen blend */}
      {hasHighlight && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(ellipse at 50% 40%, ${filmStock.highlightTint}, transparent 70%)`,
            mixBlendMode: "screen",
            pointerEvents: "none",
            opacity: filmStock.highlightTintOpacity,
          }}
        />
      )}

      {/* Mid-tone tint: overall color cast via overlay blend */}
      {hasTint && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: filmStock.tintColor,
            mixBlendMode: "overlay",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Black point lift: lifted blacks (milky shadows) characteristic of older film */}
      {hasBlackLift && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `rgba(30, 28, 25, ${filmStock.blackPointLift.toFixed(3)})`,
            mixBlendMode: "lighten",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
