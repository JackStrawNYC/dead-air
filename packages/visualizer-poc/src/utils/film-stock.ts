/**
 * Film Stock System — era-authentic film emulation.
 *
 * Each Dead era had a characteristic look based on the recording
 * and projection technology of the time:
 *
 *   Primal (1965-67): Kodachrome 16mm
 *     → Heavy grain, crushed blacks, orange-shifted highlights
 *     → The acid tests were shot on reversal film
 *
 *   Classic (1968-79): Ektachrome
 *     → Vivid but natural, slightly green shadows, warm highlights
 *     → The golden era of live Dead filming
 *
 *   Brent Era (1980-86): Early Betacam
 *     → Clean electronic look, slight pink cast, less grain
 *     → The MTV generation's concert footage
 *
 *   Touch of Grey (1987-90): 3/4" U-Matic / Betacam SP
 *     → Punchy, neon-capable, high saturation, sharp
 *     → Stadium-era Dead, bigger production
 *
 *   Revival (1991-95): DV / Hi8
 *     → Neutral, mild noise, slightly soft
 *     → Taper-era, bootleg aesthetic
 *
 * Returns CSS filter + overlay parameters that EraGrade applies.
 */

export interface FilmStockProfile {
  /** Film stock name for debug/display */
  name: string;
  /** CSS filter string (brightness, contrast, sepia, saturate, hue-rotate) */
  cssFilter: string;
  /** Overlay tint color (rgba) */
  tintColor: string;
  /** Overlay tint opacity */
  tintOpacity: number;
  /** Secondary shadow tint (applied as gradient overlay) */
  shadowTint: string;
  /** Shadow tint opacity */
  shadowTintOpacity: number;
  /** Highlight tint (applied as screen blend) */
  highlightTint: string;
  /** Highlight tint opacity */
  highlightTintOpacity: number;
  /** Grain intensity multiplier (1.0 = standard) */
  grainMult: number;
  /** Black point lift (0 = true black, 0.05 = lifted/milky) */
  blackPointLift: number;
}

const FILM_STOCKS: Record<string, FilmStockProfile> = {
  primal: {
    name: "Kodachrome 16mm",
    cssFilter: "sepia(0.08) contrast(1.12) brightness(0.93)",
    tintColor: "rgba(180, 120, 50, 0.06)",
    tintOpacity: 0.06,
    shadowTint: "rgba(40, 25, 15, 0.12)",
    shadowTintOpacity: 0.12,
    highlightTint: "rgba(255, 200, 120, 0.04)",
    highlightTintOpacity: 0.04,
    grainMult: 2.0,
    blackPointLift: 0.03,
  },
  classic: {
    name: "Ektachrome E-6",
    cssFilter: "",
    tintColor: "rgba(200, 160, 80, 0.03)",
    tintOpacity: 0.03,
    shadowTint: "rgba(30, 50, 40, 0.06)",
    shadowTintOpacity: 0.06,
    highlightTint: "rgba(255, 230, 180, 0.03)",
    highlightTintOpacity: 0.03,
    grainMult: 1.3,
    blackPointLift: 0.01,
  },
  brent_era: {
    name: "Betacam SP",
    cssFilter: "saturate(1.05) contrast(1.02)",
    tintColor: "rgba(220, 180, 200, 0.03)",
    tintOpacity: 0.03,
    shadowTint: "rgba(50, 30, 50, 0.04)",
    shadowTintOpacity: 0.04,
    highlightTint: "rgba(255, 240, 245, 0.02)",
    highlightTintOpacity: 0.02,
    grainMult: 0.7,
    blackPointLift: 0.005,
  },
  touch_of_grey: {
    name: "U-Matic / Betacam SP",
    cssFilter: "saturate(1.15) contrast(1.10) brightness(1.02)",
    tintColor: "rgba(0, 0, 0, 0)",
    tintOpacity: 0,
    shadowTint: "rgba(20, 20, 40, 0.05)",
    shadowTintOpacity: 0.05,
    highlightTint: "rgba(255, 220, 255, 0.03)",
    highlightTintOpacity: 0.03,
    grainMult: 0.5,
    blackPointLift: 0,
  },
  revival: {
    name: "DV / Hi8",
    cssFilter: "saturate(0.97) contrast(1.01) brightness(0.99)",
    tintColor: "rgba(180, 180, 160, 0.02)",
    tintOpacity: 0.02,
    shadowTint: "rgba(40, 40, 35, 0.04)",
    shadowTintOpacity: 0.04,
    highlightTint: "rgba(240, 240, 230, 0.02)",
    highlightTintOpacity: 0.02,
    grainMult: 0.8,
    blackPointLift: 0.01,
  },
  hiatus: {
    name: "16mm Reversal",
    cssFilter: "saturate(0.88) contrast(1.06) brightness(0.96) hue-rotate(-3deg)",
    tintColor: "rgba(80, 100, 140, 0.05)",
    tintOpacity: 0.05,
    shadowTint: "rgba(30, 40, 60, 0.08)",
    shadowTintOpacity: 0.08,
    highlightTint: "rgba(200, 210, 240, 0.03)",
    highlightTintOpacity: 0.03,
    grainMult: 1.5,
    blackPointLift: 0.02,
  },
};

/** Get the film stock profile for a given era. Returns null for unknown eras. */
export function getFilmStock(era: string): FilmStockProfile | null {
  return FILM_STOCKS[era] ?? null;
}

/** Get all available film stock names (for debug/display) */
export function getAllFilmStocks(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [era, stock] of Object.entries(FILM_STOCKS)) {
    result[era] = stock.name;
  }
  return result;
}
