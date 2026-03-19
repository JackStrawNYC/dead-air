/**
 * HeroPermittedContext — gates hero icon firing from show-narrative level.
 *
 * SongVisualizer provides the heroPermitted flag (from visual narrator).
 * AudioReactiveCanvas consumes it to gate hero icon computation.
 * This avoids threading props through 60+ scene files.
 */

import React, { createContext, useContext } from "react";

const Ctx = createContext<boolean>(true);

export const HeroPermittedProvider: React.FC<{
  permitted: boolean;
  children: React.ReactNode;
}> = ({ permitted, children }) => (
  <Ctx.Provider value={permitted}>{children}</Ctx.Provider>
);

export function useHeroPermitted(): boolean {
  return useContext(Ctx);
}
