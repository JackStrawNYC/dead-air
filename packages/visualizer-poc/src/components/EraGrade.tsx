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
    // Raised saturation 0.55→0.70 to prevent compound grayscale with EnergyEnvelope
    filter: "saturate(0.70) sepia(0.20) contrast(1.03) brightness(0.97)",
    tintColor: "rgba(140, 90, 40, 0.05)",
    tintOpacity: 0.05,
  },
  classic: {
    filter: "saturate(0.90) contrast(1.02) brightness(1.0)",
    tintColor: "rgba(180, 140, 80, 0.02)",
    tintOpacity: 0.02,
  },
  hiatus: {
    // Removed hue-rotate — EnergyEnvelope no longer stacks hue-rotate
    filter: "saturate(0.75) contrast(1.0) brightness(0.95)",
    tintColor: "rgba(60, 80, 120, 0.04)",
    tintOpacity: 0.04,
  },
  touch_of_grey: {
    // Reduced contrast to prevent compound with EnergyEnvelope
    filter: "saturate(1.15) contrast(1.06) brightness(1.01)",
  },
  revival: {
    filter: "saturate(0.95) contrast(1.0) brightness(1.0)",
  },
};

interface Props {
  children: React.ReactNode;
}

export const EraGrade: React.FC<Props> = ({ children }) => {
  const ctx = useShowContext();

  const gradeStyle = useMemo((): EraGradeStyle | null => {
    if (!ctx?.era || !(ctx.era in ERA_GRADES)) return null;
    return ERA_GRADES[ctx.era as Era];
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
