/**
 * Venue-type visual profiles — maps venueType to visual modifiers so arena
 * shows look huge and expansive, club shows feel intimate and gritty, etc.
 *
 * Follows the show-film-stock pattern: a pure function returns a struct of
 * multipliers consumed by FullscreenQuad/MultiPassQuad (GLSL uniforms) and
 * SongVisualizer (overlay density).
 */

export interface VenueProfile {
  vignette: number;           // 0-1: edge darkening (0=none, 1=heavy)
  bloomMult: number;          // 0.6-1.4: multiplied onto uShowBloom
  warmth: number;             // -0.1 to +0.1: additive to uShowWarmth
  overlayDensityMult: number; // 0.5-1.5: multiplied into density chain
  grainMult: number;          // 0.6-1.4: multiplied onto uShowGrain
}

const VENUE_PROFILES: Record<string, VenueProfile> = {
  arena:        { vignette: 0.3, bloomMult: 1.25, warmth: -0.03, overlayDensityMult: 1.3, grainMult: 0.8 },
  amphitheater: { vignette: 0.5, bloomMult: 1.10, warmth:  0.02, overlayDensityMult: 1.0, grainMult: 0.9 },
  theater:      { vignette: 0.7, bloomMult: 0.90, warmth:  0.05, overlayDensityMult: 0.8, grainMult: 1.1 },
  ballroom:     { vignette: 0.6, bloomMult: 0.95, warmth:  0.04, overlayDensityMult: 0.9, grainMult: 1.0 },
  club:         { vignette: 0.8, bloomMult: 0.80, warmth:  0.08, overlayDensityMult: 0.6, grainMult: 1.3 },
  festival:     { vignette: 0.2, bloomMult: 1.30, warmth: -0.05, overlayDensityMult: 1.4, grainMult: 0.7 },
};

const DEFAULT_PROFILE: VenueProfile = {
  vignette: 0.5,
  bloomMult: 1.0,
  warmth: 0,
  overlayDensityMult: 1.0,
  grainMult: 1.0,
};

export function getVenueProfile(venueType: string): VenueProfile {
  return VENUE_PROFILES[venueType] ?? DEFAULT_PROFILE;
}
