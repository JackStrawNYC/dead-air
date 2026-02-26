/**
 * EraGrade — per-era post-processing via CSS filters.
 * Wraps children in a div with era-appropriate color grading.
 * Consumes era from ShowContext. No-op when era is unset.
 *
 * Era aesthetics:
 *   primal      (1965-67) — warm sepia, heavy desaturation, 16mm home movie
 *   classic     (1968-79) — neutral warm, gentle saturation, golden-era clarity
 *   hiatus      (1975-76) — cool muted tones, slight blue push
 *   touch_of_grey (1987-90) — vivid saturated, punchy contrast, stadium-era
 *   revival     (1991-95) — clean neutral, subtle warmth
 */

import React, { useMemo } from "react";
import { useShowContext } from "../data/ShowContext";

type Era = "primal" | "classic" | "hiatus" | "touch_of_grey" | "revival";

interface EraGradeStyle {
  /** CSS filter string */
  filter: string;
  /** Optional background tint (applied via mix-blend-mode overlay) */
  tintColor?: string;
  tintOpacity?: number;
}

const ERA_GRADES: Record<Era, EraGradeStyle> = {
  primal: {
    filter: "saturate(0.55) sepia(0.25) contrast(1.05) brightness(0.95)",
    tintColor: "rgba(140, 90, 40, 0.06)",
    tintOpacity: 0.06,
  },
  classic: {
    filter: "saturate(0.85) contrast(1.02) brightness(1.0)",
    tintColor: "rgba(180, 140, 80, 0.03)",
    tintOpacity: 0.03,
  },
  hiatus: {
    filter: "saturate(0.65) contrast(1.0) brightness(0.92) hue-rotate(-5deg)",
    tintColor: "rgba(60, 80, 120, 0.04)",
    tintOpacity: 0.04,
  },
  touch_of_grey: {
    filter: "saturate(1.25) contrast(1.1) brightness(1.02)",
  },
  revival: {
    filter: "saturate(0.9) contrast(1.0) brightness(1.0)",
  },
};

interface Props {
  children: React.ReactNode;
}

export const EraGrade: React.FC<Props> = ({ children }) => {
  const ctx = useShowContext();

  const gradeStyle = useMemo((): EraGradeStyle | null => {
    if (!ctx?.era) return null;
    return ERA_GRADES[ctx.era as Era] ?? null;
  }, [ctx?.era]);

  if (!gradeStyle) {
    return <>{children}</>;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        filter: gradeStyle.filter,
      }}
    >
      {children}
      {gradeStyle.tintColor && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: gradeStyle.tintColor,
            mixBlendMode: "overlay",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};
