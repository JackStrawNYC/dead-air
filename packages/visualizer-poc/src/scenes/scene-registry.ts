/**
 * Scene Registry — pluggable visual mode system.
 *
 * Maps VisualMode IDs to React scene components. New scenes can be
 * registered here without touching SceneRouter's logic.
 *
 * Each scene receives the standard props:
 *   - frames: audio analysis frame data
 *   - sections: section boundaries
 *   - palette: color palette
 *   - tempo: BPM
 *   - style: CSS overrides
 *
 * To add a new scene:
 *   1. Create the scene component in src/scenes/
 *   2. Register it in SCENE_REGISTRY below
 *   3. Add the mode ID to VisualMode type in types.ts
 */

import React from "react";
import type { EnhancedFrameData, SectionBoundary, ColorPalette, VisualMode } from "../data/types";
import { getEraPreset } from "../data/era-presets";

// ─── Scene Component Interface ───

export interface SceneProps {
  frames: EnhancedFrameData[];
  sections?: SectionBoundary[];
  palette?: ColorPalette;
  tempo?: number;
  style?: React.CSSProperties;
  /** Normalized jam density from jam evolution system (0-1, default 0.5) */
  jamDensity?: number;
}

export type SceneComponent = React.ComponentType<SceneProps>;

export interface SceneRegistryEntry {
  /** The React component for this scene */
  Component: SceneComponent;
  /** Energy level this scene works best at */
  energyAffinity: "low" | "mid" | "high" | "any";
  /** Complementary mode for auto-variety */
  complement: VisualMode;
}

// ─── Lazy imports for code splitting ───

import { LiquidLightScene } from "./LiquidLightScene";
import { ParticleNebulaScene } from "./ParticleNebulaScene";
import { ConcertLightingScene } from "./ConcertLightingScene";
import { LoFiGrainScene } from "./LoFiGrainScene";
import { StarkMinimalScene } from "./StarkMinimalScene";
import { OilProjectorScene } from "./OilProjectorScene";
import { TieDyeScene } from "./TieDyeScene";
import { CosmicDustScene } from "./CosmicDustScene";
import { VintageFilmScene } from "./VintageFilmScene";
import { CosmicVoyageScene } from "./CosmicVoyageScene";
import { InfernoScene } from "./InfernoScene";
import { DeepOceanScene } from "./DeepOceanScene";
import { AuroraScene } from "./AuroraScene";
import { CrystalCavernScene } from "./CrystalCavernScene";

// ─── Scene Registry ───

export const SCENE_REGISTRY: Record<VisualMode, SceneRegistryEntry> = {
  liquid_light: {
    Component: LiquidLightScene,
    energyAffinity: "high",
    complement: "oil_projector",
  },
  oil_projector: {
    Component: OilProjectorScene,
    energyAffinity: "mid",
    complement: "liquid_light",
  },
  concert_lighting: {
    Component: ConcertLightingScene,
    energyAffinity: "high",
    complement: "lo_fi_grain",
  },
  lo_fi_grain: {
    Component: LoFiGrainScene,
    energyAffinity: "mid",
    complement: "concert_lighting",
  },
  particle_nebula: {
    Component: ParticleNebulaScene,
    energyAffinity: "low",
    complement: "cosmic_dust",
  },
  stark_minimal: {
    Component: StarkMinimalScene,
    energyAffinity: "low",
    complement: "liquid_light",
  },
  tie_dye: {
    Component: TieDyeScene,
    energyAffinity: "high",
    complement: "vintage_film",
  },
  cosmic_dust: {
    Component: CosmicDustScene,
    energyAffinity: "low",
    complement: "particle_nebula",
  },
  vintage_film: {
    Component: VintageFilmScene,
    energyAffinity: "mid",
    complement: "tie_dye",
  },
  cosmic_voyage: {
    Component: CosmicVoyageScene,
    energyAffinity: "low",
    complement: "concert_lighting",
  },
  inferno: {
    Component: InfernoScene,
    energyAffinity: "high",
    complement: "cosmic_voyage",
  },
  deep_ocean: {
    Component: DeepOceanScene,
    energyAffinity: "low",
    complement: "inferno",
  },
  aurora: {
    Component: AuroraScene,
    energyAffinity: "low",
    complement: "tie_dye",
  },
  crystal_cavern: {
    Component: CrystalCavernScene,
    energyAffinity: "low",
    complement: "inferno",
  },
};

// ─── Helper functions ───

/** Get the complement mode for auto-variety */
export function getComplement(mode: VisualMode): VisualMode {
  return SCENE_REGISTRY[mode]?.complement ?? mode;
}

/** Get modes appropriate for a given energy level, with optional era filtering.
 *  Era preferred modes get 3x weight, excluded modes are removed.
 *  Song's defaultMode is always included as fallback. */
export function getModesForEnergy(energy: "low" | "mid" | "high", era?: string, defaultMode?: VisualMode): VisualMode[] {
  let modes = (Object.entries(SCENE_REGISTRY) as [VisualMode, SceneRegistryEntry][])
    .filter(([, entry]) => entry.energyAffinity === energy || entry.energyAffinity === "any")
    .map(([mode]) => mode);

  const eraPreset = era ? getEraPreset(era) : null;
  if (eraPreset) {
    // Filter out excluded modes
    modes = modes.filter((m) => !eraPreset.excludedModes.includes(m));

    // 3x weight for preferred modes
    const weighted: VisualMode[] = [];
    for (const m of modes) {
      weighted.push(m);
      if (eraPreset.preferredModes.includes(m)) {
        weighted.push(m, m); // 2 more copies = 3x total
      }
    }
    modes = weighted;
  }

  // Guarantee defaultMode is always in the pool to prevent empty pools
  if (defaultMode && modes.length === 0) {
    modes = [defaultMode];
  }

  return modes;
}

/** Render a scene by mode ID */
export function renderScene(
  mode: VisualMode,
  props: SceneProps,
): React.ReactNode {
  const entry = SCENE_REGISTRY[mode];
  if (!entry) {
    // Fallback to liquid_light for unknown modes
    const fallback = SCENE_REGISTRY.liquid_light;
    return React.createElement(fallback.Component, props);
  }
  return React.createElement(entry.Component, props);
}

/** Get all registered mode IDs */
export function getRegisteredModes(): VisualMode[] {
  return Object.keys(SCENE_REGISTRY) as VisualMode[];
}
