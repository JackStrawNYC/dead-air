/**
 * TempoContext — per-song tempo factor for overlay animation speed.
 *
 * Provides a normalized tempo factor (tempo / 120) so overlays can scale
 * their animation speeds with the song's BPM. 120 BPM = 1.0x (neutral).
 * Slow songs (~75 BPM) → 0.63x, fast songs (~155 BPM) → 1.29x.
 *
 * Follows the same provider/hook pattern as SongPaletteContext.
 */

import React, { createContext, useContext, useMemo } from "react";

const DEFAULT_TEMPO = 120;
const TempoContext = createContext<number>(1); // tempoFactor default = 1.0

interface Props {
  tempo?: number;
  children: React.ReactNode;
}

export const TempoProvider: React.FC<Props> = ({ tempo, children }) => {
  const factor = useMemo(() => (tempo ?? DEFAULT_TEMPO) / DEFAULT_TEMPO, [tempo]);
  return <TempoContext.Provider value={factor}>{children}</TempoContext.Provider>;
};

/** Returns tempo / 120 — multiply animation speeds by this. */
export function useTempoFactor(): number {
  return useContext(TempoContext);
}
