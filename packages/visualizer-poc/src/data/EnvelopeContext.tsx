/**
 * EnvelopeContext — provides EnergyEnvelope's computed brightness/saturation/hue
 * to GLSL shader components (FullscreenQuad, MultiPassQuad, DualShaderQuad).
 *
 * Fixes the dynamic range conflict: CSS brightness ran BEFORE GLSL lifted blacks,
 * crushing quiet passages to near-black. Moving these modulations into GLSL
 * ensures lifted blacks runs AFTER envelope brightness.
 */

import React, { createContext, useContext } from "react";

export interface EnvelopeValues {
  /** Energy-reactive brightness multiplier (0.02–1.55) */
  brightness: number;
  /** Combined saturation multiplier from counterpoint, harmonic, modal, IT, etc. */
  saturation: number;
  /** Total hue shift in degrees */
  hue: number;
}

const DEFAULT: EnvelopeValues = { brightness: 1, saturation: 1, hue: 0 };

const EnvelopeCtx = createContext<EnvelopeValues>(DEFAULT);

export const EnvelopeProvider: React.FC<{
  value: EnvelopeValues;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <EnvelopeCtx.Provider value={value}>{children}</EnvelopeCtx.Provider>
);

export function useEnvelopeValues(): EnvelopeValues {
  return useContext(EnvelopeCtx);
}
