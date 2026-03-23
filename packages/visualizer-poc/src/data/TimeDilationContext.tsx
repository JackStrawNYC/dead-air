/**
 * TimeDilationContext — shader time multiplier for Space transcendence.
 * Space_ambient → 0.25x, space_textural → 0.4x, normal → 1.0x.
 */
import React, { createContext, useContext } from "react";

const TimeDilationCtx = createContext<number>(1.0);

export const TimeDilationProvider: React.FC<{ value: number; children: React.ReactNode }> = ({ value, children }) => (
  <TimeDilationCtx.Provider value={value}>{children}</TimeDilationCtx.Provider>
);

export function useTimeDilation(): number {
  return useContext(TimeDilationCtx);
}
