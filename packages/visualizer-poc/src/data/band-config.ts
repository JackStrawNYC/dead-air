/**
 * Band Configuration — artist-specific settings for portable visualizer.
 *
 * Everything that makes this "Dead Air" instead of a generic visualizer
 * lives here. Swap this config to visualize any artist's live shows.
 *
 * To adapt for a new artist:
 *   1. Create a new config object following the BandConfig interface
 *   2. Update ACTIVE_CONFIG to point to the new config
 *   3. Artist-specific overlay components should be conditionally imported
 *      based on config.overlayTags.culture
 */

import type { EraPreset } from "./era-presets";

// ─── Band Config Interface ───

export interface EraDefinition {
  id: string;
  label: string;
  yearRange: [number, number];
  /** CSS filter string for color grading */
  colorGrade: string;
  /** Bloom accent color */
  bloomColor: string;
  /** Typography style preset */
  typography: {
    fontFamily: string;
    fontWeight: number;
    letterSpacing: string;
    textTransform?: "uppercase" | "none";
    color: string;
    subtitleColor: string;
  };
}

export interface BandConfig {
  /** Default band name */
  bandName: string;
  /** Key musician names (for quote attribution, component labels) */
  musicians: string[];
  /** Era definitions for visual theming */
  eras: EraDefinition[];
  /** Known segue pairs — song title arrays that flow into each other */
  sacredSegues: string[][];
  /** Famous lyrics for overlay display */
  lyrics: string[];
  /** Musician quotes for overlay display */
  quotes: Array<{ text: string; attribution: string }>;
  /** Venue types relevant to this artist's era */
  venueTypes: string[];
  /** Tag name for artist-specific culture overlays */
  overlayTags: {
    /** Tag used in overlay registry for artist-specific components */
    culture: string;
  };
  /** Song titles that indicate jam/improv segments (e.g., Drums, Space) */
  jamSegmentTitles: string[];
  /** Overlay names eligible for accent (beat-synced flash) treatment */
  accentEligibleOverlays: string[];
  /** Hero overlays — the most visually impactful character/reactive components */
  heroOverlays: string[];
  /** Scene-specific overlay bias: boosts overlays that pair well with specific shaders */
  sceneOverlayBias: Partial<Record<string, Record<string, number>>>;
  /** Per-era visual presets keyed by era ID */
  eraPresets: Record<string, EraPreset>;
}

// ─── Grateful Dead Configuration ───

export const GRATEFUL_DEAD_CONFIG: BandConfig = {
  bandName: "Grateful Dead",
  musicians: ["Jerry Garcia", "Bob Weir", "Phil Lesh", "Bill Kreutzmann", "Mickey Hart", "Keith Godchaux", "Donna Godchaux", "Brent Mydland", "Vince Welnick"],

  eras: [
    {
      id: "primal",
      label: "Primal Dead",
      yearRange: [1965, 1967],
      colorGrade: "sepia(0.15) contrast(1.05) brightness(0.95)",
      bloomColor: "rgba(255, 180, 100, 0.08)",
      typography: {
        fontFamily: "'Playfair Display', Georgia, serif",
        fontWeight: 700,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
        color: "rgba(255, 220, 180, 0.9)",
        subtitleColor: "rgba(255, 220, 180, 0.5)",
      },
    },
    {
      id: "classic",
      label: "Classic Era",
      yearRange: [1968, 1979],
      colorGrade: "saturate(1.05) brightness(1.02)",
      bloomColor: "rgba(255, 200, 150, 0.06)",
      typography: {
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "none",
        color: "rgba(255, 255, 255, 0.9)",
        subtitleColor: "rgba(255, 255, 255, 0.45)",
      },
    },
    {
      id: "hiatus",
      label: "Hiatus Years",
      yearRange: [1975, 1976],
      colorGrade: "saturate(0.85) brightness(0.95) hue-rotate(-5deg)",
      bloomColor: "rgba(150, 180, 255, 0.06)",
      typography: {
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 300,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "rgba(200, 210, 230, 0.85)",
        subtitleColor: "rgba(200, 210, 230, 0.4)",
      },
    },
    {
      id: "touch_of_grey",
      label: "Touch of Grey Era",
      yearRange: [1987, 1990],
      colorGrade: "saturate(1.15) contrast(1.08)",
      bloomColor: "rgba(255, 100, 200, 0.08)",
      typography: {
        fontFamily: "'Inter', system-ui, sans-serif",
        fontWeight: 500,
        letterSpacing: "0.03em",
        textTransform: "none",
        color: "rgba(255, 255, 255, 0.92)",
        subtitleColor: "rgba(255, 255, 255, 0.5)",
      },
    },
    {
      id: "revival",
      label: "Revival",
      yearRange: [1991, 1995],
      colorGrade: "saturate(1.0) brightness(1.0)",
      bloomColor: "rgba(200, 200, 200, 0.05)",
      typography: {
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        fontWeight: 400,
        letterSpacing: "0.03em",
        textTransform: "none",
        color: "rgba(240, 240, 240, 0.88)",
        subtitleColor: "rgba(240, 240, 240, 0.42)",
      },
    },
  ],

  sacredSegues: [
    ["Scarlet Begonias", "Fire on the Mountain"],
    ["St. Stephen", "Not Fade Away"],
    ["China Cat Sunflower", "I Know You Rider"],
    ["Playing in the Band", "Uncle John's Band"],
    ["Help on the Way", "Slipknot!", "Franklin's Tower"],
    ["The Other One", "Wharf Rat"],
    ["Estimated Prophet", "Eyes of the World"],
    ["Drums", "Space"],
    ["Drums / Space", "Morning Dew"],
    ["Not Fade Away", "Going Down the Road Feeling Bad"],
  ],

  lyrics: [
    "What a long strange trip it's been",
    "Ripple in still water",
    "Once in a while you get shown the light",
    "Shall we go, you and I, while we can?",
    "Nothing left to do but smile, smile, smile",
    "Driving that train, high on cocaine",
    "Wake up to find out that you are the eyes of the world",
    "Let there be songs to fill the air",
    "If I knew the way, I would take you home",
    "Without love in the dream it will never come true",
    "Sometimes the light's all shining on me",
    "Such a long long time to be gone, and a short time to be there",
    "Believe it if you need it, if you don't just pass it on",
    "Into the closing of my mind",
    "Let it be known there is a fountain that was not made by the hands of men",
    "Going where the wind don't blow so strange",
    "There is a road, no simple highway",
    "In the land of the dark the ship of the sun is drawn by the Grateful Dead",
    "Comes a time when the blind man takes your hand",
    "The bus came by and I got on, that's when it all began",
    "Ain't no time to hate, barely time to wait",
    "Saint Stephen with a rose, in and out of the garden he goes",
  ],

  quotes: [
    { text: "Somebody has to do something, and it's just incredibly pathetic that it has to be us.", attribution: "Jerry Garcia" },
    { text: "I don't know why, the Grateful Dead is like bad beer or something — people just keep coming back for more.", attribution: "Jerry Garcia" },
    { text: "We're like licorice. Not everybody likes licorice, but the people who like licorice really like licorice.", attribution: "Jerry Garcia" },
    { text: "You don't want to be the best at what you do, you want to be the only one.", attribution: "Jerry Garcia" },
    { text: "What we do is as American as lynch mobs. America has always been a complex place.", attribution: "Jerry Garcia" },
    { text: "Too much of a good thing is just about right.", attribution: "Jerry Garcia" },
    { text: "Once in a while you can get shown the light in the strangest of places if you look at it right.", attribution: "Jerry Garcia" },
    { text: "The music never stopped.", attribution: "Bob Weir" },
  ],

  venueTypes: ["theater", "arena", "amphitheater", "festival", "club", "ballroom"],

  overlayTags: {
    culture: "dead-culture",
  },

  jamSegmentTitles: ["Drums", "Space", "Drums / Space", "Drums/Space"],

  accentEligibleOverlays: [
    // Reactive overlays
    "ParticleExplosion",
    "WallOfSound",
    "LaserShow",
    "LightningBoltOverlay",
    "EmberRise",
    "ThirteenPointBolt",
    // Dead iconography — pulse on Garcia's attack, Bobby's chords
    "BreathingStealie",
    "StealYourFaceOff",
    "SkullKaleidoscope",
    "BearParade",
    "SkeletonBand",
    "VWBusParade",
    "SkeletonRoses",
    // Distortion
    "VHSGlitch",
  ],

  heroOverlays: [
    // Core Dead icons — the ones everyone recognizes
    "BreathingStealie", "ThirteenPointBolt", "StealYourFaceOff",
    // Marching parades — the signature animated moments
    "BearParade", "SkeletonBand", "MarchingTerrapins",
    // Characters
    "Bertha", "JerryGuitar",
  ],

  sceneOverlayBias: {
    cosmic_voyage:    { CosmicStarfield: +0.25, DarkStarPortal: +0.20, SacredGeometry: +0.15 },
    concert_lighting: { LaserShow: +0.25, WallOfSound: +0.20, ParticleExplosion: +0.15 },
    deep_ocean:       { Fireflies: +0.20, BoxOfRain: +0.15, CosmicStarfield: +0.15 },
    inferno:          { EmberRise: +0.25, ThirteenPointBolt: +0.20, ParticleExplosion: +0.15 },
    aurora:           { CosmicStarfield: +0.20, SacredGeometry: +0.15, Fireflies: +0.15 },
    tie_dye:          { TieDyeWash: +0.25, LavaLamp: +0.20, ChinaCatSunflower: +0.15 },
    liquid_light:     { TieDyeWash: +0.20, FractalZoom: +0.15, MandalaGenerator: +0.15 },
    vintage_film:     { VHSGlitch: +0.20, RoseOverlay: +0.15, SkeletonRoses: +0.10 },
    crystal_cavern:   { SacredGeometry: +0.25, FractalZoom: +0.20, DarkStarPortal: +0.15 },
    cosmic_dust:      { CosmicStarfield: +0.25, Fireflies: +0.20, SacredGeometry: +0.15 },
    oil_projector:    { LavaLamp: +0.20, TieDyeWash: +0.15, MandalaGenerator: +0.15 },
    particle_nebula:  { CosmicStarfield: +0.20, DarkStarPortal: +0.15 },
    stark_minimal:    { RoseOverlay: +0.15, BreathingStealie: +0.10 },
    lo_fi_grain:      { VHSGlitch: +0.20, RoseOverlay: +0.15, SkeletonRoses: +0.10 },
    plasma_field:     { TieDyeWash: +0.20, LavaLamp: +0.15, ChinaCatSunflower: +0.15 },
    voronoi_flow:     { SacredGeometry: +0.20, MandalaGenerator: +0.15, Fireflies: +0.10 },
    electric_arc:     { LightningBoltOverlay: +0.25, ParticleExplosion: +0.20, EmberRise: +0.15 },
    morphogenesis:    { SacredGeometry: +0.20, DarkStarPortal: +0.15, CosmicStarfield: +0.10 },
    stained_glass:    { SacredGeometry: +0.20, RoseOverlay: +0.15, Fireflies: +0.10 },
    neural_web:       { LightningBoltOverlay: +0.20, SacredGeometry: +0.15, DarkStarPortal: +0.10 },
    smoke_rings:      { Fireflies: +0.20, CosmicStarfield: +0.15, BoxOfRain: +0.10 },
    aurora_curtains:  { CosmicStarfield: +0.20, Fireflies: +0.15, SacredGeometry: +0.10 },
    digital_rain:     { VHSGlitch: +0.20, LightningBoltOverlay: +0.15, SkeletonBand: +0.10 },
    lava_flow:        { EmberRise: +0.25, ParticleExplosion: +0.20, ThirteenPointBolt: +0.15 },
    // Phase 9 Wave 1: 16 missing bias entries
    fluid_light:        { TieDyeWash: +0.25, LavaLamp: +0.20, FractalZoom: +0.15 },
    void_light:         { CosmicStarfield: +0.25, DarkStarPortal: +0.20, RoseOverlay: +0.15 },
    fluid_2d:           { TieDyeWash: +0.25, MandalaGenerator: +0.20, LavaLamp: +0.15 },
    spectral_analyzer:  { LaserShow: +0.25, WallOfSound: +0.20, LightningBoltOverlay: +0.15 },
    particle_swarm:     { CosmicStarfield: +0.25, Fireflies: +0.20, SacredGeometry: +0.15 },
    crystalline_growth: { SacredGeometry: +0.25, FractalZoom: +0.20, DarkStarPortal: +0.15 },
    climax_surge:       { ParticleExplosion: +0.25, ThirteenPointBolt: +0.20, WallOfSound: +0.15 },
    kaleidoscope:       { TieDyeWash: +0.25, SacredGeometry: +0.20, MandalaGenerator: +0.15 },
    fractal_zoom:       { FractalZoom: +0.25, SacredGeometry: +0.20, DarkStarPortal: +0.15 },
    sacred_geometry:    { SacredGeometry: +0.25, MandalaGenerator: +0.20, DreamCatcher: +0.15 },
    reaction_diffusion: { SacredGeometry: +0.25, Fireflies: +0.20, DarkStarPortal: +0.15 },
    mandala_engine:     { MandalaGenerator: +0.25, SacredGeometry: +0.20, DreamCatcher: +0.15 },
    fractal_flames:     { EmberRise: +0.25, ThirteenPointBolt: +0.20, ParticleExplosion: +0.15 },
    feedback_recursion: { FractalZoom: +0.25, DarkStarPortal: +0.20, TieDyeWash: +0.15 },
    truchet_tiling:     { SacredGeometry: +0.25, PenroseTiling: +0.20, MandalaGenerator: +0.15 },
    diffraction_rings:  { CosmicStarfield: +0.25, SacredGeometry: +0.20, Fireflies: +0.15 },
    // Phase 9 Wave 2: 8 new shader bias entries
    mycelium_network:   { SacredGeometry: +0.25, Fireflies: +0.20, DarkStarPortal: +0.15 },
    ink_wash:           { RoseOverlay: +0.25, Fireflies: +0.20, SacredGeometry: +0.15 },
    coral_reef:         { Fireflies: +0.25, BoxOfRain: +0.20, CosmicStarfield: +0.15 },
    solar_flare:        { EmberRise: +0.25, ParticleExplosion: +0.20, ThirteenPointBolt: +0.15 },
    galaxy_spiral:      { CosmicStarfield: +0.25, DarkStarPortal: +0.20, SacredGeometry: +0.15 },
    warp_field:         { DarkStarPortal: +0.25, CosmicStarfield: +0.20, SacredGeometry: +0.15 },
    signal_decay:       { VHSGlitch: +0.25, LightningBoltOverlay: +0.20, SkeletonBand: +0.15 },
    databend:           { VHSGlitch: +0.25, ParticleExplosion: +0.20, LightningBoltOverlay: +0.15 },
  },

  eraPresets: {
    primal: {
      preferredModes: ["liquid_light", "oil_projector", "vintage_film", "feedback_recursion", "plasma_field", "stained_glass", "aurora_curtains", "smoke_rings", "ink_wash", "coral_reef"],
      excludedModes: ["concert_lighting", "crystal_cavern", "electric_arc", "digital_rain", "neural_web", "databend", "signal_decay"],
      excludedOverlays: ["LaserShow"],
      grainIntensity: 1.8,
      colorTempShift: 8,
      saturationOffset: -0.05,
    },
    classic: {
      preferredModes: ["liquid_light", "tie_dye", "aurora", "oil_projector", "fractal_flames", "feedback_recursion", "plasma_field", "voronoi_flow", "stained_glass", "smoke_rings", "aurora_curtains", "lava_flow", "mycelium_network", "coral_reef", "galaxy_spiral", "solar_flare"],
      excludedModes: ["stark_minimal"],
      excludedOverlays: [],
      grainIntensity: 1.2,
      colorTempShift: 5,
      saturationOffset: 0,
    },
    hiatus: {
      preferredModes: ["concert_lighting", "cosmic_voyage", "deep_ocean", "diffraction_rings", "morphogenesis", "voronoi_flow", "digital_rain", "neural_web", "signal_decay", "databend", "warp_field"],
      excludedModes: ["oil_projector"],
      excludedOverlays: [],
      grainIntensity: 1.0,
      colorTempShift: -5,
      saturationOffset: -0.03,
    },
    touch_of_grey: {
      preferredModes: ["concert_lighting", "inferno", "tie_dye", "fractal_flames", "electric_arc", "plasma_field", "neural_web", "lava_flow", "digital_rain", "databend", "signal_decay", "solar_flare"],
      excludedModes: ["oil_projector"],
      excludedOverlays: [],
      grainIntensity: 0.6,
      colorTempShift: 0,
      saturationOffset: 0.05,
    },
    revival: {
      preferredModes: [],
      excludedModes: [],
      excludedOverlays: [],
      grainIntensity: 0.4,
      colorTempShift: 0,
      saturationOffset: 0,
    },
  },
};

// ─── Active Config ───

/** The currently active band configuration. Change this to support other artists. */
export const BAND_CONFIG: BandConfig = GRATEFUL_DEAD_CONFIG;

// ─── Helper accessors ───

/** Get era definition by ID, or undefined if not found */
export function getEra(eraId: string): EraDefinition | undefined {
  return BAND_CONFIG.eras.find((e) => e.id === eraId);
}

/** Get all era IDs as a union type */
export function getEraIds(): string[] {
  return BAND_CONFIG.eras.map((e) => e.id);
}

/** Check if a segue pair is "sacred" (well-known) */
export function isSacredSegue(fromTitle: string, toTitle: string): boolean {
  const fromLower = fromTitle.toLowerCase();
  const toLower = toTitle.toLowerCase();
  return BAND_CONFIG.sacredSegues.some((pair) => {
    for (let i = 0; i < pair.length - 1; i++) {
      if (pair[i].toLowerCase() === fromLower && pair[i + 1].toLowerCase() === toLower) {
        return true;
      }
    }
    return false;
  });
}

/** Get a random lyric (deterministic given a seed) */
export function getSeededLyric(seed: number): string {
  return BAND_CONFIG.lyrics[Math.abs(seed) % BAND_CONFIG.lyrics.length];
}

/** Get a random quote (deterministic given a seed) */
export function getSeededQuote(seed: number): { text: string; attribution: string } {
  return BAND_CONFIG.quotes[Math.abs(seed) % BAND_CONFIG.quotes.length];
}

/** Check if a song title indicates a jam/improv segment (e.g., Drums, Space) */
export function isJamSegmentTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return BAND_CONFIG.jamSegmentTitles.some(t => lower.includes(t.toLowerCase()));
}
