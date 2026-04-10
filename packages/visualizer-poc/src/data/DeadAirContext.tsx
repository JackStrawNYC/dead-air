/**
 * DeadAirContext — dead-air factor for shader/overlay dead-air awareness.
 * 0.0 = music playing, 1.0 = fully in dead air (applause/tuning).
 * AudioReactiveCanvas reads this to slow dynamicTime during dead air.
 */
import React, { createContext, useContext } from "react";

const DeadAirCtx = createContext<number>(0);

export const DeadAirProvider: React.FC<{ value: number; children: React.ReactNode }> = ({ value, children }) => (
  <DeadAirCtx.Provider value={value}>{children}</DeadAirCtx.Provider>
);

export function useDeadAirFactor(): number {
  return useContext(DeadAirCtx);
}
